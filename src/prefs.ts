// Preferences, kept in this browser's localStorage. Plan §3.11, §12.1.
import { useSyncExternalStore } from 'react';

export type Theme = 'device' | 'light' | 'dark';

export type View = 'tab' | 'sheet' | 'both' | 'chords';

export type SheetSource = 'songsterr' | 'tab';

export interface SongPrefs {
  track?: number;
  speed?: number;
  /** Tracks drawn under the lead one. Plan §15.2. */
  also?: number[];
  /** Chords view: capo fret, or 'auto'. Plan §16.3. */
  capo?: number | 'auto';
  /** Chords view: Songsterr's sheet or the one built from the tab. */
  sheetSource?: SheetSource;
  /** Track autoswitch: the track to show in a bar, by bar index, chosen in the bar menu. Plan §17.2. */
  switches?: Record<string, number>;
  /** The YouTube recording playing along (video id), or none for the synth. Plan §18.3. */
  video?: string | null;
  /** The last recording used, for the V key. */
  lastVideo?: string;
}

export interface Prefs {
  theme: Theme;
  /** Tab, standard notation, or both stacked. Plan §15.1. */
  view: View;
  /** Plan §15.3. */
  multirest: boolean;
  showDynamics: boolean;
  showRhythm: boolean;
  /** Green chord names above the tab where it has none. Plan §16.4. */
  detectChords: boolean;
  /** Chords view. Plan §16.3. */
  simplifyChords: boolean;
  showDiagrams: boolean;
  /** Autoscroll speed, 0.25 to 3. */
  autoscrollSpeed: number;
  /** Follow the part across tracks during playback. Plan §17.2. */
  autoswitch: boolean;
  /** Toolbar buttons in the order chosen in Settings. Plan §17.3. Empty: the default order. */
  toolOrder: string[];
  /** Tab size, 0.7 to 1.5. */
  scale: number;
  fourBarsPerLine: boolean;
  /** Widest the sheet may be, in pixels. Plan §13.1. */
  pageWidth: number;
  /** How far apart notes sit: alphaTab's stretch force, 0.5 to 2.5. */
  spacing: number;
  /** Level of the track on screen and of all the others, 0 to 1. Plan §13.2. */
  leadVolume: number;
  backingVolume: number;
  countInBetweenLoops: boolean;
  /** Delay the cursor by this many milliseconds, for Bluetooth audio. */
  latencyMs: number;
  printScale: number;
  favorites: string[];
  songs: Record<string, SongPrefs>;
}

const KEY = 'woodshed.prefs.v1';
const DEFAULTS: Prefs = {
  theme: 'device',
  view: 'tab',
  multirest: false,
  showDynamics: true,
  showRhythm: true,
  detectChords: false,
  simplifyChords: false,
  showDiagrams: false,
  autoscrollSpeed: 1,
  autoswitch: false,
  toolOrder: [],
  scale: 1,
  fourBarsPerLine: false,
  pageWidth: 1100,
  spacing: 1,
  leadVolume: 1,
  backingVolume: 1,
  countInBetweenLoops: false,
  latencyMs: 0,
  printScale: 1,
  favorites: [],
  songs: {},
};

function read(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS; // private window or blocked storage: run on defaults
  }
}

let current = read();
const listeners = new Set<() => void>();

export const getPrefs = () => current;

export function setPrefs(patch: Partial<Prefs>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Not saved; the setting still applies until the page closes.
  }
  listeners.forEach((l) => l());
}

export function setSongPrefs(id: string, patch: SongPrefs) {
  setPrefs({ songs: { ...current.songs, [id]: { ...current.songs[id], ...patch } } });
}

export function toggleFavorite(id: string) {
  const on = current.favorites.includes(id);
  setPrefs({ favorites: on ? current.favorites.filter((f) => f !== id) : [...current.favorites, id] });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const usePrefs = () => useSyncExternalStore(subscribe, getPrefs);

export function resolvedTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'device') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
