// Transpose a score by rewriting frets, chord names and key signatures. Plan §3.4, §12.2.
// Works on the plain object from JSON.parse(JsonConverter.scoreToJson(score)); the caller
// rebuilds the score from it so alphaTab reruns finish() and its lookups stay right.
import { spellingFor, transposeChord } from './chords.ts';

const MAX_FRET = 24;

export interface TransposeResult {
  /** Notes that stayed in tune by moving to another string. */
  moved: number;
  /** Notes that ran off the fretboard and were put an octave away. */
  raised: number;
}

interface Placed {
  fromFret: number;
  string: number;
  fret: number;
  raised: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

function wrapKey(fifths: number, semitones: number): number {
  const v = (((fifths + 7 * semitones) % 12) + 12) % 12;
  return v > 6 ? v - 12 : v;
}

/** Transpose one beat's fretted notes. last remembers each string's previous note for ties. */
function transposeBeat(notes: Json[], tunings: number[], n: number, last: Map<number, Placed>, result: TransposeResult) {
  const strings = tunings.length;
  const open = (s: number) => tunings[strings - s]; // string 1 is the lowest
  const taken = new Set<number>();
  const todo: Json[] = [];

  for (const note of notes) {
    const prev = last.get(note.string);
    // A tied note must land where the note it continues landed.
    if (note.istiedestination && prev && prev.fromFret === note.fret) {
      last.set(note.string, { ...prev });
      note.string = prev.string;
      note.fret = prev.fret;
      taken.add(note.string);
      if (prev.raised) result.raised++;
    } else {
      todo.push(note);
    }
  }

  const plan = todo.map((note) => ({ note, from: note.string as number, fromFret: note.fret as number, string: note.string as number, fret: (note.fret as number) + n, raised: false }));
  for (const p of plan) if (p.fret >= 0 && p.fret <= MAX_FRET) taken.add(p.string);

  let fits = true;
  // Too low: walk down to lower strings, lowest notes first.
  for (const p of plan.filter((q) => q.fret < 0).sort((a, b) => a.string - b.string)) {
    let s = p.string;
    let f = p.fret;
    while (f < 0 && s > 1) {
      f += open(s) - open(s - 1);
      s--;
    }
    if (f < 0 || f > MAX_FRET || taken.has(s)) fits = false;
    else {
      p.string = s;
      p.fret = f;
      taken.add(s);
    }
  }
  // Too high: walk up to higher strings, highest notes first.
  for (const p of plan.filter((q) => q.fret > MAX_FRET).sort((a, b) => b.string - a.string)) {
    let s = p.string;
    let f = p.fret;
    while (f > MAX_FRET && s < strings) {
      f -= open(s + 1) - open(s);
      s++;
    }
    if (f >= 0 && f <= MAX_FRET && !taken.has(s)) {
      p.string = s;
      p.fret = f;
      taken.add(s);
    } else {
      p.fret -= 12; // an octave down on its own string
      p.raised = true;
      result.raised++;
    }
  }

  if (!fits) {
    // Keep the shape: the whole beat goes up an octave on its own strings.
    for (const p of plan) {
      p.string = p.from;
      p.fret = p.fromFret + n + 12;
      while (p.fret < 0) p.fret += 12;
      p.raised = true;
      result.raised++;
    }
  } else {
    for (const p of plan) if (p.string !== p.from) result.moved++;
  }

  for (const p of plan) {
    last.set(p.from, { fromFret: p.fromFret, string: p.string, fret: p.fret, raised: p.raised });
    p.note.string = p.string;
    p.note.fret = p.fret;
  }
}

/** Transpose every pitched track in place. Percussion is left alone. */
export function transposeScoreJson(score: Json, semitones: number): TransposeResult {
  const result: TransposeResult = { moved: 0, raised: 0 };
  if (!semitones) return result;

  const names: string[] = [];
  for (const track of score.tracks) for (const staff of track.staves) names.push(...Object.keys(staff.chords ?? {}));
  const spelling = spellingFor(names, semitones);

  for (const track of score.tracks) {
    for (const staff of track.staves) {
      if (staff.ispercussion) continue;
      const tunings: number[] = staff.stringtuning?.tunings ?? [];

      const rename = new Map<string, string>();
      if (staff.chords) {
        const chords: Json = {};
        for (const [id, chord] of Object.entries<Json>(staff.chords)) {
          const name = transposeChord(chord.name ?? id, semitones, spelling);
          rename.set(id, name);
          // The fingering diagram belongs to the old chord.
          chords[name] = { ...chord, name, showdiagram: false };
        }
        staff.chords = chords;
      }

      const last = new Map<number, Placed>();
      for (const bar of staff.bars) {
        if (typeof bar.keysignature === 'number') bar.keysignature = wrapKey(bar.keysignature, semitones);
        for (const voice of bar.voices) {
          for (const beat of voice.beats) {
            if (beat.chordid && rename.has(beat.chordid)) beat.chordid = rename.get(beat.chordid);
            const notes: Json[] = beat.notes ?? [];
            if (!notes.length) continue;
            if (tunings.length) {
              transposeBeat(notes.filter((x) => x.string >= 1 && x.fret >= 0), tunings, semitones, last, result);
            } else {
              // Piano-style staff: notes are octave + tone.
              for (const note of notes) {
                const v = note.octave * 12 + note.tone + semitones;
                note.octave = Math.floor(v / 12);
                note.tone = ((v % 12) + 12) % 12;
              }
            }
          }
        }
      }
    }
  }
  return result;
}
