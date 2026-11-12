// Fetch a Songsterr tab by link and save the raw data. Plan §11.
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { trackForLink } from '../instruments.mjs';

const CDN = 'https://dqsljvtekg760.cloudfront.net';
const ORIGIN = 'https://www.songsterr.com';
const CLIENT = 'woodshed-importer/0.1';
const PAUSE_MS = 300; // §11.2: one request at a time, with a pause

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** §11.1: song id, optional track index, optional revision id. */
export function parseLink(link) {
  let url;
  try {
    url = new URL(link);
  } catch {
    throw new Error(`Not a URL: ${link}`);
  }
  if (!/(^|\.)songsterr\.com$/.test(url.hostname)) {
    throw new Error(`Not a Songsterr link: ${url.hostname}`);
  }
  const m = url.pathname.match(/-s(\d+)(?:t(\d+))?(?:\/r(\d+))?\/?$/);
  if (!m) throw new Error(`No song id in link: ${url.pathname}`);
  return {
    songId: Number(m[1]),
    trackIndex: m[2] !== undefined ? Number(m[2]) : null,
    revisionId: m[3] !== undefined ? Number(m[3]) : null,
    // "-bass-tab-" and "-drum-tab-" links mean that instrument's track. Plan §13.4.
    kind: /-bass-tab-s\d+/.test(url.pathname) ? 'bass' : /-drum-tab-s\d+/.test(url.pathname) ? 'drums' : null,
    pageUrl: `${url.origin}${url.pathname}`,
  };
}

async function get(url, kind) {
  const res = await fetch(url, { headers: { 'User-Agent': CLIENT } });
  if (!res.ok) throw new Error(`${kind}: HTTP ${res.status} for ${url}`);
  return res;
}

function readState(html) {
  const m = html.match(/<script id="state" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('Page has no state block. Songsterr may have changed its page format.');
  return JSON.parse(m[1]);
}

const exists = (p) => access(p).then(() => true, () => false);

/**
 * Fetch everything for one link into library/songsterr/<songId>-r<revisionId>/.
 * Skips the network if that revision is already saved.
 */
export async function fetchSong(link, libraryRoot, log = console.log) {
  const parsed = parseLink(link);

  // A saved revision named in the link needs no request at all.
  if (parsed.revisionId) {
    const dir = join(libraryRoot, 'songsterr', `${parsed.songId}-r${parsed.revisionId}`);
    if (await exists(join(dir, 'source.json'))) {
      log(`Already saved: ${dir}`);
      return { dir, parsed, cached: true };
    }
  }

  log(`Fetching page for song ${parsed.songId}...`);
  const html = await (await get(parsed.pageUrl, 'page')).text();
  const state = readState(html);
  const cur = state?.meta?.current;
  if (!cur?.songId || !cur?.revisionId || !cur?.image || !Array.isArray(cur?.tracks)) {
    throw new Error('State block is missing songId, revisionId, image or tracks.');
  }
  if (cur.songId !== parsed.songId) {
    throw new Error(`Page is song ${cur.songId}, link said ${parsed.songId}.`);
  }
  if (parsed.revisionId && cur.revisionId !== parsed.revisionId) {
    throw new Error(`Page served revision ${cur.revisionId}, link asked for ${parsed.revisionId}.`);
  }

  const dir = join(libraryRoot, 'songsterr', `${cur.songId}-r${cur.revisionId}`);
  if (await exists(join(dir, 'source.json'))) {
    log(`Already saved: ${dir}`);
    return { dir, parsed, cached: true };
  }
  await mkdir(join(dir, 'tracks'), { recursive: true });

  const meta = { ...cur, allowedByLicense: state.meta.allowedByLicense };
  await writeFile(join(dir, 'meta.json'), JSON.stringify(meta, null, 2));

  for (let i = 0; i < cur.tracks.length; i++) {
    await sleep(PAUSE_MS);
    const url = `${CDN}/${cur.songId}/${cur.revisionId}/${cur.image}/${i}.json`;
    const body = await (await get(url, `track ${i}`)).text();
    JSON.parse(body); // refuse to save a non-JSON body
    await writeFile(join(dir, 'tracks', `${i}.json`), body);
    log(`  track ${i}: ${cur.tracks[i].name ?? cur.tracks[i].instrument} (${body.length} bytes)`);
  }

  await sleep(PAUSE_MS);
  try {
    const vp = await get(`${ORIGIN}/api/video-points/${cur.songId}/${cur.revisionId}/list`, 'video points');
    await writeFile(join(dir, 'video-points.json'), await vp.text());
  } catch (e) {
    log(`  video points skipped: ${e.message}`);
  }

  // Written last: its presence means the folder is complete.
  await writeFile(
    join(dir, 'source.json'),
    JSON.stringify(
      {
        link,
        songId: cur.songId,
        revisionId: cur.revisionId,
        linkedTrack: trackForLink(parsed, cur) ?? cur.defaultTrack ?? 0,
        title: cur.title,
        artist: cur.artist,
        fetchedAt: new Date().toISOString(),
        client: CLIENT,
      },
      null,
      2,
    ),
  );
  return { dir, parsed, cached: false };
}

export async function readSaved(dir) {
  const source = JSON.parse(await readFile(join(dir, 'source.json'), 'utf8'));
  const meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8'));
  const tracks = [];
  for (let i = 0; i < meta.tracks.length; i++) {
    tracks.push(JSON.parse(await readFile(join(dir, 'tracks', `${i}.json`), 'utf8')));
  }
  return { source, meta, tracks };
}
