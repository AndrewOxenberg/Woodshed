// The player engine: owns alphaTab and every piece of playback state. Plan §3.1 to §3.10, §12.2.
// React reads it through subscribe/getState; nothing in here touches React.
import * as alphaTab from '@coderline/alphatab';
import { transposeScoreJson } from '../lib/transpose.ts';
import { prettyChord } from '../lib/chords.ts';
import { DETECTED_ID, detectedChords } from '../lib/tabSheet.ts';
import { concatFloat32, encodeWav, toInt16 } from '../lib/audio.ts';
import type { Prefs } from '../prefs.ts';

export const MIN_SPEED = 0.15;
export const MAX_SPEED = 1.75;
const SAMPLE_RATE = 44100;
const QUARTER = 960;
/** The speeds a YouTube video can play at (§4.2), inside Woodshed's range. */
const RECORDING_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75];

export interface TrackState {
  index: number;
  name: string;
  percussion: boolean;
  tuning: string;
  mute: boolean;
  solo: boolean;
  volume: number;
}

export interface LoopState {
  on: boolean;
  startBar: number;
  endBar: number;
}

export interface EngineState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  title: string;
  artist: string;
  tracks: TrackState[];
  /** The track on the page, which the lead volume and the M key act on. */
  trackIndex: number;
  /** The track picked for the song. Autoswitch may show another one for a while (§17.2). */
  home: number;
  /** Tracks drawn as well as the lead one. Plan §15.2. */
  also: number[];
  barCount: number;
  /** The song starts with a pickup bar, which the tab numbers 0. */
  pickup: boolean;
  playing: boolean;
  /** 0 to 1 while the sounds download, 1 once the player can play. */
  soundProgress: number;
  playerReady: boolean;
  speed: number;
  loop: LoopState;
  countIn: boolean;
  metronome: boolean;
  transpose: number;
  transposeMoved: number;
  transposeRaised: number;
  pitchShift: number;
  masterVolume: number;
  /** Level of the track on screen ("lead") and of every other track ("backing"). Plan §13.2. */
  leadVolume: number;
  backingVolume: number;
  /** Bumps whenever the tab is laid out again, so overlays can re-measure. */
  layout: number;
  /** Bumps whenever a new score is loaded (first load, transpose), so the chords view rebuilds. */
  scoreVersion: number;
  /** A recording is playing along instead of the synth. Plan §18. */
  external: boolean;
  busy: string | null;
}

export interface Position {
  tick: number;
  endTick: number;
  ms: number;
  endMs: number;
  bar: number;
  /** Ticks into the bar being played (that pass of it, with repeats). */
  barTick: number;
  bpm: number;
}

interface BarSpan {
  start: number;
  end: number;
  index: number;
}

export interface ScoreColors {
  ink: string;
  muted: string;
  line: string;
}


/** Detected chord names: green, readable on light and dark pages. Plan §16.4. */
const DETECTED_COLOR = '#2f9e5b';

/** Stems under the tab. With the sheet staff above, alphaTab drops them by itself. Plan §15.1, §15.3. */
function rhythmMode(prefs: Prefs) {
  if (!prefs.showRhythm) return alphaTab.TabRhythmMode.Hidden;
  return prefs.view === 'both' ? alphaTab.TabRhythmMode.Automatic : alphaTab.TabRhythmMode.ShowWithBars;
}

type Listener = () => void;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

