// Chord diagrams and the automatic capo. Plan §16.3.
// A search over every shape within four frets, scored the way Songsterr's generator is
// described (fret height, span, fingers, muted strings, open strings, barres).
import { intervalsOf, parseChord, spellingFor, transposeChord } from './chords.ts';

/** Standard tuning, low E first. Chord sheets name standard-tuning shapes (§16.3). */
export const STANDARD = [40, 45, 50, 55, 59, 64];

export interface Fingering {
  /** One per string, low E first: -1 muted, 0 open, else the fret. */
  frets: number[];
  barre: { fret: number; from: number; to: number } | null;
  /** Lowest fretted note, 0 when every sounding string is open. */
  low: number;
  high: number;
  cost: number;
}

const cache = new Map<string, Fingering | null>();

/** The easiest way to play a chord name in standard tuning, or null for names that don't parse. */
export function fingeringFor(name: string): Fingering | null {
  const hit = cache.get(name);
  if (hit !== undefined) return hit;
  const c = parseChord(name);
  const found = c ? search(c.root, intervalsOf(c.quality), c.bass) : null;
  cache.set(name, found);
  return found;
}

function search(root: number, intervals: number[], bassPc: number | null, tuning = STANDARD): Fingering | null {
  const pcs = new Set(intervals.map((i) => (root + i) % 12));
  const bass = bassPc ?? root;
  pcs.add(bass);
  const power = intervals.length === 2;
  // The fifth may be left out, except where it is the chord (power chords).
  const required = intervals.filter((i) => !(i === 7 && !power)).map((i) => (root + i) % 12);
  const strings = tuning.length;

  let best: Fingering | null = null;
  const frets = new Array<number>(strings).fill(-1);
  for (let base = 1; base <= 12; base++) {
    const openOk = base <= 5;
    const options = tuning.map((open) => {
      const o = [-1];
      if (openOk && pcs.has(open % 12)) o.push(0);
      for (let f = base; f < base + 4; f++) if (pcs.has((open + f) % 12)) o.push(f);
      return o;
    });
    const walk = (s: number, firstSounding: number) => {
      if (s === strings) {
        const f = score(frets, tuning, required, power);
        if (f && (!best || f.cost < best.cost - 1e-9)) best = f;
        return;
      }
      for (const fret of options[s]) {
        // The lowest string that sounds has to be the bass note.
        if (fret >= 0 && firstSounding < 0 && (tuning[s] + fret) % 12 !== bass) continue;
        frets[s] = fret;
        walk(s + 1, firstSounding < 0 && fret >= 0 ? s : firstSounding);
      }
      frets[s] = -1;
    };
    walk(0, -1);
  }
  return best;
}

function score(frets: number[], tuning: number[], required: number[], power: boolean): Fingering | null {
  const sounding: number[] = [];
  for (let s = 0; s < frets.length; s++) if (frets[s] >= 0) sounding.push(s);
  if (sounding.length < (power ? 2 : 3)) return null;
  const tones = new Set(sounding.map((s) => (tuning[s] + frets[s]) % 12));
  if (!required.every((pc) => tones.has(pc))) return null;

  const fretted = sounding.filter((s) => frets[s] > 0);
  const low = fretted.length ? Math.min(...fretted.map((s) => frets[s])) : 0;
  const high = fretted.length ? Math.max(...fretted.map((s) => frets[s])) : 0;

  let fingers = fretted.length;
  let barre: Fingering['barre'] = null;
  if (fretted.length > 4) {
    const at = fretted.filter((s) => frets[s] === low);
    const from = at[0];
    const to = sounding[sounding.length - 1];
    // A barre presses every string from its first to the top string; none of them may ring open or be muted.
    for (let s = from; s <= to; s++) if (frets[s] < low) return null;
    barre = { fret: low, from, to };
    fingers = 1 + fretted.filter((s) => frets[s] > low).length;
    if (fingers > 4) return null;
  }

  const first = sounding[0];
  const last = sounding[sounding.length - 1];
  let interiorMutes = 0;
  for (let s = first; s <= last; s++) if (frets[s] < 0) interiorMutes++;
  const lowMutes = first;
  const highMutes = frets.length - 1 - last;
  const opens = sounding.filter((s) => frets[s] === 0);
  // An open string boxed in by fretted notes, up the neck, is a hard stretch (x20432 for Bm).
  const boxed = low >= 2 ? opens.filter((s) => frets[s - 1] > 0 && frets[s + 1] > 0).length : 0;

  let cost = 0.3 * fingers + (barre ? 0.8 : 0) + 0.25 * low + (high - low >= 3 ? 0.8 : 0)
    + 0.4 * lowMutes + 2.5 * interiorMutes + 1.5 * boxed - 0.3 * opens.length;
  if (power) cost += Math.max(0, sounding.length - 3) * 0.5;
  else cost += 1.5 * highMutes - 0.2 * sounding.length;
  return { frets: [...frets], barre, low, high, cost };
}

/** Hard for a beginner: a barre, or fretted above the third fret. */
export function isHard(name: string): boolean {
  const f = fingeringFor(name);
  return !f || !!f.barre || f.high > 3;
}

/**
 * The capo fret, 1 to 7, that turns the most chord changes into open shapes; null when no
 * fret does better than none. names lists every chord change in order, repeats included.
 */
export function autoCapo(names: string[]): number | null {
  const hardAt = (capo: number) => {
    const s = spellingFor(names, -capo);
    return names.reduce((n, name) => n + (isHard(transposeChord(name, -capo, s)) ? 1 : 0), 0);
  };
  const none = hardAt(0);
  let best = 0;
  let bestHard = none;
  for (let capo = 1; capo <= 7; capo++) {
    const h = hardAt(capo);
    if (h < bestHard) {
      best = capo;
      bestHard = h;
    }
  }
  return best === 0 ? null : best;
}
