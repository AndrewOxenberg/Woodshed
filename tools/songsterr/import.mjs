// Songsterr link -> saved raw data -> score.gp, with a round-trip check. Plan §11.
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchSong, parseLink, readSaved } from './fetch.mjs';
import { trackForLink } from '../instruments.mjs';
import { toScore, toGuitarPro, loadGuitarPro, countNotes, rawNoteCounts } from './convert.mjs';

/**
 * Import one link into libraryRoot. Re-converts from disk when the revision is already saved.
 * Returns { dir, result } where result is what convert-report.json holds.
 */
export async function importFromLink(link, libraryRoot, log = () => {}) {
  const { dir } = await fetchSong(link, libraryRoot, log);
  const saved = await readSaved(dir);
  const { score, settings, report } = toScore(saved);

  const gp = toGuitarPro(score, settings);
  await writeFile(join(dir, 'score.gp'), gp);

  // Check the written file, not the in-memory score.
  const back = loadGuitarPro(gp);
  const raw = rawNoteCounts(saved.tracks);
  const built = countNotes(score);
  const reread = countNotes(back);
  const problems = [];
  if (back.tracks.length !== saved.tracks.length) {
    problems.push(`score.gp has ${back.tracks.length} tracks, source has ${saved.tracks.length}`);
  }
  if (back.masterBars.length !== score.masterBars.length) {
    problems.push(`score.gp has ${back.masterBars.length} bars, built score has ${score.masterBars.length}`);
  }
  saved.tracks.forEach((t, i) => {
    if (raw[i] !== built[i] || raw[i] !== reread[i]) {
      problems.push(`${t.name}: notes raw ${raw[i]}, built ${built[i]}, score.gp ${reread[i]}`);
    }
  });

  const result = {
    convertedAt: new Date().toISOString(),
    title: back.title,
    artist: back.artist,
    tempo: back.tempo,
    bars: back.masterBars.length,
    pickupBar: back.masterBars[0]?.isAnacrusis ?? false,
    tracks: back.tracks.map((t, i) => ({ name: t.name, notes: reread[i], percussion: t.isPercussion })),
    gpBytes: gp.length,
    problems,
    unknownFields: report.unknown,
    unmappedValues: report.unmapped,
    warnings: report.warnings,
  };
  await writeFile(join(dir, 'convert-report.json'), JSON.stringify(result, null, 2));
  // The track this link names, even when the song was already saved from another link.
  const linkTrack = trackForLink(parseLink(link), saved.meta);
  return { dir, result, source: saved.source, linkTrack };
}
