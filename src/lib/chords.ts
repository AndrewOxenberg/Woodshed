// Chord-name transposition with one spelling per song. Plan §3.4, §12.2.

const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
// Sharps (+) or flats (-) in the major key on each pitch class.
const MAJOR_FIFTHS = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5];
const CHORD = /^([A-G])([#b♯♭]?)([^/]*)(?:\/([A-G])([#b♯♭]?))?$/;

const accidental = (a: string) => (a === '#' || a === '♯' ? 1 : a === 'b' || a === '♭' ? -1 : 0);
const pitchClass = (letter: string, acc: string) => (LETTER[letter] + accidental(acc) + 12) % 12;
const mod12 = (n: number) => ((n % 12) + 12) % 12;

export interface ParsedChord {
  root: number;
  quality: string;
  bass: number | null;
}

export function parseChord(name: string): ParsedChord | null {
  const m = name.trim().match(CHORD);
  if (!m) return null;
  return { root: pitchClass(m[1], m[2]), quality: m[3], bass: m[4] ? pitchClass(m[4], m[5]) : null };
}

/** "m", "m7", "min", "dim" are minor; "maj7" and "M7" are not. */
export const isMinor = (quality: string) => /^(m(?!aj)|min|dim)/.test(quality);

/** Does the key this chord names read better in flats? Am -> no, Bbm -> yes, F -> yes. */
export function prefersFlats(chord: ParsedChord): boolean {
  const majorRoot = isMinor(chord.quality) ? mod12(chord.root + 3) : chord.root;
  return MAJOR_FIFTHS[majorRoot] < 0;
}

export interface Spelling {
  flats: boolean;
  unicode: boolean;
}

/** One spelling for the whole song, taken from its first chord after transposing. */
export function spellingFor(chordNames: string[], semitones: number): Spelling {
  const unicode = chordNames.some((n) => /[♯♭]/.test(n)) || !chordNames.some((n) => /^[A-G][#b]/.test(n));
  for (const name of chordNames) {
    const c = parseChord(name);
    if (c) return { flats: prefersFlats({ ...c, root: mod12(c.root + semitones) }), unicode };
  }
  return { flats: false, unicode };
}

function noteName(pc: number, s: Spelling): string {
  const name = (s.flats ? FLAT : SHARP)[pc];
  return s.unicode ? name.replace('#', '♯').replace(/(?<=[A-G])b/, '♭') : name;
}

/** Transpose one chord name. Names that don't parse ("N.C.") come back unchanged. */
export function transposeChord(name: string, semitones: number, spelling: Spelling): string {
  const c = parseChord(name);
  if (!c) return name;
  const root = noteName(mod12(c.root + semitones), spelling);
  const bass = c.bass === null ? '' : `/${noteName(mod12(c.bass + semitones), spelling)}`;
  return `${root}${c.quality}${bass}`;
}

/** Name a pitch class on its own, e.g. for a chord root found by Detect chords. */
export const pitchName = (pc: number, spelling: Spelling) => noteName(mod12(pc), spelling);

// ---- chord qualities (plan §16.3, §16.4) ------------------------------------------------

/** Intervals above the root, by the quality names Woodshed writes. */
export const QUALITIES: Record<string, number[]> = {
  '': [0, 4, 7], m: [0, 3, 7], '5': [0, 7], dim: [0, 3, 6], aug: [0, 4, 8],
  sus2: [0, 2, 7], sus4: [0, 5, 7], '6': [0, 4, 7, 9], m6: [0, 3, 7, 9],
  '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], m7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9],
  '7sus4': [0, 5, 7, 10], add9: [0, 2, 4, 7], madd9: [0, 2, 3, 7],
  '9': [0, 2, 4, 7, 10], m9: [0, 2, 3, 7, 10], maj9: [0, 2, 4, 7, 11], mmaj7: [0, 3, 7, 11],
  '69': [0, 2, 4, 7, 9], '7b9': [0, 1, 4, 7, 10], '7#9': [0, 3, 4, 7, 10], aug7: [0, 4, 8, 10],
  '11': [0, 2, 5, 7, 10], '13': [0, 4, 7, 9, 10],
};

/** Other ways the same qualities get written, Songsterr's "D7M" included. */
const ALIASES: Record<string, string> = {
  M: '', maj: '', major: '', min: 'm', mi: 'm', '-': 'm', o: 'dim', '°': 'dim', '+': 'aug', '#5': 'aug',
  sus: 'sus4', '4': 'sus4', '2': 'sus2', add2: 'add9', madd2: 'madd9', m2: 'madd9',
  M7: 'maj7', '7M': 'maj7', Δ: 'maj7', Δ7: 'maj7', ma7: 'maj7', j7: 'maj7',
  min7: 'm7', mi7: 'm7', '-7': 'm7', ø: 'm7b5', ø7: 'm7b5', 'm7-5': 'm7b5', o7: 'dim7', '°7': 'dim7',
  '7sus': '7sus4', M9: 'maj9', '9M': 'maj9', '6/9': '69', '6add9': '69', mM7: 'mmaj7', 'm/maj7': 'mmaj7',
  '7+': 'aug7', '+7': 'aug7', '7#5': 'aug7', m11: '11',
};

/** A quality written any common way, in Woodshed's spelling. Unknown ones come back as null. */
export function normalQuality(quality: string): string | null {
  const q = quality.replace(/♭/g, 'b').replace(/♯/g, '#').replace(/[()\s]/g, '');
  if (q in QUALITIES) return q;
  if (q in ALIASES) return ALIASES[q];
  return null;
}

/** Intervals for any quality. Unknown ones fall back to their triad, plus a seventh when one is written. */
export function intervalsOf(quality: string): number[] {
  const q = normalQuality(quality);
  if (q !== null) return QUALITIES[q];
  const third = isMinor(quality) ? 3 : 4;
  const seventh = /maj7|M7/.test(quality) ? [11] : /7|9|11|13/.test(quality) ? [10] : [];
  return [0, third, 7, ...seventh];
}

/** The triad a chord simplifies to: "", "m", "5", "dim" or "aug". */
export function simpleQuality(quality: string): string {
  const iv = intervalsOf(quality);
  if (iv.length === 2 && iv[1] === 7) return '5';
  if (iv.includes(3) && !iv.includes(4)) return iv.includes(6) && !iv.includes(7) ? 'dim' : 'm';
  if (iv.includes(8) && !iv.includes(7)) return 'aug';
  return '';
}

const SPLIT = /^([A-G][#b♯♭]?)([^/]*)(?:\/([A-G][#b♯♭]?))?$/;

/** E♭madd9 -> E♭m, C/E -> C. Names that don't parse come back unchanged. Plan §16.3. */
export function simplifyChord(name: string): string {
  const m = name.trim().match(SPLIT);
  return m ? `${m[1]}${simpleQuality(m[2])}` : name;
}

/** Chord names with sharp and flat signs instead of # and b, the way the page shows them. */
export function prettyChord(name: string): string {
  return name.replace(/#/g, '♯').replace(/(?<=[A-G])b/g, '♭');
}
