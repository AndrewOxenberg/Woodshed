// Preferences, kept in this browser's localStorage. Plan §3.11, §12.1.
import { useSyncExternalStore } from 'react';

export type Theme = 'device' | 'light' | 'dark';

export type View = 'tab' | 'sheet' | 'both';

export interface SongPrefs {
  track?: number;
  speed?: number;
  /** Tracks drawn under the lead one. Plan §15.2. */
  also?: number[];
}

export interface Prefs {
  theme: Theme;
  /** Tab, standard notation, or both stacked. Plan §15.1. */
  view: View;
  /** Plan §15.3. */
  multirest: boolean;
  showDynamics: boolean;
  showRhythm: boolean;
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