/** Delays cursor movement by the latency setting while playing. Plan §3.6. */
function delayedCursor(delay: () => number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inner: any = new alphaTab.ToNextBeatAnimatingCursorHandler();
  const later = (fn: () => void) => {
    const ms = delay();
    if (ms > 0) window.setTimeout(fn, ms);
    else fn();
  };
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return {
    onAttach: (c: any) => inner.onAttach(c),
    onDetach: (c: any) => inner.onDetach(c),
    placeBarCursor: (...a: any[]) => later(() => inner.placeBarCursor(...a)),
    placeBeatCursor: (...a: any[]) => later(() => inner.placeBeatCursor(...a)),
    transitionBeatCursor: (...a: any[]) => later(() => inner.transitionBeatCursor(...a)),
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

export class Engine {
  readonly api: alphaTab.AlphaTabApi;
  private state: EngineState;
  private position: Position = { tick: 0, endTick: 0, ms: 0, endMs: 0, bar: 0, barTick: 0, bpm: 120 };
  private listeners = new Set<Listener>();
  private positionListeners = new Set<Listener>();
  private originalJson = '';
  private bars: BarSpan[] = [];
  private barTempo: number[] = [];
  private pendingTick: number | null = null;
  private restartLoop = false;
  /** A count-in is sounding right now. */
  private countingIn = false;
  /** A count-in was paused halfway; alphaTab would finish it silently before the song moves. */
  private staleCountIn = false;
  private playAfterLoad = false;
  private followPaused = false;
  private lastSystem = -1;
  private prefs: Prefs;
  private destroyed = false;
  /** Beats carrying a detected chord name, to clear them again. */
  private detectedBeats = new Set<alphaTab.model.Beat>();
  /** Notes each track plays in each bar, for autoswitch. [track][bar] */
  private barNotes: number[][] = [];
  /** Bar index -> track to show there, from the bar menu (§17.2). */
  private switches = new Map<number, number>();
  /** Start of every bar played, in seconds, for the recording playing along (§18.2). */
  private recordingPoints: number[] | null = null;

  constructor(
    private readonly host: HTMLElement,
    private readonly scroller: HTMLElement,
    prefs: Prefs,
    colors: ScoreColors,
  ) {
    this.prefs = prefs;
    this.state = {
      status: 'loading', error: null, title: '', artist: '', tracks: [], trackIndex: 0, home: 0, also: [], barCount: 0, pickup: false,
      playing: false, soundProgress: 0, playerReady: false, speed: 1,
      loop: { on: false, startBar: 0, endBar: 0 }, countIn: false, metronome: false,
      transpose: 0, transposeMoved: 0, transposeRaised: 0, pitchShift: 0, masterVolume: 0.7,
      leadVolume: prefs.leadVolume, backingVolume: prefs.backingVolume, layout: 0, scoreVersion: 0, external: false, busy: null,
    };

    this.api = new alphaTab.AlphaTabApi(host, {
      core: { fontDirectory: '/font/', enableLazyLoading: true },
      display: {
        // Every staff type allowed; each staff's own switches pick tab, notation or both (§19.2).
        staveProfile: alphaTab.StaveProfile.Default,
        layoutMode: alphaTab.LayoutMode.Page,
        scale: prefs.scale,
        stretchForce: prefs.spacing,
        barsPerRow: prefs.fourBarsPerLine ? 4 : -1,
        resources: this.resources(colors),
      },
      notation: {
        rhythmMode: rhythmMode(prefs),
        elements: {
          scoreTitle: false, scoreSubTitle: false, scoreArtist: false, scoreAlbum: false,
          scoreWords: false, scoreMusic: false, scoreWordsAndMusic: false, scoreCopyright: false,
          trackNames: false, effectDynamics: prefs.showDynamics,
        },
      },
      player: {
        playerMode: alphaTab.PlayerMode.EnabledSynthesizer,
        soundFont: '/soundfont/sonivox.sf2',
        scrollMode: alphaTab.ScrollMode.Off,
        enableCursor: true,
        enableAnimatedBeatCursor: true,
        enableElementHighlighting: true,
        enableSeekToClick: true,
        enablePlaybackRangeSelection: false,
        resetPlaybackRangeOnClick: false,
        positionUpdateIntervalInMilliseconds: 40,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.api as any).customCursorHandler = delayedCursor(() => (this.state.playing ? this.prefs.latencyMs : 0));

    const api = this.api;
    api.error.on((e) => this.set({ status: 'error', error: e?.message ?? 'Something went wrong showing this tab.' }));
    api.scoreLoaded.on((score) => this.onScoreLoaded(score));
    api.postRenderFinished.on(() => {
      this.lastSystem = -1;
      // A finished drawing clears an earlier drawing error (§19.2: it used to stick until reload).
      this.set({ layout: this.state.layout + 1, status: 'ready', error: null });
    });
    api.soundFontLoad.on((e) => this.set({ soundProgress: e.total ? e.loaded / e.total : 0 }));
    api.playerReady.on(() => this.set({ playerReady: true, soundProgress: 1 }));
    api.midiLoaded.on(() => this.onMidiLoaded());
    api.playerStateChanged.on((e) => {
      const playing = e.state === alphaTab.synth.PlayerState.Playing;
      this.set({ playing });
      if (!playing && this.restartLoop) {
        this.restartLoop = false;
        this.replayLoopWithCountIn();
      }
    });
    api.playerPositionChanged.on((e) => this.onPosition(e.currentTick, e.endTick, e.currentTime, e.endTime));
    api.playerFinished.on(() => {
      // With "count in between loops" the loop is run by hand so each pass gets its count-in.
      if (this.state.loop.on && this.prefs.countInBetweenLoops) this.restartLoop = true;
    });

    const pauseFollow = () => {
      if (this.state.playing) this.followPaused = true;
    };
    scroller.addEventListener('wheel', pauseFollow, { passive: true });
    scroller.addEventListener('touchmove', pauseFollow, { passive: true });
  }

  // ---- store -------------------------------------------------------------

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  subscribePosition = (l: Listener) => {
    this.positionListeners.add(l);
    return () => this.positionListeners.delete(l);
  };
  getState = () => this.state;
  getPosition = () => this.position;

  private set(patch: Partial<EngineState>) {
    if (this.destroyed) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  // ---- loading -----------------------------------------------------------

  load(bytes: Uint8Array, trackIndex: number, speed = 1, also: number[] = []) {
    try {
      const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes, this.api.settings);
      this.originalJson = alphaTab.model.JsonConverter.scoreToJson(score);
      const index = clamp(trackIndex, 0, score.tracks.length - 1);
      const extra = [...new Set(also)].filter((i) => Number.isInteger(i) && i >= 0 && i < score.tracks.length && i !== index);
      this.state = { ...this.state, trackIndex: index, home: index, also: extra, speed: clamp(speed, MIN_SPEED, MAX_SPEED) };
      this.prepare(score);
      this.api.renderScore(score, this.shown());
    } catch (e) {
      this.set({ status: 'error', error: `This file could not be read as a tab. ${(e as Error).message}` });
    }
  }

  private onScoreLoaded(score: alphaTab.model.Score) {
    const old = this.state.tracks;
    const tracks = score.tracks.map((t, i): TrackState => {
      const staff = t.staves[0];
      const tuning = staff.isPercussion || !staff.tuning.length
        ? ''
        : [...staff.tuning].reverse().map((p) => NOTE_NAMES[((p % 12) + 12) % 12]).join(' ');
      return {
        index: i,
        name: t.name || `Track ${i + 1}`,
        percussion: staff.isPercussion,
        tuning,
        mute: old[i]?.mute ?? false,
        solo: old[i]?.solo ?? false,
        volume: old[i]?.volume ?? 1,
      };
    });
    this.barNotes = score.tracks.map((t) => {
      const n = new Array<number>(score.masterBars.length).fill(0);
      for (const staff of t.staves) for (const bar of staff.bars) for (const voice of bar.voices) for (const beat of voice.beats) {
        if (!beat.isRest) n[bar.index] += beat.notes.filter((x) => !x.isDead).length;
      }
      return n;
    });
    let tempo = score.tempo;
    this.barTempo = score.masterBars.map((mb) => {
      const changes = mb.tempoAutomations;
      if (changes.length) tempo = changes[changes.length - 1].value;
      return tempo;
    });
    this.set({
      title: score.title, artist: score.artist, tracks, barCount: score.masterBars.length,
      pickup: !!score.masterBars[0]?.isAnacrusis, scoreVersion: this.state.scoreVersion + 1,
    });
  }

  private onMidiLoaded() {
    const cache = this.api.tickCache;
    this.bars = cache ? cache.masterBars.map((m) => ({ start: m.start, end: m.end, index: m.masterBar.index })) : [];
    const api = this.api;
    api.playbackSpeed = this.state.speed;
    api.masterVolume = this.state.masterVolume;
    api.countInVolume = this.state.countIn ? 1 : 0;
    api.metronomeVolume = this.state.metronome ? 1 : 0;
    this.applyMixer();
    this.applyLoop();
    if (this.pendingTick !== null) {
      api.tickPosition = this.pendingTick;
      this.pendingTick = null;
    }
    // Loading MIDI resets alphaTab's sequencer, including any leftover count-in.
    this.staleCountIn = false;
    this.countingIn = false;
    // alphaTab hands the player its own sync points right after this event, so ours go in just after.
    if (this.recordingPoints) queueMicrotask(() => this.applySync());
    if (this.playAfterLoad) {
      this.playAfterLoad = false;
      api.play();
    }
  }

  /** Indexes of every track on screen, in file order. */
  private shown(): number[] {
    return [...new Set([this.state.trackIndex, ...this.state.also])].sort((a, b) => a - b);
  }

  /** The multirest switch lives on the score, so every rebuilt score needs it again. Plan §15.3. */
  private setMultirest(score: alphaTab.model.Score) {
    const on = this.prefs.multirest;
    score.stylesheet.multiTrackMultiBarRest = on;
    score.stylesheet.perTrackMultiBarRest = on ? new Set(score.tracks.map((t) => t.index)) : null;
  }

  /**
   * Make the sheet staff read the way players expect. Songsterr's data has no clefs, so
   * every staff arrives with a treble clef at sounding pitch. Plan §15.1.
   */
  private setClefs(score: alphaTab.model.Score) {
    const { Clef } = alphaTab.model;
    for (const track of score.tracks) {
      for (const staff of track.staves) {
        const untouched = staff.bars.every((b) => b.clef === Clef.G2);
        if (staff.isPercussion) {
          if (untouched) for (const bar of staff.bars) bar.clef = Clef.Neutral;
          continue;
        }
        // Songsterr gives every track a tuning, voices and keyboards included, so go by the
        // sound: General MIDI 24 to 39 are the guitars and basses. Anything else stays as written.
        const program = track.playbackInfo.program;
        if (!staff.tuning.length || program < 24 || program > 39) continue;
        // Guitar and bass are written an octave above where they sound.
        if (staff.displayTranspositionPitch === 0) staff.displayTranspositionPitch = -12;
        // Bass: every open string below C3.
        if (untouched && Math.max(...staff.tuning) < 48) for (const bar of staff.bars) bar.clef = Clef.F4;
      }
    }
  }

  /**
   * Which staves each track draws, for the view. alphaTab's Tab profile draws tab staves only,
   * so a drum track (no tab) alone on the page had nothing to draw and alphaTab crashed (§19.2).
   * Instead each staff says what it shows: drums always drum notation, fretted tracks tab,
   * notation or both, anything without strings notation.
   */
  private setStaves(score: alphaTab.model.Score) {
    const view = this.prefs.view;
    for (const track of score.tracks) {
      for (const staff of track.staves) {
        const fretted = !staff.isPercussion && staff.tuning.length > 0;
        staff.showSlash = false;
        staff.showNumbered = false;
        staff.showTablature = fretted && view !== 'sheet';
        staff.showStandardNotation = !fretted || view === 'sheet' || view === 'both';
      }
    }
  }

  /** Everything a freshly built score needs before it is drawn. */
  private prepare(score: alphaTab.model.Score) {
    this.setStaves(score);
    this.setMultirest(score);
    this.setClefs(score);
    this.applyDetected(score);
  }

  /**
   * Detect chords: green names above the lead track's tab, in bars that name no chord of their
   * own. Cleared and worked out again whenever the lead track or the notes change. Plan §16.4.
   */
  private applyDetected(score: alphaTab.model.Score) {
    for (const beat of this.detectedBeats) {
      beat.chordId = null;
      beat.style = undefined;
    }
    this.detectedBeats.clear();
    for (const track of score.tracks) {
      for (const staff of track.staves) {
        if (staff.chords) for (const id of [...staff.chords.keys()]) if (id.startsWith(DETECTED_ID)) staff.chords.delete(id);
      }
    }
    if (!this.prefs.detectChords) return;
    const track = score.tracks[this.state.trackIndex];
    const staff = track?.staves[0];
    if (!staff || staff.isPercussion) return;
    const green = alphaTab.model.Color.fromJson(DETECTED_COLOR)!;
    for (const e of detectedChords(track, score)) {
      const bar = staff.bars[e.bar];
      if (!bar || bar.voices.some((v) => v.beats.some((b) => b.hasChord))) continue;
      const beat = bar.voices[0].beats.find((b) => b.playbackStart >= e.offset && b.graceType === alphaTab.model.GraceType.None);
      if (!beat) continue;
      const name = prettyChord(e.name);
      const id = DETECTED_ID + name;
      if (!staff.hasChord(id)) {
        const chord = new alphaTab.model.Chord();
        chord.name = name;
        chord.showDiagram = false;
        staff.addChord(id, chord);
      }
      beat.chordId = id;
      // Colours only the band above the staff (chord names and other beat marks), not the notes.
      beat.style = new alphaTab.model.BeatStyle();
      beat.style.colors.set(alphaTab.model.BeatSubElement.Effects, green);
      this.detectedBeats.add(beat);
    }
  }

  /** Run fn on the score as written, without detected names (for downloads). */
  private withoutDetected<T>(fn: () => T): T {
    const score = this.api.score;
    if (!score || !this.prefs.detectChords) return fn();
    this.prefs = { ...this.prefs, detectChords: false };
    this.applyDetected(score);
    try {
      return fn();
    } finally {
      this.prefs = { ...this.prefs, detectChords: true };
      this.applyDetected(score);
    }
  }

  private track(i: number) {
    return this.api.score!.tracks[i];
  }

  /** A track's own slider times the lead or backing slider. */
  private level(t: TrackState): number {
    return t.volume * (t.index === this.state.trackIndex ? this.state.leadVolume : this.state.backingVolume);
  }

  private applyVolumes() {
    if (!this.api.score) return;
    for (const t of this.state.tracks) this.api.changeTrackVolume([this.track(t.index)], this.level(t));
  }

  setLeadVolume(v: number) {
    this.set({ leadVolume: clamp(v, 0, 1) });
    this.applyVolumes();
  }

  setBackingVolume(v: number) {
    this.set({ backingVolume: clamp(v, 0, 1) });
    this.applyVolumes();
  }

  private applyMixer() {
    if (!this.api.score) return;
    for (const t of this.state.tracks) {
      const track = this.track(t.index);
      this.api.changeTrackMute([track], t.mute);
      this.api.changeTrackSolo([track], t.solo);
      this.api.changeTrackVolume([track], this.level(t));
    }
    const pitched = this.state.tracks.filter((t) => !t.percussion).map((t) => this.track(t.index));
    this.api.changeTrackTranspositionPitch(pitched, this.state.pitchShift);
  }

  // ---- transport ---------------------------------------------------------

  private onPosition(tick: number, endTick: number, ms: number, endMs: number) {
    // alphaTab reports no positions during a count-in, so the first one means it is over.
    if (this.state.playing) this.countingIn = false;
    const passIndex = this.passIndexAt(tick);
    const pass = this.bars[passIndex];
    const bar = pass?.index ?? 0;
    // alphaTab's times are already wall-clock times at the current speed (measured in §12.3).
    this.position = { tick, endTick, ms, endMs, bar, barTick: tick - (pass?.start ?? 0), bpm: (this.barTempo[bar] ?? 120) * this.state.speed };
    this.positionListeners.forEach((l) => l());
    if (this.state.playing && this.prefs.autoswitch) this.autoswitch(passIndex, tick);
    this.follow(bar, false);
  }

  /** Which pass through a bar a playback tick falls in (a repeated bar has one per repeat). */
  private passIndexAt(tick: number): number {
    const bars = this.bars;
    let lo = 0;
    let hi = bars.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (bars[mid].start <= tick) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  private passAt(tick: number): BarSpan | undefined {
    return this.bars[this.passIndexAt(tick)];
  }

  private barAt(tick: number): number {
    return this.passAt(tick)?.index ?? 0;
  }

  /** Put the cursor this many ticks into a bar (its first pass). For chords on the chord sheet. */
  seekBar(bar: number, offset = 0) {
    const span = this.span(bar);
    if (span) this.seekTick(span.start + offset);
  }

  /** Tick span of a bar the first time it is played. */
  private span(barIndex: number): BarSpan | undefined {
    return this.bars.find((b) => b.index === barIndex);
  }

  play() {
    if (!this.state.playerReady) return;
    this.followPaused = false;
    this.lastSystem = -1;
    if (this.state.external) {
      // A recording has no count-in; the video starts at once.
      this.api.play();
      return;
    }
    if (this.staleCountIn && !this.state.countIn) {
      // Reloading the MIDI is the only way to drop the half-played count-in. Found in §12.3.
      this.staleCountIn = false;
      this.pendingTick = this.api.tickPosition;
      this.playAfterLoad = true;
      this.api.loadMidiForScore();
      return;
    }
    this.staleCountIn = false;
    this.api.countInVolume = this.state.countIn ? 1 : 0;
    this.countingIn = this.state.countIn;
    this.api.play();
  }

  pause() {
    this.restartLoop = false;
    if (this.countingIn) {
      this.countingIn = false;
      this.staleCountIn = true;
    }
    this.api.pause();
  }

  playPause() {
    if (this.state.playing) this.pause();
    else this.play();
  }

  /** Loop start when looping, otherwise the top of the song. */
  toStart() {
    const span = this.state.loop.on ? this.span(this.state.loop.startBar) : undefined;
    this.seekTick(span?.start ?? 0);
  }

  seekTick(tick: number) {
    this.api.tickPosition = Math.max(0, Math.round(tick));
    this.followPaused = false;
    this.follow(this.barAt(tick), true);
  }

  seekFraction(f: number) {
    this.seekTick(clamp(f, 0, 1) * this.position.endTick);
  }

  /** Move the cursor one beat left (-1) or right (+1). */
  stepBeat(dir: 1 | -1) {
    const cache = this.api.tickCache;
    if (!cache) return;
    const found = cache.findBeat(new Set([this.state.trackIndex]), this.api.tickPosition);
    let beat = found?.beat ?? null;
    if (!beat) return;
    do {
      beat = dir > 0 ? beat.nextBeat : beat.previousBeat;
    } while (beat && beat.graceType !== alphaTab.model.GraceType.None);
    if (beat) this.seekTick(cache.getBeatStart(beat));
  }

  /**
   * Where a bar is drawn. A bar folded into a multirest has no place of its own,
   * so it answers with the multirest that covers it. Plan §15.3.
   */
  drawnBar(index: number) {
    const lookup = this.api.boundsLookup;
    if (!lookup) return null;
    const exact = lookup.findMasterBarByIndex(index);
    if (exact) return exact;
    let best: alphaTab.rendering.MasterBarBounds | null = null;
    for (const system of lookup.staffSystems) {
      for (const bar of system.bars) {
        if (bar.index <= index && (!best || bar.index > best.index)) best = bar;
      }
    }
    return best;
  }

  /** Move the cursor to the bar above (-1) or below (+1) on the page. */
  stepLine(dir: 1 | -1) {
    const lookup = this.api.boundsLookup;
    const here = this.drawnBar(this.position.bar);
    const system = here?.staffSystemBounds;
    if (!lookup || !here || !system) return;
    const target = lookup.staffSystems[system.index + dir];
    if (!target) return;
    const x = here.realBounds.x + here.realBounds.w / 2;
    const bar = target.bars.reduce((best, b) =>
      Math.abs(b.realBounds.x + b.realBounds.w / 2 - x) < Math.abs(best.realBounds.x + best.realBounds.w / 2 - x) ? b : best);
    const span = this.span(bar.index);
    if (span) this.seekTick(span.start);
  }

  setSpeed(speed: number) {
    let s = clamp(Math.round(speed * 100) / 100, MIN_SPEED, MAX_SPEED);
    const old = this.state.speed;
    if (this.state.external) {
      // YouTube plays only its own rates (§4.2): step to the next one in the direction asked.
      const up = RECORDING_RATES.filter((r) => r > old + 1e-9);
      const down = RECORDING_RATES.filter((r) => r < old - 1e-9);
      s = s > old ? (up[0] ?? old) : s < old ? (down[down.length - 1] ?? old) : old;
      if (Math.abs(speed - old) > 0.2) s = RECORDING_RATES.reduce((a, b) => (Math.abs(b - speed) < Math.abs(a - speed) ? b : a));
    }
    this.api.playbackSpeed = s;
    this.set({ speed: s });
    // No position event arrives while paused, so rescale the clock here.
    this.onPosition(this.position.tick, this.position.endTick, (this.position.ms * old) / s, (this.position.endMs * old) / s);
  }

  /** Tempo of the bar under the cursor at 100% speed. */
  baseBpm() {
    return this.barTempo[this.position.bar] ?? 120;
  }

  setCountIn(on: boolean) {
    this.api.countInVolume = on ? 1 : 0;
    this.set({ countIn: on });
  }

  setMetronome(on: boolean) {
    this.api.metronomeVolume = on ? 1 : 0;
    this.set({ metronome: on });
  }

  setMasterVolume(v: number) {
    this.api.masterVolume = clamp(v, 0, 1);
    this.set({ masterVolume: clamp(v, 0, 1) });
  }

  // ---- loop --------------------------------------------------------------

  toggleLoop() {
    if (this.state.loop.on) this.setLoop({ ...this.state.loop, on: false });
    else this.setLoop({ on: true, startBar: this.position.bar, endBar: this.position.bar });
  }

  setLoop(loop: LoopState) {
    const last = Math.max(0, this.state.barCount - 1);
    const startBar = clamp(loop.startBar, 0, last);
    const endBar = clamp(loop.endBar, startBar, last);
    this.set({ loop: { on: loop.on, startBar, endBar } });
    this.applyLoop();
  }

  /** Shift + arrows: move the loop's right edge by one bar. */
  moveLoopEnd(dir: 1 | -1) {
    const { loop } = this.state;
    if (loop.on) this.setLoop({ ...loop, endBar: loop.endBar + dir });
  }

  private applyLoop() {
    const { loop } = this.state;
    const first = this.span(loop.startBar);
    const last = this.span(loop.endBar);
    if (!loop.on || !first || !last) {
      this.api.playbackRange = null;
      this.api.isLooping = false;
      return;
    }
    this.api.playbackRange = { startTick: first.start, endTick: last.end };
    this.api.isLooping = !this.prefs.countInBetweenLoops;
  }

  private replayLoopWithCountIn() {
    const first = this.span(this.state.loop.startBar);
    if (!first || !this.state.loop.on) return;
    this.api.tickPosition = first.start;
    this.api.countInVolume = 1;
    this.countingIn = true;
    this.api.play();
    this.api.countInVolume = this.state.countIn ? 1 : 0;
  }

  /** The bar under a point of the tab, for dragging loop handles. Clamps to the nearest bar. */
  barAtPoint(x: number, y: number): number | null {
    const systems = this.api.boundsLookup?.staffSystems;
    if (!systems?.length) return null;
    const system = systems.reduce((best, s) => {
      const d = (b: typeof s) => (y < b.realBounds.y ? b.realBounds.y - y : Math.max(0, y - (b.realBounds.y + b.realBounds.h)));
      return d(s) < d(best) ? s : best;
    });
    if (!system.bars.length) return null;
    const bar = system.bars.find((b) => x >= b.realBounds.x && x < b.realBounds.x + b.realBounds.w)
      ?? (x < system.bars[0].realBounds.x ? system.bars[0] : system.bars[system.bars.length - 1]);
    return bar.index;
  }

  // ---- tracks ------------------------------------------------------------

  /** Pick the song's track. */
  showTrack(index: number) {
    if (!this.api.score || !this.track(index)) return;
    if (index === this.state.trackIndex) {
      if (index !== this.state.home) this.set({ home: index });
      return;
    }
    this.set({ home: index, also: this.state.also.filter((i) => i !== index) });
    this.showPart(index);
  }

  /** Put a track on the page without changing the song's pick (autoswitch). */
  private showPart(index: number) {
    if (!this.api.score || !this.track(index)) return;
    this.set({ trackIndex: index });
    this.applyVolumes(); // a different track is the lead now
    if (this.prefs.detectChords) this.applyDetected(this.api.score);
    this.api.renderTracks(this.shown().map((i) => this.track(i)));
  }

  // ---- track autoswitch (§17.2) --------------------------------------------

  private family(i: number): string | null {
    const t = this.api.score?.tracks[i];
    if (!t || t.staves[0]?.isPercussion) return null;
    const p = t.playbackInfo.program;
    return p >= 24 && p <= 31 ? 'guitar' : p >= 32 && p <= 39 ? 'bass' : 'other';
  }

  /** Tracks that can carry the picked track's part: the same kind of instrument, never drums. */
  partTracks(): number[] {
    const kind = this.family(this.state.home);
    if (!kind) return [this.state.home];
    return this.state.tracks.map((t) => t.index).filter((i) => this.family(i) === kind);
  }

  /** The track to show in a bar: the menu's choice, else the picked track if it plays, else the busiest other. */
  partFor(bar: number): number {
    const { home, trackIndex } = this.state;
    const group = this.partTracks();
    const forced = this.switches.get(bar);
    if (forced !== undefined && group.includes(forced)) return forced;
    const n = (i: number) => this.barNotes[i]?.[bar] ?? 0;
    if (n(home) > 0) return home;
    const playing = group.filter((i) => i !== home && n(i) > 0);
    if (!playing.length) return group.includes(trackIndex) ? trackIndex : home; // nobody plays: stay put
    if (playing.includes(trackIndex)) return trackIndex;
    return playing.reduce((a, b) => (n(b) > n(a) ? b : a));
  }

  /** Bar menu choices for this song, bar index -> track. */
  setSwitches(map: Record<string, number> | undefined) {
    this.switches = new Map(Object.entries(map ?? {}).map(([bar, track]) => [Number(bar), track]));
  }

  private autoswitch(passIndex: number, tick: number) {
    const pass = this.bars[passIndex];
    const score = this.api.score;
    if (!pass || !score) return;
    // Switch a beat early, so the redrawn page is up when the bar starts (§17.2).
    const beat = (QUARTER * 4) / score.masterBars[pass.index].timeSignatureDenominator;
    const next = this.bars[passIndex + 1];
    const target = next && tick >= pass.end - beat ? this.partFor(next.index) : this.partFor(pass.index);
    if (target !== this.state.trackIndex) this.showPart(target);
  }

  /** Draw another track under the lead one, or stop drawing it. Plan §15.2. */
  setAlso(index: number, on: boolean) {
    if (!this.api.score || index === this.state.trackIndex || !this.track(index)) return;
    const also = this.state.also.filter((i) => i !== index);
    if (on) also.push(index);
    this.set({ also: also.sort((a, b) => a - b) });
    this.api.renderTracks(this.shown().map((i) => this.track(i)));
  }

  private patchTrack(index: number, patch: Partial<TrackState>) {
    this.set({ tracks: this.state.tracks.map((t) => (t.index === index ? { ...t, ...patch } : t)) });
  }

  setMute(index: number, mute: boolean) {
    this.patchTrack(index, { mute });
    this.api.changeTrackMute([this.track(index)], mute);
  }

  setSolo(index: number, solo: boolean) {
    this.patchTrack(index, { solo });
    this.api.changeTrackSolo([this.track(index)], solo);
  }

  setVolume(index: number, volume: number) {
    this.patchTrack(index, { volume });
    this.applyVolumes();
  }

  // ---- transpose and pitch -----------------------------------------------

  /** Rewrite frets and chord names. Plan §3.4. */
  setTranspose(semitones: number) {
    const n = clamp(Math.round(semitones), -12, 12);
    if (n === this.state.transpose || !this.originalJson) return;
    if (this.state.playing) this.pause();
    const obj = JSON.parse(this.originalJson);
    const result = transposeScoreJson(obj, n);
    const score = alphaTab.model.JsonConverter.jsObjectToScore(obj, this.api.settings);
    this.pendingTick = this.api.tickPosition;
    this.set({ transpose: n, transposeMoved: result.moved, transposeRaised: result.raised });
    this.prepare(score);
    this.api.renderScore(score, this.shown());
  }

  /** Change the sounding pitch only; the tab stays as written. */
  setPitchShift(semitones: number) {
    const n = clamp(Math.round(semitones), -12, 12);
    this.state = { ...this.state, pitchShift: n };
    this.applyMixer();
    this.set({});
  }

  // ---- playing along with a recording (§18) --------------------------------

  /**
   * Play along with a recording: points are the start of every bar played, in seconds; the
   * handler drives the video. Null for both goes back to the synth.
   */
  useRecording(points: number[] | null, handler: alphaTab.synth.IExternalMediaHandler | null) {
    // The video's box can close after the page has (back to the library): nothing left to switch.
    if (this.destroyed) return;
    const external = !!points && !!handler;
    if (this.state.playing) this.pause();
    this.recordingPoints = external ? points : null;
    const settings = this.api.settings.player;
    const mode = external ? alphaTab.PlayerMode.EnabledExternalMedia : alphaTab.PlayerMode.EnabledSynthesizer;
    if (settings.playerMode !== mode) {
      this.pendingTick = this.api.tickPosition;
      settings.playerMode = mode;
      this.set({ external, playerReady: external });
      this.api.updateSettings();
      if (external) this.attach(handler);
      this.api.loadMidiForScore();
      if (!external) this.applyMixer();
    } else if (external) {
      this.attach(handler);
      this.applySync();
    }
    // Snap the speed to a rate the video has.
    if (external && !RECORDING_RATES.includes(this.state.speed)) this.setSpeed(this.state.speed + 0.5);
  }

  private attach(handler: alphaTab.synth.IExternalMediaHandler | null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const output = (this.api.player as any)?.output;
    if (output && 'handler' in output) output.handler = handler ?? undefined;
  }

  /** The recording's current time, in milliseconds. Called every 50 ms while it plays. */
  mediaTime(ms: number) {
    if (this.destroyed) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.api.player as any)?.output?.updatePosition?.(ms);
  }

  /** One sync point per bar played: which bar, which pass through it, and when it starts. */
  private applySync() {
    const score = this.api.score;
    const points = this.recordingPoints;
    if (!score || !points || !this.bars.length) return;
    const passes = new Map<number, number>();
    const flat: alphaTab.model.FlatSyncPoint[] = [];
    this.bars.forEach((bar, i) => {
      const pass = passes.get(bar.index) ?? 0;
      passes.set(bar.index, pass + 1);
      if (i < points.length) flat.push({ barIndex: bar.index, barOccurence: pass, barPosition: 0, millisecondOffset: Math.round(points[i] * 1000) });
    });
    score.applyFlatSyncPoints(flat);
    this.api.updateSyncPoints();
  }

  // ---- appearance --------------------------------------------------------

  private resources(c: ScoreColors) {
    return { mainGlyphColor: c.ink, secondaryGlyphColor: c.muted, scoreInfoColor: c.ink, staffLineColor: c.line, barSeparatorColor: c.line, barNumberColor: c.muted };
  }

  /** Apply settings that change how the tab is drawn. */
  applyPrefs(prefs: Prefs, colors: ScoreColors) {
    const before = this.prefs;
    this.prefs = prefs;
    const display = this.api.settings.display;
    const res = display.resources;
    const color = (v: string) => alphaTab.model.Color.fromJson(v)!;
    const wanted = this.resources(colors);
    const colorsChanged = res.mainGlyphColor.rgba !== color(wanted.mainGlyphColor).rgba || res.staffLineColor.rgba !== color(wanted.staffLineColor).rgba;
    const bars = prefs.fourBarsPerLine ? 4 : -1;
    const notation = this.api.settings.notation;
    const dynamics = alphaTab.NotationElement.EffectDynamics;
    const multirest = before.multirest !== prefs.multirest;
    const detect = before.detectChords !== prefs.detectChords;
    if (detect && this.api.score) this.applyDetected(this.api.score);
    const view = before.view !== prefs.view;
    if (view && this.api.score) this.setStaves(this.api.score);
    if (colorsChanged || multirest || detect || view || display.scale !== prefs.scale || display.barsPerRow !== bars || display.stretchForce !== prefs.spacing
      || notation.rhythmMode !== rhythmMode(prefs)
      || (notation.elements.get(dynamics) ?? true) !== prefs.showDynamics) {
      for (const [k, v] of Object.entries(wanted)) (res as unknown as Record<string, alphaTab.model.Color>)[k] = color(v);
      display.scale = prefs.scale;
      display.barsPerRow = bars;
      display.stretchForce = prefs.spacing;
      notation.rhythmMode = rhythmMode(prefs);
      notation.elements.set(dynamics, prefs.showDynamics);
      if (multirest && this.api.score) this.setMultirest(this.api.score);
      this.api.updateSettings();
      this.api.render();
    }
    if (before.countInBetweenLoops !== prefs.countInBetweenLoops) this.applyLoop();
    // Autoswitch off: back to the picked track.
    if (before.autoswitch && !prefs.autoswitch && this.state.trackIndex !== this.state.home) this.showPart(this.state.home);
  }

  // ---- follow scrolling (§3.1) ---------------------------------------------

  private follow(bar: number, force: boolean) {
    // The chords view scrolls its own sheet.
    if (this.prefs.view === 'chords') return;
    const lookup = this.api.boundsLookup;
    const system = this.drawnBar(bar)?.staffSystemBounds;
    if (!lookup || !system) return;
    if (!force && (system.index === this.lastSystem || !this.state.playing)) return;
    const previous = lookup.staffSystems[this.lastSystem];
    this.lastSystem = system.index;

    const view = this.scroller;
    const offset = this.host.getBoundingClientRect().top - view.getBoundingClientRect().top + view.scrollTop;
    const top = view.scrollTop;
    const bottom = top + view.clientHeight;
    if (this.followPaused && !force) {
      // Pick following back up only if at least half of the line just left is still on screen.
      if (!previous) return;
      const pTop = offset + previous.realBounds.y;
      const visible = Math.min(bottom, pTop + previous.realBounds.h) - Math.max(top, pTop);
      if (visible < previous.realBounds.h / 2) return;
      this.followPaused = false;
    }
    const next = lookup.staffSystems[system.index + 1] ?? system;
    const lineTop = offset + system.realBounds.y;
    const lineBottom = offset + next.realBounds.y + next.realBounds.h;
    const margin = 16;
    if (lineTop >= top + margin && lineBottom <= bottom) return; // this line and the next are in view
    view.scrollTo({ top: Math.max(0, lineTop - margin), behavior: 'smooth' });
  }

  // ---- export and print (§3.9, §3.10) --------------------------------------

  fileName(ext: string) {
    const name = [this.state.artist, this.state.title].filter(Boolean).join(' - ') || 'tab';
    const key = this.state.transpose ? ` (${this.state.transpose > 0 ? '+' : ''}${this.state.transpose})` : '';
    return `${name}${key}.${ext}`.replace(/[\\/:*?"<>|]/g, '_');
  }

  exportMidi(): Uint8Array {
    const file = new alphaTab.midi.MidiFile();
    const handler = new alphaTab.midi.AlphaSynthMidiFileHandler(file, true);
    new alphaTab.midi.MidiFileGenerator(this.api.score!, this.api.settings, handler).generate();
    return file.toBinary();
  }

  exportGuitarPro(): Uint8Array {
    // Detected names are a suggestion on screen, not part of the song.
    return this.withoutDetected(() => new alphaTab.exporter.Gp7Exporter().export(this.api.score!, this.api.settings));
  }

  /** Render the song offline at 44.1 kHz with the current mixer. Returns interleaved stereo samples. */
  private async renderAudio(label: string): Promise<Float32Array> {
    const options = new alphaTab.synth.AudioExportOptions();
    options.sampleRate = SAMPLE_RATE;
    options.masterVolume = 1;
    options.metronomeVolume = 0;
    const anySolo = this.state.tracks.some((t) => t.solo);
    for (const t of this.state.tracks) {
      const audible = anySolo ? t.solo : !t.mute;
      options.trackVolume.set(t.index, audible ? this.level(t) : 0);
      if (!t.percussion && this.state.pitchShift) options.trackTranspositionPitches.set(t.index, this.state.pitchShift);
    }
    const exporter = await this.api.exportAudio(options);
    const chunks: Float32Array[] = [];
    try {
      for (;;) {
        const chunk = await exporter.render(1000);
        if (!chunk) break;
        chunks.push(chunk.samples);
        const pct = chunk.endTime ? Math.round((chunk.currentTime / chunk.endTime) * 100) : 0;
        this.set({ busy: `${label} ${Math.min(99, pct)}%` });
      }
    } finally {
      exporter.destroy();
    }
    const samples = concatFloat32(chunks);
    // A full band can sum past full scale (1.48 measured on a 13-track song). Scale down instead of clipping.
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
      const v = Math.abs(samples[i]);
      if (v > peak) peak = v;
    }
    if (peak > 0.98) {
      const gain = 0.98 / peak;
      for (let i = 0; i < samples.length; i++) samples[i] *= gain;
    }
    return samples;
  }

  async exportWav(): Promise<Uint8Array> {
    try {
      return encodeWav(await this.renderAudio('Rendering WAV'), SAMPLE_RATE);
    } finally {
      this.set({ busy: null });
    }
  }

  async exportMp3(): Promise<Uint8Array> {
    try {
      const pcm = toInt16(await this.renderAudio('Rendering MP3'));
      const { Mp3Encoder } = await import('@breezystack/lamejs');
      const encoder = new Mp3Encoder(2, SAMPLE_RATE, 192);
      const frames = pcm.length / 2;
      const left = new Int16Array(frames);
      const right = new Int16Array(frames);
      for (let i = 0; i < frames; i++) {
        left[i] = pcm[i * 2];
        right[i] = pcm[i * 2 + 1];
      }
      const parts: Uint8Array[] = [];
      const block = 1152 * 40;
      for (let i = 0; i < frames; i += block) {
        const out = encoder.encodeBuffer(left.subarray(i, i + block), right.subarray(i, i + block));
        if (out.length) parts.push(new Uint8Array(out));
        if (i % (block * 20) === 0) {
          this.set({ busy: `Encoding MP3 ${Math.round((i / frames) * 100)}%` });
          await new Promise((r) => setTimeout(r));
        }
      }
      const tail = encoder.flush();
      if (tail.length) parts.push(new Uint8Array(tail));
      const mp3 = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
      let at = 0;
      for (const p of parts) {
        mp3.set(p, at);
        at += p.length;
      }
      return mp3;
    } finally {
      this.set({ busy: null });
    }
  }

  /** Open the print view: light colors, own scale. */
  print(scale: number) {
    this.api.print(undefined, {
      display: {
        scale,
        barsPerRow: this.prefs.fourBarsPerLine ? 4 : -1,
        resources: this.resources({ ink: '#000000', muted: '#444444', line: '#888888' }),
      },
    });
  }

  destroy() {
    this.destroyed = true;
    this.listeners.clear();
    this.positionListeners.clear();
    this.api.destroy();
  }
}

/** The number the tab prints on a bar: a pickup bar is 0, so the first full bar is 1. */
export function barNumber(index: number, pickup: boolean): number {
  return pickup ? index : index + 1;
}

export function saveBytes(bytes: Uint8Array, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
