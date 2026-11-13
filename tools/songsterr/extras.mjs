// What the chords view needs beside score.gp, for one saved Songsterr song. Plan §16.2.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readChordSheet, readSaved } from './fetch.mjs';
import { songLyricLines } from './lyrics.mjs';

/**
 * YouTube recordings Songsterr has synced to this revision (plan §18.1): video id, kind, the
 * tracks a backing or solo video leaves out or keeps, and the start time of every bar played.
 */
async function readVideos(dir) {
  try {
    const list = JSON.parse(await readFile(join(dir, 'video-points.json'), 'utf8'));
    return list
      .filter((v) => v.status === 'done' && typeof v.videoId === 'string' && Array.isArray(v.points) && v.points.length > 1)
      .map((v) => ({ videoId: v.videoId, feature: v.feature ?? null, tracks: Array.isArray(v.tracks) ? v.tracks : null, points: v.points }));
  } catch {
    return [];
  }
}

/** @returns {Promise<{ chordpro: string | null, lyricLines: Record<number, { starts: number[], stanzas: number[] }>, videos: object[] }>} */
export async function songExtras(dir) {
  const { tracks } = await readSaved(dir);
  return { chordpro: await readChordSheet(dir), lyricLines: songLyricLines(tracks), videos: await readVideos(dir) };
}

export const NO_EXTRAS = { chordpro: null, lyricLines: {}, videos: [] };
