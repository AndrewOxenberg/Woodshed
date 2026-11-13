// Where the lines of a song's words start. Plan §16.2.
// score.gp keeps one syllable per beat but drops the line breaks of Songsterr's lyric text,
// so the importer works them out here and the chords view puts them back.

const LF = 10;
const CR = 13;
const TAB = 9;
const SPACE = 32;
const OPEN = 91; // [
const CLOSE = 93; // ]
const DASH = 45;

/**
 * Split Guitar Pro lyric text the way alphaTab's Lyrics does (one chunk per beat), noting
 * which chunks start a new line and which start a new verse (after a blank line).
 * @param {string} text
 * @returns {{ chunks: string[], starts: number[], stanzas: number[] }}
 */
export function lyricLines(text) {
  const chunks = [];
  const starts = [];
  const stanzas = [];
  let breaks = 0;
  const add = (txt) => {
    const k = chunks.length;
    if (k > 0 && breaks > 0) {
      starts.push(k);
      if (breaks > 1) stanzas.push(k);
    }
    breaks = 0;
    let chunk = txt.split('+').join(' ');
    while (chunk.endsWith('_')) chunk = chunk.slice(0, -1);
    chunks.push(chunk);
  };

  // The same states as alphaTab 1.9's Lyrics._parse, so chunk k lands on the same beat.
  let state = 1;
  let next = 1;
  let skipSpace = false;
  let start = 0;
  let p = 0;
  const str = text ?? '';
  while (p < str.length) {
    const c = str.charCodeAt(p);
    if (state === 0) {
      if (c === LF) breaks++;
      else if (c === CR || c === TAB) {
        // skip
      } else if (c === SPACE) {
        if (!skipSpace) {
          state = next;
          continue;
        }
      } else {
        skipSpace = false;
        state = next;
        continue;
      }
    } else if (state === 1) {
      if (c === OPEN) state = 3;
      else {
        start = p;
        state = 2;
        continue;
      }
    } else if (state === 3) {
      if (c === CLOSE) state = 1;
    } else if (state === 2) {
      if (c === DASH) state = 4;
      else if (c === CR || c === LF || c === SPACE) {
        add(str.substr(start, p - start));
        if (c === LF) breaks++;
        state = 0;
        next = 1;
      }
    } else if (state === 4) {
      if (c !== DASH) {
        add(str.substr(start, p - start));
        skipSpace = true;
        state = 0;
        next = 1;
        continue;
      }
    }
    p++;
  }
  if (state === 2 && p !== start) add(str.substr(start, p - start));
  return { chunks, starts, stanzas };
}

/**
 * Line starts for every track with words, keyed by track index. Uses the first lyric line
 * that has text, which is the one the converter puts on beat.lyrics[0].
 * @param {{ newLyrics?: { text?: string }[] }[]} tracks raw Songsterr track data
 */
export function songLyricLines(tracks) {
  const out = {};
  tracks.forEach((t, i) => {
    const first = (t.newLyrics ?? []).find((l) => l.text?.trim());
    if (!first) return;
    const { starts, stanzas } = lyricLines(first.text);
    out[i] = { starts, stanzas };
  });
  return out;
}
