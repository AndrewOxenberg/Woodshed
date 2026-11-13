// POST /api/songsterr for the hosted copy. Plan §14.1.
// Runs the §11 importer in a scratch folder and hands back score.gp; nothing is kept.
// Open to anyone who can reach the site: the password gate was removed on 2026-11-12 (plan §14.5).
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importFromLink } from '../tools/songsterr/import.mjs';
import { readSaved } from '../tools/songsterr/fetch.mjs';
import { popularTrack, songsterrInstruments, trackForLink } from '../tools/instruments.mjs';
import { parseLink } from '../tools/songsterr/fetch.mjs';
import { songExtras } from '../tools/songsterr/extras.mjs';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readLink(req) {
  // Vercel parses a JSON body into req.body; Vite's preview server does not.
  if (req.body && typeof req.body === 'object') return req.body.link;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}').link;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) throw Object.assign(new Error('Request is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}').link;
}

export default async function handleSongsterr(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' });
  const root = join(tmpdir(), `woodshed-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  try {
    let link;
    try {
      link = await readLink(req);
    } catch (e) {
      return send(res, e.status ?? 400, { error: e.status ? e.message : 'Send {"link": "..."} as JSON.' });
    }
    if (typeof link !== 'string' || !link.trim()) return send(res, 400, { error: 'Paste a Songsterr link.' });

    let imported;
    try {
      imported = await importFromLink(link.trim(), root);
    } catch (e) {
      // Bad links and Songsterr's own refusals are the caller's to see, not a server fault.
      return send(res, 502, { error: e.message });
    }
    const { dir, result, linkTrack } = imported;
    const saved = await readSaved(dir);
    const gp = await readFile(join(dir, 'score.gp'));
    const { source, meta } = saved;
    return send(res, 200, {
      entry: {
        id: `songsterr-${source.songId}-r${source.revisionId}`,
        kind: 'songsterr',
        title: source.title,
        artist: source.artist,
        tracks: meta.tracks.length,
        instruments: songsterrInstruments(meta),
        defaultTrack: trackForLink(parseLink(source.link), meta) ?? popularTrack(meta),
        link: source.link,
        revisionId: source.revisionId,
        format: 'Guitar Pro',
      },
      gp: gp.toString('base64'),
      // The chord sheet and lyric line starts, kept with the song in the browser (plan §16.2).
      extras: await songExtras(dir),
      track: linkTrack,
      problems: result.problems,
      unknown: Object.keys(result.unknownFields).length + Object.keys(result.unmappedValues).length,
    });
  } catch (e) {
    return send(res, 500, { error: `Import failed. ${e.message}` });
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }
}
