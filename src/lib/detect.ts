// Detect chords: name the chord a stretch of notes spells. Plan §16.4.
// Pure functions on plain note spans, so they run in tests without alphaTab.
import { parseChord, pitchName, prefersFlats, transposeChord, type Spelling } from './chords.ts';

export interface NoteSpan {
  /** Ticks, any origin, as long as every span and window uses the same one. */
  start: number;
  end: number;
  /** MIDI pitch. Only the pitch class and which note is lowest matter. */
  pitch: number;
}

export interface Detected {
  root: number;
  quality: string;
  /** Pitch class of a bass note that is not the root, for slash chords. */
  bass: number | null;
  /** How well the notes fit, about 0 to 1.1. */
  fit: number;
  /** Different notes that count (passing notes left out). */
  tones: number;
}

// Simplest first: on a tie the earlier template wins.
const TEMPLATES: [string, number[]][] = [
  ['', [0, 4, 7]], ['m', [0, 3, 7]], ['5', [0, 7]], ['sus2', [0, 2, 7]], ['sus4', [0, 5, 7]],
  ['dim', [0, 3, 6]], ['aug', [0, 4, 8]], ['7', [0, 4, 7, 10]], ['m7', [0, 3, 7, 10]], ['maj7', [0, 4, 7, 11]],
  ['6', [0, 4, 7, 9]], ['m6', [0, 3, 7, 9]], ['7sus4', [0, 5, 7, 10]], ['add9', [0, 2, 4, 7]],
  ['madd9', [0, 2, 3, 7]], ['m7b5', [0, 3, 6, 10]], ['dim7', [0, 3, 6, 9]], ['9', [0, 2, 4, 7, 10]],
  ['m9', [0, 2, 3, 7, 10]], ['maj9', [0, 2, 4, 7, 11]],
];

/** Below this a window is not named. Tuned on the songs with hand-written names (§16.6). */
export const MIN_FIT = 0.45;

/** Notes sounding for less than this share of a window are passing notes and are ignored. */
const PASSING = 0.06;

/** The chord the notes sounding between from and to spell, or null. */
export function detectChord(notes: NoteSpan[], from: number, to: number): Detected | null {
  const w = new Array<number>(12).fill(0);
  let total = 0;
  let low = Infinity;
  for (const n of notes) {
    const d = Math.min(n.end, to) - Math.max(n.start, from);
    if (d <= 0) continue;
    w[((n.pitch % 12) + 12) % 12] += d;
    total += d;
  }
  if (!total) return null;
  for (let pc = 0; pc < 12; pc++) if (w[pc] < total * PASSING) w[pc] = 0;
  const kept = w.reduce((a, b) => a + b, 0);
  if (w.filter((x) => x > 0).length < 2) return null;
  // The bass is the lowest note that holds for a good part of the window, not a passing low note.
  let lowest = Infinity;
  for (const n of notes) {
    const d = Math.min(n.end, to) - Math.max(n.start, from);
    if (d <= 0 || !w[((n.pitch % 12) + 12) % 12]) continue;
    if (n.pitch < lowest) lowest = n.pitch;
    if (d >= (to - from) * 0.25 && n.pitch < low) low = n.pitch;
  }
  if (low === Infinity) low = lowest;
  const bass = ((low % 12) + 12) % 12;

  let best: Detected | null = null;
  for (let root = 0; root < 12; root++) {
    if (!w[root]) continue;
    for (const [quality, iv] of TEMPLATES) {
      let covered = 0;
      let ok = true;
      for (const i of iv) {
        const x = w[(root + i) % 12];
        // Every tone has to sound, except the fifth of a chord with a third.
        if (!x && !(i === 7 && iv.length > 2)) {
          ok = false;
          break;
        }
        covered += x;
      }
      if (!ok) continue;
      const extra = kept - covered;
      const fit = (covered - 1.5 * extra) / kept - 0.02 * iv.length + (root === bass ? 0.15 : 0);
      if (!best || fit > best.fit + 1e-9) best = { root, quality, bass: null, fit, tones: 0 };
    }
  }
  if (!best) return null;
  best.tones = w.filter((x) => x > 0).length;
  if (bass !== best.root && w[bass] >= kept * 0.1) best.bass = bass;
  return best;
}

/** The detected chord written out, in sharps; respell with nameChords. */
export function chordName(d: Detected): string {
  const s: Spelling = { flats: false, unicode: false };
  return `${pitchName(d.root, s)}${d.quality}${d.bass === null ? '' : `/${pitchName(d.bass, s)}`}`;
}

/**
 * Respell detected names the way the song's key reads. Each chord votes for the key it names
 * (§3.4 rule); the first chord alone is a coin toss on F♯/G♭ (Sprinter came out D♯m, A♯m, C♯6).
 */
