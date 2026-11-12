// The library for the hosted copy: kept in this browser's IndexedDB. Plan §14.1.
// The local app (npm run dev) uses the library/ folder on disk instead (server/library-api.mjs).
import * as alphaTab from '@coderline/alphatab';
import { parseAsciiTab } from '../../tools/ascii-tab.mjs';
import { scoreInstruments } from '../../tools/instruments.mjs';
import type { Instrument, SongEntry } from '../api.ts';

const DB = 'woodshed';
const SONGS = 'songs';
const SCORES = 'scores';
const MAX_UPLOAD = 25 * 1024 * 1024;

const FORMATS: Record<string, string> = {
  '.gp': 'Guitar Pro', '.gp3': 'Guitar Pro 3', '.gp4': 'Guitar Pro 4', '.gp5': 'Guitar Pro 5',
  '.gpx': 'Guitar Pro 6', '.xml': 'MusicXML', '.musicxml': 'MusicXML', '.mxl': 'MusicXML',
  '.cap': 'Capella', '.capx': 'Capella', '.tex': 'alphaTex', '.alphatex': 'alphaTex',
};

let opening: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(SONGS, { keyPath: 'id' });
      req.result.createObjectStore(SCORES);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      opening = null;
      reject(new Error('This browser is not letting the page save tabs (private window or blocked storage).'));
    };
  });
  return opening;
}

function run<T>(stores: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction) => IDBRequest<T> | void): Promise<T> {
  return db().then((d) => new Promise<T>((resolve, reject) => {
    const tx = d.transaction(stores, mode);
    const req = work(tx);
    tx.oncomplete = () => resolve(req ? req.result : (undefined as T));
    tx.onerror = () => reject(tx.error ?? new Error('Saving failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('Saving failed.'));
  }));
}

async function save(entry: SongEntry, score: Uint8Array) {
  await run([SONGS, SCORES], 'readwrite', (tx) => {
    tx.objectStore(SONGS).put(entry);
    tx.objectStore(SCORES).put(score, entry.id);
  });
}

export async function listSongs(): Promise<SongEntry[]> {
  const all = await run<SongEntry[]>([SONGS], 'readonly', (tx) => tx.objectStore(SONGS).getAll());
  return all.sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)));
}

export async function getSong(id: string): Promise<SongEntry> {
  const entry = await run<SongEntry | undefined>([SONGS], 'readonly', (tx) => tx.objectStore(SONGS).get(id));
  if (!entry) throw new Error('That tab is not in the library on this browser.');
  return entry;
}

export async function getScore(id: string): Promise<Uint8Array> {
  const bytes = await run<Uint8Array | ArrayBuffer | undefined>([SCORES], 'readonly', (tx) => tx.objectStore(SCORES).get(id));
  if (!bytes) throw new Error('That tab is not in the library on this browser.');
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

export async function deleteSong(id: string): Promise<{ ok: true }> {
  await run([SONGS, SCORES], 'readwrite', (tx) => {
    tx.objectStore(SONGS).delete(id);
    tx.objectStore(SCORES).delete(id);
  });
  return { ok: true };
}

const slug = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'tab';

async function shortHash(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', bytes as BufferSource));
  return Array.from(digest.slice(0, 4), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Same rules as the local API: native formats kept as they are, a text tab converted to Guitar Pro. */
export async function uploadFile(file: File): Promise<{ entry: SongEntry }> {
  if (file.size > MAX_UPLOAD) throw new Error('File is too large (25 MB limit).');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.length) throw new Error('The file is empty.');
  const dot = file.name.lastIndexOf('.');
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';

  let score: alphaTab.model.Score;
  let stored: Uint8Array = bytes;
  let format = FORMATS[ext] ?? 'Score file';
  let note: string | undefined;
  try {
    // Quiet: a text tab fails here by design (alphaTab tries it as alphaTex) before the text-tab reader runs.
    const quiet = new alphaTab.Settings();
    quiet.core.logLevel = alphaTab.LogLevel.None;
    score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes, quiet);
  } catch {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (text.includes(String.fromCharCode(0))) {
      throw new Error(`Could not read ${file.name}. Supported: Guitar Pro, MusicXML, alphaTex, plain-text tabs.`);
    }
    let parsed;
    try {
      parsed = parseAsciiTab(text);
    } catch (e) {
      throw new Error(`Could not read ${file.name}. ${(e as Error).message}`);
    }
    score = parsed.score;
    stored = new alphaTab.exporter.Gp7Exporter().export(score, parsed.settings);
    format = 'Text tab';
    note = `Rhythm estimated from note spacing: ${parsed.stats.bars} bars, ${parsed.stats.notes} notes, ${parsed.stats.tempo} BPM.`;
  }

  const title = score.title?.trim() || (dot > 0 ? file.name.slice(0, dot) : file.name);
  const entry: SongEntry = {
    id: `file-${slug(title)}-${await shortHash(bytes)}`,
    kind: 'file',
    title,
    artist: score.artist?.trim() ?? '',
    tracks: score.tracks.length,
    defaultTrack: 0,
    instruments: scoreInstruments(score) as Record<Instrument, number[]>,
    addedAt: new Date().toISOString(),
    format,
    originalName: file.name,
    note,
  };
  await save(entry, stored);
  return { entry };
}

interface SongsterrReply {
  entry: Omit<SongEntry, 'addedAt'>;
  gp: string;
  track: number | null;
  problems: string[];
  unknown: number;
  error?: string;
}

/** The server fetches and converts (browsers can't read Songsterr's pages); the song is kept here. */
export async function importSongsterr(link: string) {
  const res = await fetch('/api/songsterr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ link }),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<SongsterrReply>;
  if (!res.ok || !body.entry || !body.gp) throw new Error(body.error ?? `Import failed (${res.status}).`);
  const bin = atob(body.gp);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const entry: SongEntry = { ...body.entry, addedAt: new Date().toISOString() };
  await save(entry, bytes);
  return { entry, track: body.track ?? null, problems: body.problems ?? [], unknown: body.unknown ?? 0 };
}
