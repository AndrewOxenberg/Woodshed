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