export function nameChords(names: string[]): string[] {
  let votes = 0;
  for (const n of names) {
    const c = parseChord(n);
    if (c) votes += prefersFlats(c) ? 1 : -1;
  }
  const s: Spelling = { flats: votes > 0, unicode: false };
  return names.map((n) => transposeChord(n, 0, s));
}

export interface BarSpan {
  index: number;
  start: number;
  end: number;
}

export interface ChordEvent {
  bar: number;
  /** Start of the chord, in the same ticks as the notes. */
  start: number;
  name: string;
  fit: number;
}

/** Smaller windows may fit this much worse than the whole and still split it. */
const SPLIT_SLACK = 0.2;

interface Piece {
  start: number;
  name: string;
  fit: number;
  tones: number;
  /** The chord's pitch classes, as a bit set. */
  set: number;
}

function toneSet(d: Detected): number {
  const iv = TEMPLATES.find(([q]) => q === d.quality)![1];
  let set = 0;
  for (const i of iv) set |= 1 << ((d.root + i) % 12);
  if (d.bass !== null) set |= 1 << d.bass;
  return set;
}

/** One chord's notes all inside the other's (B♭m7 and D♭/A♭): the same harmony, voiced two ways. */
const sameHarmony = (a: number, b: number) => (a & b) === a || (a & b) === b;

/** Share of the sound in a window that comes from notes struck together (chords, not runs). */
function chordalShare(notes: NoteSpan[], from: number, to: number): number {
  const struck = new Map<number, number>();
  for (const n of notes) struck.set(n.start, (struck.get(n.start) ?? 0) + 1);
  let all = 0;
  let together = 0;
  for (const n of notes) {
    const d = Math.min(n.end, to) - Math.max(n.start, from);
    if (d <= 0) continue;
    all += d;
    if (struck.get(n.start)! >= 2) together += d;
  }
  return all ? together / all : 0;
}

const good = (d: Detected | null): d is Detected => !!d && d.fit >= MIN_FIT;

/**
 * Best chords for one window: the whole of it, or its halves (down to quarter bars) when both
 * halves name a chord, the names differ, and they fit about as well as the whole. A short chord
 * can drown in a whole bar (one beat of D in a 12/8 bar of A, §16.6), so the halves need not beat it.
 */
function pieces(notes: NoteSpan[], from: number, to: number, depth: number): Piece[] {
  const whole = detectChord(notes, from, to);
  const one = good(whole) ? [{ start: from, name: chordName(whole), fit: whole.fit, tones: whole.tones, set: toneSet(whole) }] : [];
  if (depth === 2) return one;
  const mid = (from + to) / 2;
  // Riffs and single-note runs spell a new "chord" every beat; only struck chords may split a window.
  if (chordalShare(notes, from, mid) < 0.5 || chordalShare(notes, mid, to) < 0.5) return one;
  const left = pieces(notes, from, mid, depth + 1);
  const right = pieces(notes, mid, to, depth + 1);
  // A half with nothing to name (a single-note run) leaves the window whole.
  if (!left.length || !right.length) return one.length ? one : [...left, ...right];
  const parts = [...left, ...right].filter((p, k, all) => k === 0 || p.name !== all[k - 1].name);
  if (parts.length <= 1) return one.length ? one : parts;
  // Two-note shapes are too ambiguous to split on, and so are two voicings of one harmony.
  if (one.length && parts.some((p) => p.tones < 3)) return one;
  if (one.length && parts.some((p, k) => k > 0 && sameHarmony(p.set, parts[k - 1].set))) return one;
  const partsFit = parts.reduce((n, p) => n + p.fit, 0) / parts.length;
  return !one.length || partsFit >= one[0].fit - SPLIT_SLACK ? parts : one;
}

/**
 * One chord per bar, split into halves or quarters when those name different chords and fit
 * clearly better (a change on one beat of a 12/8 bar, measured in §16.6).
 * Only changes are returned (a bar that keeps the chord before it adds nothing) unless everyBar.
 */
export function detectSegments(notes: NoteSpan[], bars: BarSpan[], everyBar = false): ChordEvent[] {
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  const raw: ChordEvent[] = [];
  let i = 0;
  for (const bar of bars) {
    while (i < sorted.length && sorted[i].end <= bar.start) i++;
    const here: NoteSpan[] = [];
    for (let j = i; j < sorted.length && sorted[j].start < bar.end; j++) if (sorted[j].end > bar.start) here.push(sorted[j]);
    if (!here.length) continue;
    for (const p of pieces(here, bar.start, bar.end, 0)) raw.push({ bar: bar.index, start: p.start, name: p.name, fit: p.fit });
  }
  const changes = everyBar ? raw.filter((e, k) => k === 0 || e.name !== raw[k - 1].name || e.bar !== raw[k - 1].bar) : raw.filter((e, k) => k === 0 || e.name !== raw[k - 1].name);
  const spelled = nameChords(changes.map((e) => e.name));
  return changes.map((e, k) => ({ ...e, name: spelled[k] }));
}
