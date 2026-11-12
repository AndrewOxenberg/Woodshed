// Local library API, served by Vite in dev and preview. Plan §12.1.
// Every tab is a folder under library/. This runs on the user's own machine only.
import { readdir, readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import * as alphaTab from '@coderline/alphatab';
import { importFromLink } from '../tools/songsterr/import.mjs';
import { parseAsciiTab } from '../tools/ascii-tab.mjs';
import { scoreInstruments, songsterrInstruments } from '../tools/instruments.mjs';
import handleSongsterr from './songsterr-handler.mjs';

const MAX_UPLOAD = 25 * 1024 * 1024;
const ID = /^(songsterr|file)-([a-z0-9][a-z0-9-]*)$/;

const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));
const exists = (p) => stat(p).then(() => true, () => false);

function dirFor(root, id) {
  const m = id.match(ID);
  if (!m) return null;
  return join(root, m[1] === 'songsterr' ? 'songsterr' : 'files', m[2]);
}

async function describeSongsterr(root, name) {
  const dir = join(root, 'songsterr', name);
  if (!(await exists(join(dir, 'score.gp')))) return null;
  const source = await readJson(join(dir, 'source.json'));
  const meta = await readJson(join(dir, 'meta.json'));
  return {
    id: `songsterr-${name}`,
    kind: 'songsterr',
    title: source.title,
    artist: source.artist,
    tracks: meta.tracks.length,
    instruments: songsterrInstruments(meta),
    defaultTrack: source.linkedTrack ?? 0,
    addedAt: source.fetchedAt,
    link: source.link,
    revisionId: source.revisionId,
    format: 'Guitar Pro',
  };
}

async function describeFile(root, name) {
  const dir = join(root, 'files', name);
  if (!(await exists(join(dir, 'source.json')))) return null;
  const source = await readJson(join(dir, 'source.json'));
  if (!source.instruments) {
    // Saved before §13.4: classify once from the score and remember it.
    const bytes = new Uint8Array(await readFile(join(dir, source.scoreFile)));
    source.instruments = scoreInstruments(alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes, new alphaTab.Settings()));
    await writeFile(join(dir, 'source.json'), JSON.stringify(source, null, 2));
  }
  return {
    id: `file-${name}`,
    kind: 'file',
    title: source.title,
    artist: source.artist,
    tracks: source.tracks,
    instruments: source.instruments,
    defaultTrack: 0,
    addedAt: source.addedAt,
    originalName: source.originalName,
    format: source.format,
    note: source.note,
  };
}

async function list(root) {
  const out = [];
  for (const [folder, describe] of [['songsterr', describeSongsterr], ['files', describeFile]]) {
    const names = await readdir(join(root, folder)).catch(() => []);
    for (const name of names) {
      try {
        const entry = await describe(root, name);
        if (entry) out.push(entry);
      } catch {
        // A half-written folder is skipped, not fatal.
      }
    }
  }
  return out.sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)));
}

async function scorePath(root, id) {
  const dir = dirFor(root, id);
  if (!dir) return null;
  if (id.startsWith('songsterr-')) return join(dir, 'score.gp');
  const source = await readJson(join(dir, 'source.json'));
  return join(dir, source.scoreFile);
}

const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'tab';

const FORMATS = { '.gp': 'Guitar Pro', '.gp3': 'Guitar Pro 3', '.gp4': 'Guitar Pro 4', '.gp5': 'Guitar Pro 5',
  '.gpx': 'Guitar Pro 6', '.xml': 'MusicXML', '.musicxml': 'MusicXML', '.mxl': 'MusicXML',
  '.cap': 'Capella', '.capx': 'Capella', '.tex': 'alphaTex', '.alphatex': 'alphaTex' };

