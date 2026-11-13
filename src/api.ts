// Library access. Plan §12.1 (local API on disk) and §14.1 (in the browser, hosted build).

export type Instrument = 'guitar' | 'bass' | 'drums' | 'other';

export interface SongEntry {
  id: string;
  kind: 'songsterr' | 'file';
  title: string;
  artist: string;
  tracks: number;
  defaultTrack: number;
  /** Track numbers by instrument. Plan §13.4. */
  instruments: Record<Instrument, number[]>;
  addedAt: string;
  format: string;
  link?: string;
  revisionId?: number;
  originalName?: string;
  note?: string;
}

/** A YouTube recording synced to the song. Plan §18.1. */
export interface Recording {
  videoId: string;
  /** null: the original full mix. */
  feature: 'backing' | 'solo' | 'playthrough' | 'alternative' | null;
  /** Backing: the tracks left out. Solo: the tracks kept. */
  tracks: number[] | null;
  /** Seconds at which each bar starts, in playing order. */
  points: number[];
}

/** What the chords view and the recordings need beside the tab. Plan §16.2, §18. */
export interface SongExtras {
  /** Songsterr's own chord sheet, ChordPro text. */
  chordpro: string | null;
  /** Which lyric syllables start a line or verse, per track. */
  lyricLines: Record<number, { starts: number[]; stanzas: number[] }>;
  /** Missing on songs saved in the browser before §18. */
  videos?: Recording[];
}

export const NO_EXTRAS: SongExtras = { chordpro: null, lyricLines: {}, videos: [] };

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

/** The local library API on disk, for npm run dev. */
const local = {
  listSongs: () => fetch('/api/library').then((r) => json<SongEntry[]>(r)),
  getSong: (id: string) => fetch(`/api/library/${id}`).then((r) => json<SongEntry>(r)),
  async getScore(id: string): Promise<Uint8Array> {
    const res = await fetch(`/api/library/${id}/score`);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not load the tab.');
    return new Uint8Array(await res.arrayBuffer());
  },
  getExtras: (id: string) => fetch(`/api/library/${id}/extras`).then((r) => json<SongExtras>(r)),
  uploadFile: (file: File) =>
    fetch(`/api/library/files?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file })
      .then((r) => json<{ entry: SongEntry }>(r)),
  importSongsterr: (link: string) =>
    fetch('/api/library/songsterr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ link }) })
      .then((r) => json<{ entry: SongEntry; track: number | null; problems: string[]; unknown: number }>(r)),
  deleteSong: (id: string) => fetch(`/api/library/${id}`, { method: 'DELETE' }).then((r) => json<{ ok: true }>(r)),
};

// The hosted build keeps its library in the browser (plan §14.1); loaded only there.
const browser = () => import('./library/browserStore.ts');
const hosted = !import.meta.env.DEV;

/** Where songs are kept: this browser (hosted build) or library/ on disk (npm run dev). */
export const libraryWhere: 'browser' | 'disk' = hosted ? 'browser' : 'disk';

export const listSongs = () => (hosted ? browser().then((b) => b.listSongs()) : local.listSongs());
export const getSong = (id: string) => (hosted ? browser().then((b) => b.getSong(id)) : local.getSong(id));
export const getScore = (id: string) => (hosted ? browser().then((b) => b.getScore(id)) : local.getScore(id));
export const getExtras = (id: string): Promise<SongExtras> =>
  (hosted ? browser().then((b) => b.getExtras(id)) : local.getExtras(id)).catch(() => NO_EXTRAS);
export const uploadFile = (file: File) => (hosted ? browser().then((b) => b.uploadFile(file)) : local.uploadFile(file));
export const importSongsterr = (link: string) =>
  (hosted ? browser().then((b) => b.importSongsterr(link)) : local.importSongsterr(link));
export const deleteSong = (id: string) => (hosted ? browser().then((b) => b.deleteSong(id)) : local.deleteSong(id));

/**
 * The track a song opens on: the one last used, unless that was drums and drums were not asked
 * for, then the song's default (its most popular guitar track). Plan §19.3.
 */
export function openingTrack(song: SongEntry, remembered: number | undefined, wantDrums = false): number {
  if (remembered === undefined || remembered < 0 || remembered >= song.tracks) return song.defaultTrack;
  if (!wantDrums && song.instruments.drums.includes(remembered)) return song.defaultTrack;
  return remembered;
}
