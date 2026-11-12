// Songsterr track JSON (format version 8) -> alphaTab score -> Guitar Pro 7 file. Plan §11.
// Only fields seen in real files are mapped. Anything else is reported, never guessed.
import * as alphaTab from '@coderline/alphatab';

const { model: M, exporter, importer, Settings } = alphaTab;

const KNOWN = {
  track: ['name', 'balance', 'volume', 'measures', 'frets', 'tuning', 'strings', 'instrumentId',
    'instrument', 'newLyrics', 'anacrusis', 'partId', 'automations', 'version', 'songId',
    'revisionId', 'tuningFlat', 'title', 'withLyrics', 'sounds', 'trackAutomations', 'voices'],
  measure: ['voices', 'signature', 'tripletFeel', 'rest', 'marker', 'keySignature'],
  voice: ['beats', 'rest'],
  beat: ['notes', 'type', 'rest', 'duration', 'velocity', 'graceNote', 'beamStart', 'beamStop',
    'tuplet', 'tupletStart', 'tupletStop', 'text', 'chord', 'dots', 'letRing', 'pickStroke',
    'brushStroke', 'vibratoWithTremoloBar', 'gradualVelocity', 'tremolo', 'upStroke'],
  note: ['rest', 'fret', 'string', 'tie', 'hp', 'dead', 'staccato', 'bend', 'leftHandVibrato',
    'ghost', 'slide', 'accentuated', 'vibrato', 'trill'],
};

const DURATION = { 1: M.Duration.Whole, 2: M.Duration.Half, 4: M.Duration.Quarter,
  8: M.Duration.Eighth, 16: M.Duration.Sixteenth, 32: M.Duration.ThirtySecond,
  64: M.Duration.SixtyFourth, 128: M.Duration.OneHundredTwentyEighth };
const TRIPLET_FEEL = { '16th': M.TripletFeel.Triplet16th, '8th': M.TripletFeel.Triplet8th };
const DYNAMIC = { ppp: M.DynamicValue.PPP, pp: M.DynamicValue.PP, p: M.DynamicValue.P,
  mp: M.DynamicValue.MP, mf: M.DynamicValue.MF, f: M.DynamicValue.F, ff: M.DynamicValue.FF,
  fff: M.DynamicValue.FFF };
const VIBRATO = { slight: M.VibratoType.Slight, wide: M.VibratoType.Wide };
// A slide either leaves the note (out) or arrives at it (in).
const SLIDE = {
  legato: { out: M.SlideOutType.Legato },
  shift: { out: M.SlideOutType.Shift },
  upwards: { out: M.SlideOutType.OutUp },
  downwards: { out: M.SlideOutType.OutDown },
  below: { in: M.SlideInType.IntoFromBelow },
};
const CRESCENDO = { crescendo: M.CrescendoType.Crescendo };
const PICK_STROKE = { up: M.PickStroke.Up, down: M.PickStroke.Down };
const BRUSH = { up: M.BrushType.BrushUp, down: M.BrushType.BrushDown };
const GRACE = { beforeBeat: M.GraceType.BeforeBeat, onBeat: M.GraceType.OnBeat };
const ACCENT = { 1: M.AccentuationType.Normal, 2: M.AccentuationType.Heavy };
const DRUMS_INSTRUMENT_ID = 1024;
const DRUM_CHANNEL = 9;

/** Tuplet n plays in the time of the largest power of two below n (3:2, 5:4, 6:4, 7:4). */
const tupletDenominator = (n) => 2 ** Math.floor(Math.log2(n - 1));

class Report {
  constructor() {
    this.unknown = {}; // "beat.palmMute" -> count
    this.unmapped = {}; // "slide=intoFromBelow" -> count
    this.warnings = [];
  }
  checkKeys(level, obj) {
    for (const k of Object.keys(obj)) {
      if (!KNOWN[level].includes(k)) this.unknown[`${level}.${k}`] = (this.unknown[`${level}.${k}`] ?? 0) + 1;
    }
  }
  miss(what) {
    this.unmapped[what] = (this.unmapped[what] ?? 0) + 1;
  }
}

function lookup(table, value, what, report) {
  if (value === undefined || value === null) return undefined;
  const v = table[value];
  if (v === undefined) report.miss(`${what}=${JSON.stringify(value)}`);
  return v;
}

/** Bar length in whole notes, from Songsterr's own duration fractions. */
const barLength = (measure) =>
  Math.max(0, ...(measure?.voices ?? []).map((v) =>
    v.beats.reduce((sum, b) => sum + (b.graceNote ? 0 : b.duration[0] / b.duration[1]), 0)));

