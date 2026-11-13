// Build a chord sheet from the tab: words, chord names and section names, placed by time.
// Plan §16.2. Uses alphaTab's model only (no drawing), so tests can run it in Node.
import type * as alphaTab from '@coderline/alphatab';
import { detectSegments, type BarSpan, type NoteSpan } from './detect.ts';
import type { LyricLines, Segment, Sheet, SheetBar, SheetBlock, SheetChord } from './sheet.ts';

type Score = alphaTab.model.Score;
type Track = alphaTab.model.Track;
type Beat = alphaTab.model.Beat;

const QUARTER = 960;

/** Chord ids the engine adds for Detect chords (§16.4). Never part of the song: skipped here, left out of downloads. */
export const DETECTED_ID = '\u2063detected:';

const written = (beat: Beat) => beat.hasChord && !beat.chordId!.startsWith(DETECTED_ID);
// Without the importer's line starts (uploaded files), lines are guessed:
/** A rest this long or longer between two sung syllables ends the line. */
const LINE_GAP = 2 * QUARTER;
/** A capital letter starts a new line once the line has this many characters. */
const CAPITAL_AFTER = 16;
/** Past this many characters a line ends at the next word. */
const LINE_CHARS = 56;
/** Words that are capitalised in the middle of a line. */
const ALWAYS_CAPITAL = /^(I|I'm|I'd|I've|I'll|O|Oh)\b/;

function* beats(track: Track): Generator<Beat> {
  for (const staff of track.staves) for (const bar of staff.bars) for (const voice of bar.voices) yield* voice.beats;
}

const isBass = (track: Track) => track.playbackInfo.program >= 32 && track.playbackInfo.program <= 39;

const NOTE = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

/** "E♭ (half step down)", "Drop D", or the open strings low to high. Null for standard tuning. */
export function tuningLabel(track: Track): string | null {
  const t = [...(track.staves[0]?.tuning ?? [])].reverse();
  if (t.length !== 6 || track.staves[0].isPercussion) return null;
  const std = [40, 45, 50, 55, 59, 64];
  const d = t.map((p, i) => p - std[i]);
  if (d.every((x) => x === 0)) return null;
  if (d.every((x) => x === d[0])) {
    const name = NOTE[(((64 + d[0]) % 12) + 12) % 12];
    const how = d[0] === -1 ? ' (half step down)' : d[0] === -2 ? ' (whole step down)' : '';
    return `${name}${how}`;
  }
  if (d[0] === -2 && d.slice(1).every((x) => x === 0)) return 'Drop D';
  return t.map((p) => NOTE[p % 12]).join(' ');
}

/**
 * Every pitched note of a track at sounding pitch, by written position, plus the bars.
 * Sounding, not shapes: the hand-written names on Come As You Are (tuned down) are sounding names (§16.6).
 */
export function trackNotes(track: Track, score: Score): { notes: NoteSpan[]; bars: BarSpan[] } {
  const notes: NoteSpan[] = [];
  for (const beat of beats(track)) {
    if (beat.isRest || !beat.notes.length || beat.voice.bar.staff.isPercussion) continue;
    const start = beat.voice.bar.masterBar.start + beat.playbackStart;
    const end = start + Math.max(1, beat.playbackDuration);
    for (const note of beat.notes) if (!note.isDead) notes.push({ start, end, pitch: note.realValue });
  }
  const bars = score.masterBars.map((mb) => ({ index: mb.index, start: mb.start, end: mb.start + mb.calculateDuration() }));
  return { notes, bars };
}

/** The track with the most chord names, or null when no track has any. */
export function chordTrack(score: Score): Track | null {
  let best: Track | null = null;
  let most = 0;
  for (const track of score.tracks) {
    let n = 0;
    for (const beat of beats(track)) if (written(beat)) n++;
    if (n > most) {
      best = track;
      most = n;
    }
  }
  return best;
}

/** The pitched, non-bass track that plays the most beats of two or more notes. */
export function harmonyTrack(score: Score): Track | null {
  let best: Track | null = null;
  let most = 7; // fewer than 8 chords is not a harmony part
  for (const track of score.tracks) {
    if (track.staves[0]?.isPercussion || isBass(track)) continue;
    let n = 0;
    for (const beat of beats(track)) if (beat.notes.length >= 2) n++;
    if (n > most) {
      best = track;
      most = n;
    }
  }
  return best;
}

/** Chord changes the notes of a track spell, at bar and ticks into the bar. Plan §16.4. */
export function detectedChords(track: Track, score: Score, everyBar = false): { bar: number; offset: number; name: string }[] {
  const { notes, bars } = trackNotes(track, score);
  return detectSegments(notes, bars, everyBar).map((e) => ({ bar: e.bar, offset: e.start - bars[e.bar].start, name: e.name }));
}