/** Save an uploaded file. Native formats are kept as they are; a text tab is converted to score.gp. */
async function saveUpload(root, fileName, bytes) {
  const ext = extname(fileName).toLowerCase();
  const settings = new alphaTab.Settings();
  let score;
  let scoreFile = `original${ext || '.bin'}`;
  let format = FORMATS[ext] ?? 'Score file';
  let note;
  let converted = null;
  try {
    settings.core.logLevel = alphaTab.LogLevel.None; // a text tab fails here by design first
    score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes, settings);
  } catch {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    // Both failures are the file's fault, not the server's: answer 400.
    if (text.includes(String.fromCharCode(0))) {
      throw Object.assign(new Error(`Could not read ${fileName}. Supported: Guitar Pro, MusicXML, alphaTex, plain-text tabs.`), { status: 400 });
    }
    let parsed;
    try {
      parsed = parseAsciiTab(text);
    } catch (e) {
      throw Object.assign(new Error(`Could not read ${fileName}. ${e.message}`), { status: 400 });
    }
    score = parsed.score;
    converted = new alphaTab.exporter.Gp7Exporter().export(score, parsed.settings);
    scoreFile = 'score.gp';
    format = 'Text tab';
    note = `Rhythm estimated from note spacing: ${parsed.stats.bars} bars, ${parsed.stats.notes} notes, ${parsed.stats.tempo} BPM.`;
  }

  const title = score.title?.trim() || basename(fileName, ext);
  const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 8);
  const name = `${slug(title)}-${hash}`;
  const dir = join(root, 'files', name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `original${ext || '.bin'}`), bytes);
  if (converted) await writeFile(join(dir, 'score.gp'), converted);
  await writeFile(join(dir, 'source.json'), JSON.stringify({
    title,
    artist: score.artist?.trim() ?? '',
    tracks: score.tracks.length,
    instruments: scoreInstruments(score),
    originalName: fileName,
    scoreFile,
    format,
    note,
    addedAt: new Date().toISOString(),
  }, null, 2));
  return describeFile(root, name);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('File is too large (25 MB limit).'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function send(res, status, body, type = 'application/json') {
  const data = type === 'application/json' ? JSON.stringify(body) : body;
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'no-store');
  res.end(data);
}

export function libraryApi(root) {
  const handler = async (req, res, next) => {
    const url = new URL(req.url, 'http://localhost');
    // alphaTab's music font and sounds. Its Vite plugin only copies these on build, so serve them in dev too.
    const asset = url.pathname.match(/^\/(font|soundfont)\/([A-Za-z0-9._-]+)$/);
    if (asset) {
      try {
        const data = await readFile(join(root, '..', 'node_modules', '@coderline', 'alphatab', 'dist', asset[1], asset[2]));
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Cache-Control', 'max-age=86400');
        return res.end(data);
      } catch {
        return next();
      }
    }
    if (!url.pathname.startsWith('/api/library')) return next();
    const rest = url.pathname.slice('/api/library'.length).split('/').filter(Boolean);
    try {
      if (req.method === 'GET' && rest.length === 0) return send(res, 200, await list(root));

      if (req.method === 'POST' && rest[0] === 'songsterr' && rest.length === 1) {
        const { link } = JSON.parse((await readBody(req, 4096)).toString('utf8') || '{}');
        if (typeof link !== 'string' || !link.trim()) return send(res, 400, { error: 'Paste a Songsterr link.' });
        const { dir, result, linkTrack } = await importFromLink(link.trim(), root);
        const entry = await describeSongsterr(root, basename(dir));
        return send(res, 200, { entry, track: linkTrack, problems: result.problems,
          unknown: Object.keys(result.unknownFields).length + Object.keys(result.unmappedValues).length });
      }

      if (req.method === 'POST' && rest[0] === 'files' && rest.length === 1) {
        const name = basename(url.searchParams.get('name') ?? 'tab');
        const bytes = new Uint8Array(await readBody(req, MAX_UPLOAD));
        if (!bytes.length) return send(res, 400, { error: 'The file is empty.' });
        return send(res, 200, { entry: await saveUpload(root, name, bytes) });
      }

      if (rest.length >= 1 && ID.test(rest[0])) {
        const id = rest[0];
        const dir = dirFor(root, id);
        if (!(await exists(dir))) return send(res, 404, { error: 'That tab is not in the library.' });
        if (req.method === 'GET' && rest[1] === 'score') {
          return send(res, 200, await readFile(await scorePath(root, id)), 'application/octet-stream');
        }
        if (req.method === 'GET' && rest.length === 1) {
          const entry = id.startsWith('songsterr-')
            ? await describeSongsterr(root, id.slice('songsterr-'.length))
            : await describeFile(root, id.slice('file-'.length));
          return entry ? send(res, 200, entry) : send(res, 404, { error: 'That tab is not in the library.' });
        }
        if (req.method === 'DELETE' && rest.length === 1) {
          await rm(dir, { recursive: true });
          return send(res, 200, { ok: true });
        }
      }
      return send(res, 404, { error: 'Unknown library request.' });
    } catch (e) {
      return send(res, e.status ?? 500, { error: e.message });
    }
  };
  return {
    name: 'woodshed-library-api',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      // vite preview runs the hosted build, which calls the same function Vercel serves (§14.1).
      server.middlewares.use('/api/songsterr', (req, res) => handleSongsterr(req, res));
      server.middlewares.use(handler);
    },
  };
}