/** Returns the key signature per bar index; alphaTab 1.9 stores keys on each staff's Bar. */
function buildMasterBars(score, tracks, report) {
  const keys = [];
  let keyNow = null;
  const barCount = Math.max(...tracks.map((t) => t.measures.length));
  let num = 4;
  let den = 4;
  let feel = M.TripletFeel.NoTripletFeel;
  for (let i = 0; i < barCount; i++) {
    const measures = tracks.map((t) => t.measures[i]).filter(Boolean);
    const sig = measures.find((m) => m.signature)?.signature;
    if (sig) [num, den] = sig;
    const tf = measures.find((m) => m.tripletFeel !== undefined)?.tripletFeel;
    if (tf !== undefined) feel = tf === 'none' ? M.TripletFeel.NoTripletFeel : lookup(TRIPLET_FEEL, tf, 'tripletFeel', report) ?? feel;
    const marker = measures.find((m) => m.marker?.text)?.marker;
    const key = measures.find((m) => m.keySignature)?.keySignature;

    const mb = new M.MasterBar();
    mb.timeSignatureNumerator = num;
    mb.timeSignatureDenominator = den;
    mb.tripletFeel = feel;
    if (key) {
      // Seen: {accidentalCount: 1, mode: "minor", transposeAs: "#"}. Flat keys not seen yet.
      const count = key.accidentalCount < 0 || key.transposeAs !== 'b'
        ? key.accidentalCount : -key.accidentalCount;
      if (count < -7 || count > 7) report.miss(`keySignature=${JSON.stringify(key)}`);
      else keyNow = { count, type: key.mode === 'minor' ? M.KeySignatureType.Minor : M.KeySignatureType.Major };
    }
    keys.push(keyNow);
    if (marker) {
      const section = new M.Section();
      section.text = marker.text;
      section.marker = '';
      mb.section = section;
    }
    score.addMasterBar(mb);
  }

  // Pick-up bar: flagged by Songsterr and actually shorter than its time signature.
  const first = score.masterBars[0];
  if (tracks.some((t) => t.anacrusis)) {
    const played = Math.max(...tracks.map((t) => barLength(t.measures[0])));
    const full = first.timeSignatureNumerator / first.timeSignatureDenominator;
    if (played > 0 && played < full) first.isAnacrusis = true;
  }

  const tempos = tracks.find((t) => t.automations?.tempo?.length)?.automations.tempo ?? [];
  for (const a of tempos) {
    const mb = score.masterBars[a.measure];
    if (!mb) {
      report.warnings.push(`tempo change on missing bar ${a.measure}`);
      continue;
    }
    if (a.position !== 0) report.warnings.push(`tempo at bar ${a.measure} position ${a.position} placed at bar start (only position 0 has been seen)`);
    // reference 2 = quarter note, Guitar Pro's convention for a BPM value.
    mb.tempoAutomations.push(M.Automation.buildTempoAutomation(false, 0, a.bpm, 2));
  }
  if (!tempos.length) report.warnings.push('no tempo in file; alphaTab default used');
  return keys;
}

function buildNote(n, strings, drums, letRing, tuning, report) {
  report.checkKeys('note', n);
  const note = new M.Note();
  if (drums) {
    // GP7 articulation ids match General MIDI drum keys for the kit pieces seen (36, 38, 42, 46).
    note.percussionArticulation = n.fret;
  } else {
    note.fret = n.fret;
    note.string = strings - n.string; // Songsterr: 0 = top line. alphaTab: 1 = bottom line.
  }
  if (letRing) note.isLetRing = true; // Songsterr marks let ring per beat, Guitar Pro per note
  if (n.tie) note.isTieDestination = true;
  if (n.hp) note.isHammerPullOrigin = true;
  if (n.dead) note.isDead = true;
  if (n.ghost) note.isGhost = true;
  if (n.staccato) note.isStaccato = true;
  const accent = lookup(ACCENT, n.accentuated, 'accentuated', report);
  if (accent !== undefined) note.accentuated = accent;
  const vib = lookup(VIBRATO, n.leftHandVibrato, 'leftHandVibrato', report);
  if (vib !== undefined) note.vibrato = vib;
  if (n.vibrato === true) note.vibrato = M.VibratoType.Slight;
  else if (n.vibrato !== undefined) report.miss(`vibrato=${JSON.stringify(n.vibrato)}`);
  const slide = lookup(SLIDE, n.slide, 'slide', report);
  if (slide?.out !== undefined) note.slideOutType = slide.out;
  if (slide?.in !== undefined) note.slideInType = slide.in;
  if (n.trill && !drums && typeof n.trill.auxiliaryFret === 'number') {
    // alphaTab wants the pitch trilled to. Songsterr's trill.speed (84 and 69 seen) has an
    // unknown unit, so alphaTab's default speed stays.
    note.trillValue = tuning[n.string] + n.trill.auxiliaryFret;
  } else if (n.trill) {
    report.miss(`trill=${JSON.stringify(n.trill)}`);
  }
  if (n.bend?.points?.length) {
    note.bendType = M.BendType.Custom;
    // Songsterr tone 100 = whole step (Guitar Pro units); alphaTab counts quarter tones.
    for (const p of n.bend.points) note.addBendPoint(new M.BendPoint(p.position, p.tone / 25));
  }
  return note;
}