/** Written names covering less than this share of the bars a track plays get filled in by detection. */
const SPARSE = 0.5;

interface Syllable {
  /** Which lyric beat this is, counting from 0: the importer's line starts use the same count. */
  index: number;
  bar: number;
  offset: number;
  start: number;
  end: number;
  text: string;
  /** The word goes on in the next syllable. */
  cont: boolean;
}

function syllable(chunk: string): { text: string; cont: boolean } | null {
  let t = chunk.trim();
  if (!t || t === '-') return null; // a held note
  const cont = t.endsWith('-');
  if (cont) t = t.replace(/-+$/, '');
  // "(a)" is a sung-out vowel of the syllable before: part of the word, not new text.
  t = t.replace(/\(.*?\)/g, '');
  return { text: t, cont };
}

function wordsTrack(score: Score): Track | null {
  let best: Track | null = null;
  let most = 0;
  for (const track of score.tracks) {
    let n = 0;
    for (const beat of beats(track)) if (beat.lyrics?.[0]?.trim()) n++;
    if (n > most) {
      best = track;
      most = n;
    }
  }
  return best;
}

const label = (track: Track) => track.name?.trim() || `Track ${track.index + 1}`;

/** The whole sheet. Plan §16.2. lines: where the words' lines start, when the importer knows. */
export function sheetFromScore(score: Score, lines?: LyricLines): Sheet {
  const sheet: Sheet = { source: 'tab', blocks: [], timed: true, notes: [] };
  const masterBars = score.masterBars;

  // Chord changes, from the names in the tab or else detected.
  type Event = { bar: number; offset: number; name: string; detected?: boolean };
  let events: Event[] = [];
  const named = chordTrack(score);
  if (named) {
    const seen = new Set<string>();
    for (const beat of beats(named)) {
      if (!written(beat) || !beat.chord) continue;
      const bar = beat.voice.bar.index;
      const key = `${bar}:${beat.playbackStart}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push({ bar, offset: beat.playbackStart, name: beat.chord.name });
    }
    sheet.tuning = tuningLabel(named) ?? undefined;
    // Songsterr often names a riff's chords once and leaves the rest (Come As You Are: 12 names
    // in 112 bars). Then detection fills the bars that have no name of their own.
    const namedBars = new Set(events.map((e) => e.bar));
    const played = new Set<number>();
    for (const beat of beats(named)) if (beat.notes.length) played.add(beat.voice.bar.index);
    if (namedBars.size < played.size * SPARSE) {
      for (const e of detectedChords(named, score, true)) if (!namedBars.has(e.bar)) events.push({ ...e, detected: true });
      events.sort((a, b) => a.bar - b.bar || a.offset - b.offset);
      events = events.filter((e, k) => k === 0 || e.name !== events[k - 1].name);
      sheet.notes.push(`Chords from the ${label(named)} track; the tab names only some, so the green ones were detected.`);
    } else {
      sheet.notes.push(`Chords from the ${label(named)} track.`);
    }
  } else {
    const h = harmonyTrack(score);
    if (h) {
      events = detectedChords(h, score).map((e) => ({ ...e, detected: true }));
      sheet.notes.push(`The tab names no chords, so these were detected from the ${label(h)} track (green).`);
      sheet.tuning = tuningLabel(h) ?? undefined;
    }
  }
  events.sort((a, b) => a.bar - b.bar || a.offset - b.offset);

  // Sung syllables, in order.
  const syllables: Syllable[] = [];
  const words = wordsTrack(score);
  const known = words ? lines?.[words.index] : undefined;
  const starts = new Set(known?.starts ?? []);
  const stanzas = new Set(known?.stanzas ?? []);
  if (words) {
    // Lyrics sit on the first staff's first voice, one per beat, in order (alphaTab's applyLyrics).
    let index = 0;
    for (const bar of words.staves[0].bars) {
      for (const beat of bar.voices[0].beats) {
        if (!beat.lyrics) continue;
        const k = index++;
        const s = syllable(beat.lyrics[0] ?? '');
        if (!s) continue;
        const start = bar.masterBar.start + beat.playbackStart;
        syllables.push({ index: k, bar: bar.index, offset: beat.playbackStart, start, end: start + beat.playbackDuration, ...s });
      }
    }
    syllables.sort((a, b) => a.start - b.start);
    sheet.notes.push(`Words from the ${label(words)} track.`);
  }
  // A line that starts on a held note ("-") still starts at the next syllable sung.
  const startsBetween = (set: Set<number>, s: Syllable, prev: Syllable | undefined) => {
    for (let k = (prev?.index ?? -1) + 1; k <= s.index; k++) if (set.has(k)) return true;
    return false;
  };

  const byBar = <T extends { bar: number }>(list: T[]) => {
    const m = new Map<number, T[]>();
    for (const x of list) m.set(x.bar, [...(m.get(x.bar) ?? []), x]);
    return m;
  };
  const sylByBar = byBar(syllables);
  const evByBar = byBar(events);
  const chord = (e: Event): SheetChord => ({ name: e.name, at: { bar: e.bar, offset: e.offset }, ...(e.detected ? { detected: true } : {}) });

  let block: SheetBlock = { lines: [] };
  let line: Segment[] = [];
  let chart: SheetBar[] = [];
  let pending: SheetChord | null = null;
  let pendingAt = 0;
  let lastEnd = -Infinity;
  let lineChars = 0;
  let prevCont = false;
  let prevSyl: Syllable | undefined;

  // Words sung since the last chord on this line.
  const syllableSince = (segs: Segment[]) => {
    for (let k = segs.length - 1; k >= 0; k--) {
      if (segs[k].text.trim()) return true;
      if (segs[k].chord) return false;
    }
    return false;
  };
  const flushWords = (keepPending: boolean) => {
    if (pending && line.length && !keepPending) {
      line.push({ chord: pending, text: '' });
      pending = null;
    }
    if (line.length) {
      // Words without a chord of their own join the segment before them.
      const merged: Segment[] = [];
      for (const s of line) {
        const prev = merged[merged.length - 1];
        if (prev && !s.chord) prev.text += s.text;
        else merged.push({ ...s });
      }
      merged[merged.length - 1].text = merged[merged.length - 1].text.trimEnd();
      block.lines.push({ kind: 'words', segments: merged });
    }
    line = [];
    lineChars = 0;
    prevCont = false;
  };
  const flushChart = () => {
    for (let i = 0; i < chart.length; i += 4) block.lines.push({ kind: 'bars', bars: chart.slice(i, i + 4) });
    chart = [];
  };
  const newBlock = (title?: string) => {
    flushWords(false);
    flushChart();
    if (block.lines.length || block.title) sheet.blocks.push(block);
    block = { title, lines: [] };
  };

  for (const mb of masterBars) {
    if (mb.section) newBlock(mb.section.text?.trim() || mb.section.marker?.trim() || undefined);
    const syl = sylByBar.get(mb.index) ?? [];
    const ev = evByBar.get(mb.index) ?? [];
    if (!syl.length) {
      // No words in this bar: a chord still waiting goes on the end of the words before it.
      flushWords(false);
      if (pending) {
        chart.push({ index: pending.at!.bar, chords: [pending] });
        pending = null;
      }
      chart.push({ index: mb.index, chords: ev.map(chord) });
      continue;
    }
    flushChart();
    const items = [
      ...ev.map((e) => ({ at: e.offset, chord: e, s: null as Syllable | null })),
      ...syl.map((s) => ({ at: s.offset, chord: null as typeof ev[number] | null, s })),
    ].sort((a, b) => a.at - b.at || (a.chord ? -1 : 1));
    for (const item of items) {
      if (item.chord) {
        // The same chord again before anything is sung (a new bar of A under a held A) adds nothing.
        const before = pending ?? [...line].reverse().find((x) => x.chord)?.chord;
        if (before?.name === item.chord.name && !syllableSince(line)) continue;
        if (pending) line.push({ chord: pending, text: '' });
        pending = chord(item.chord);
        pendingAt = mb.start + item.chord.offset;
        continue;
      }
      const s = item.s!;
      const guess = !known && !prevCont && (s.start - lastEnd >= LINE_GAP || lineChars > LINE_CHARS
        || (lineChars >= CAPITAL_AFTER && /^[A-Z]/.test(s.text) && !ALWAYS_CAPITAL.test(s.text)));
      if (line.length && ((known && startsBetween(starts, s, prevSyl)) || guess)) {
        // A chord that started in the rest belongs to whichever line it is nearer.
        const keep = !!pending && pendingAt - lastEnd >= s.start - pendingAt;
        flushWords(keep);
        if (startsBetween(stanzas, s, prevSyl) && block.lines.length) block.lines.push({ kind: 'space' });
      }
      prevSyl = s;
      line.push({ chord: pending ?? undefined, text: s.text + (s.cont ? '' : ' ') });
      pending = null;
      lineChars += s.text.length + (s.cont ? 0 : 1);
      lastEnd = s.end;
      prevCont = s.cont;
    }
  }
  newBlock();
  // A song whose last block is empty has nothing more to show.
  sheet.blocks = sheet.blocks.filter((b) => b.lines.length);
  return sheet;
}