function buildTrack(score, t, tm, index, channel, keys, report) {
  report.checkKeys('track', t);
  const drums = tm?.isDrums || t.instrumentId === DRUMS_INSTRUMENT_ID;
  const track = new M.Track();
  track.name = t.name || tm?.name || `Track ${index + 1}`;
  track.shortName = track.name.slice(0, 12);
  const staff = new M.Staff();
  track.addStaff(staff);
  score.addTrack(track);

  const info = track.playbackInfo;
  info.volume = Math.round(Math.min(1, Math.max(0, t.volume ?? 1)) * 15);
  info.balance = Math.round(8 + Math.min(1, Math.max(-1, t.balance ?? 0)) * 8);
  if (drums) {
    staff.isPercussion = true;
    staff.showTablature = false;
    staff.showStandardNotation = true;
    info.program = 0;
    info.primaryChannel = DRUM_CHANNEL;
    info.secondaryChannel = DRUM_CHANNEL;
  } else {
    staff.stringTuning = new M.Tuning('', [...t.tuning]);
    staff.showTablature = true;
    staff.showStandardNotation = true;
    info.program = t.instrumentId;
    info.primaryChannel = channel;
    info.secondaryChannel = channel;
  }

  const strings = t.strings ?? t.tuning?.length ?? 6;
  let dynamic = M.DynamicValue.F;
  for (let i = 0; i < score.masterBars.length; i++) {
    const measure = t.measures[i];
    if (measure) report.checkKeys('measure', measure);
    const bar = new M.Bar();
    staff.addBar(bar);
    if (keys[i]) {
      bar.keySignature = keys[i].count;
      bar.keySignatureType = keys[i].type;
    }
    const voices = measure?.voices?.length ? measure.voices : [{ beats: [] }];
    for (const v of voices) {
      report.checkKeys('voice', v);
      const voice = new M.Voice();
      bar.addVoice(voice);
      if (!v.beats.length) {
        const empty = new M.Beat();
        empty.isEmpty = true;
        voice.addBeat(empty);
        continue;
      }
      for (const b of v.beats) {
        report.checkKeys('beat', b);
        const beat = new M.Beat();
        voice.addBeat(beat);
        const grace = lookup(GRACE, b.graceNote, 'graceNote', report);
        if (grace !== undefined) {
          beat.graceType = grace;
          beat.duration = M.Duration.ThirtySecond; // Songsterr stores grace beats as 1/128
        } else {
          beat.duration = lookup(DURATION, b.type, 'beat.type', report) ?? M.Duration.Quarter;
        }
        if (b.dots) beat.dots = b.dots;
        if (b.tuplet) {
          beat.tupletNumerator = b.tuplet;
          beat.tupletDenominator = tupletDenominator(b.tuplet);
        }
        const dyn = lookup(DYNAMIC, b.velocity, 'velocity', report);
        if (dyn !== undefined) dynamic = dyn;
        beat.dynamics = dynamic;
        if (b.text?.text) beat.text = b.text.text;
        const pick = lookup(PICK_STROKE, b.pickStroke, 'pickStroke', report);
        if (pick !== undefined) beat.pickStroke = pick;
        // Brush direction only: Songsterr's brushStroke.duration unit is unknown (563 seen).
        const brush = lookup(BRUSH, b.brushStroke?.direction, 'brushStroke.direction', report);
        if (brush !== undefined) beat.brushType = brush;
        const whammy = lookup(VIBRATO, b.vibratoWithTremoloBar, 'vibratoWithTremoloBar', report);
        if (whammy !== undefined) beat.vibrato = whammy;
        // upStroke (1 seen) has only appeared next to a brushStroke, which already gives the direction.
        if (b.upStroke !== undefined && !b.brushStroke) report.miss(`upStroke=${JSON.stringify(b.upStroke)} without brushStroke`);
        const swell = lookup(CRESCENDO, b.gradualVelocity, 'gradualVelocity', report);
        if (swell !== undefined) beat.crescendo = swell;
        if (b.tremolo) {
          // Tremolo picking, given as a note length: [1, 32] is 32nd notes.
          const speed = b.tremolo[0] === 1 ? DURATION[b.tremolo[1]] : undefined;
          if (speed !== undefined) beat.tremoloSpeed = speed;
          else report.miss(`tremolo=${JSON.stringify(b.tremolo)}`);
        }
        if (b.chord?.text) {
          const id = b.chord.text;
          if (!staff.hasChord(id)) {
            const chord = new M.Chord();
            chord.name = id;
            chord.showDiagram = false;
            staff.addChord(id, chord);
          }
          beat.chordId = id;
        }
        const isRest = b.rest || b.notes.every((n) => n.rest);
        if (!isRest) {
          for (const n of b.notes) {
            if (!n.rest) beat.addNote(buildNote(n, strings, drums, !!b.letRing, t.tuning, report));
          }
        }
      }
    }
  }

  // Mid-song sound changes, e.g. clean -> distortion: {soundId, measure, position} into t.sounds.
  for (const a of t.trackAutomations?.trackSoundAutomations ?? []) {
    const program = t.sounds?.[a.soundId]?.instrumentId;
    const firstBeat = staff.bars[a.measure]?.voices[0]?.beats[0];
    if (program === undefined || program > 127 || !firstBeat) {
      report.warnings.push(`${track.name}: sound change at bar ${a.measure} skipped`);
      continue;
    }
    if (a.position !== 0) report.warnings.push(`${track.name}: sound change at bar ${a.measure} position ${a.position} placed at bar start`);
    firstBeat.automations.push(M.Automation.buildInstrumentAutomation(false, 0, program));
  }

  // newLyrics text is Guitar Pro lyric syntax, which alphaTab's Lyrics parses.
  // Applied after score.finish(): applyLyrics walks beat.nextBeat, which finish() links.
  const lyrics = (t.newLyrics ?? []).filter((l) => l.text?.trim()).map((l) => {
    const ly = new M.Lyrics();
    ly.startBar = Math.max(0, (l.offset ?? 1) - 1);
    ly.text = l.text;
    return ly;
  });
  return { track, lyrics };
}

/** Build an alphaTab score from saved Songsterr data. */
export function toScore({ meta, tracks }) {
  const report = new Report();
  const settings = new Settings();
  const score = new M.Score();
  score.title = meta.title ?? '';
  score.artist = meta.artist ?? '';
  let author = '';
  try {
    author = typeof meta.author === 'string' ? JSON.parse(meta.author).name : meta.author?.name;
  } catch {
    author = '';
  }
  score.tab = author ?? '';
  score.notices = `Imported from Songsterr song ${meta.songId}, revision ${meta.revisionId}`;

  const keys = buildMasterBars(score, tracks, report);

  let channel = 0;
  const built = tracks.map((t, i) => {
    const drums = meta.tracks[i]?.isDrums || t.instrumentId === DRUMS_INSTRUMENT_ID;
    if (!drums && channel === DRUM_CHANNEL) channel++;
    if (!drums && channel > 15) report.warnings.push(`${t.name}: more than 15 pitched tracks, MIDI channel reused`);
    const b = buildTrack(score, t, meta.tracks[i], i, drums ? DRUM_CHANNEL : channel % 16, keys, report);
    if (!drums) channel++;
    return b;
  });

  score.finish(settings);
  for (const { track, lyrics } of built) {
    if (lyrics.length) track.applyLyrics(lyrics);
  }
  return { score, settings, report };
}

export const countNotes = (score) =>
  score.tracks.map((t) => t.staves[0].bars.reduce((s, bar) =>
    s + bar.voices.reduce((sv, v) => sv + v.beats.reduce((sb, b) => sb + b.notes.length, 0), 0), 0));

export function rawNoteCounts(tracks) {
  return tracks.map((t) => t.measures.reduce((s, m) =>
    s + (m.voices ?? []).reduce((sv, v) => sv + v.beats.reduce((sb, b) =>
      sb + (b.rest ? 0 : b.notes.filter((n) => !n.rest).length), 0), 0), 0));
}

export function toGuitarPro(score, settings) {
  return new exporter.Gp7Exporter().export(score, settings);
}

export function loadGuitarPro(bytes) {
  return importer.ScoreLoader.loadScoreFromBytes(bytes, new Settings());
}
