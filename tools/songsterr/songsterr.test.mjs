// node --test tools/   (no network: link parsing, plus every song already in library/songsterr/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as aT from '@coderline/alphatab';
import { parseLink, readSaved } from './fetch.mjs';
import { defaultTrack, popularTrack, scoreInstruments, songsterrInstruments, trackForLink } from '../instruments.mjs';
import { parseAsciiTab } from '../ascii-tab.mjs';
import { toScore, toGuitarPro, loadGuitarPro, countNotes, rawNoteCounts } from './convert.mjs';
import { lyricLines, songLyricLines } from './lyrics.mjs';

const SONGS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'library', 'songsterr');

test('parseLink: song, track and revision', () => {
  assert.deepEqual(
    parseLink('https://www.songsterr.com/a/wsa/malcolm-todd-earrings-tab-s1576708t1/r8752738'),
    { songId: 1576708, trackIndex: 1, revisionId: 8752738, kind: null,
      pageUrl: 'https://www.songsterr.com/a/wsa/malcolm-todd-earrings-tab-s1576708t1/r8752738' },
  );
});

test('parseLink: optional parts and query strings', () => {
  const a = parseLink('https://www.songsterr.com/a/wsa/nirvana-come-as-you-are-tab-s14');
  assert.equal(a.songId, 14);
  assert.equal(a.trackIndex, null);
  assert.equal(a.revisionId, null);
  const b = parseLink('https://songsterr.com/a/wsa/nirvana-come-as-you-are-bass-tab-s14t6?demo=enabled');
  assert.equal(b.trackIndex, 6);
  assert.equal(b.pageUrl, 'https://songsterr.com/a/wsa/nirvana-come-as-you-are-bass-tab-s14t6');
});

test('parseLink: rejects other sites and links without a song id', () => {
  assert.throws(() => parseLink('https://songster.com/a/wsa/x-tab-s14'), /Not a Songsterr link/);
  assert.throws(() => parseLink('https://www.songsterr.com/plus'), /No song id/);
  assert.throws(() => parseLink('not a link'), /Not a URL/);
});

test('parseLink: bass and drum links', () => {
  assert.equal(parseLink('https://www.songsterr.com/a/wsa/nirvana-come-as-you-are-bass-tab-s14').kind, 'bass');
  assert.equal(parseLink('https://www.songsterr.com/a/wsa/nirvana-come-as-you-are-drum-tab-s14').kind, 'drums');
  assert.equal(parseLink('https://www.songsterr.com/a/wsa/nirvana-come-as-you-are-tab-s14').kind, null);
});

test('trackForLink: a track number wins, then the instrument, else none', () => {
  const meta = { popularTrackBass: 2, popularTrackDrum: 9, tracks: [
    { isGuitar: true }, { isGuitar: true }, { isBassGuitar: true }, { isDrums: true }, {} ] };
  assert.equal(trackForLink({ trackIndex: 1, kind: 'bass' }, meta), 1);
  assert.equal(trackForLink({ trackIndex: null, kind: 'bass' }, meta), 2);
  assert.equal(trackForLink({ trackIndex: null, kind: 'drums' }, meta), 3, 'falls back when the suggested track is not a drum track');
  assert.equal(trackForLink({ trackIndex: null, kind: null }, meta), null);
  assert.equal(trackForLink({ trackIndex: 40, kind: null }, meta), null, 'ignores a track number the song does not have');
  assert.deepEqual(songsterrInstruments(meta), { guitar: [0, 1], bass: [2], drums: [3], other: [4] });
});

test('scoreInstruments: a four-string text tab is a bass, six strings a guitar', () => {
  const bass = parseAsciiTab(['G|--------2---4---|', 'D|----2-----------|', 'A|-0--------------|', 'E|----------------|'].join('\n')).score;
  const guitar = parseAsciiTab(['e|----------------|', 'B|----------------|', 'G|----------------|', 'D|-2---2---4---5--|', 'A|-0---0---2---3--|', 'E|----------------|'].join('\n')).score;
  assert.deepEqual(scoreInstruments(bass), { guitar: [], bass: [0], drums: [], other: [] });
  assert.deepEqual(scoreInstruments(guitar), { guitar: [0], bass: [], drums: [], other: [] });
});

const saved = await readdir(SONGS).catch(() => []);

for (const name of saved) {
  test(`library ${name}: score.gp round trip keeps every track, note and pitch`, async () => {
    const data = await readSaved(join(SONGS, name));
    const { score, settings, report } = toScore(data);
    assert.deepEqual(report.unknown, {}, 'fields the converter does not know');
    assert.deepEqual(report.unmapped, {}, 'values the converter does not know');

    const back = loadGuitarPro(toGuitarPro(score, settings));
    assert.equal(back.tracks.length, data.tracks.length);
    assert.deepEqual(countNotes(back), rawNoteCounts(data.tracks));

    // Songsterr: string 0 is the top line, pitch = tuning[string] + fret.
    data.tracks.forEach((t, ti) => {
      if (back.tracks[ti].isPercussion) return;
      const want = [];
      for (const m of t.measures) for (const v of m.voices) for (const b of v.beats) {
        if (!b.rest) for (const n of b.notes) if (!n.rest) want.push(t.tuning[n.string] + n.fret);
      }
      const got = [];
      for (const bar of back.tracks[ti].staves[0].bars) for (const v of bar.voices) {
        for (const b of v.beats) for (const n of b.notes) got.push(n.realValue);
      }
      assert.deepEqual(got, want, `${t.name}: pitches`);
    });
  });
}

if (saved.includes('1576708-r8752738')) {
  test('Earrings: plays 148.5 s (2-beat pickup + 49 bars of 4/4 at 80 BPM)', async () => {
    const data = await readSaved(join(SONGS, '1576708-r8752738'));
    const { score, settings } = toScore(data);
    const back = loadGuitarPro(toGuitarPro(score, settings));
    const gen = new aT.midi.MidiFileGenerator(back, settings,
      new aT.midi.AlphaSynthMidiFileHandler(new aT.midi.MidiFile()));
    gen.generate();
    const bars = gen.tickLookup.masterBars;
    const seconds = (bars[bars.length - 1].end / 960) * (60 / back.tempo);
    assert.equal(back.masterBars[0].isAnacrusis, true);
    assert.equal(seconds, 148.5);
  });
}

if (saved.includes('14-r9744332')) {
  test('Come As You Are: lyrics, let ring and the clean/distortion switch survive', async () => {
    const data = await readSaved(join(SONGS, '14-r9744332'));
    const { score, settings } = toScore(data);
    const back = loadGuitarPro(toGuitarPro(score, settings));
    const words = [];
    for (const bar of back.tracks[0].staves[0].bars) for (const b of bar.voices[0].beats) {
      if (b.lyrics?.[0] && words.length < 4) words.push(b.lyrics[0]);
    }
    assert.deepEqual(words, ['Come,', 'as', 'you', 'are,']);
    const chorus = back.tracks[4].staves[0].bars;
    const program = (bar) => chorus[bar].voices[0].beats[0].automations.find((a) => a.type === 2)?.value;
    assert.equal(program(60), 30); // distortion
    assert.equal(program(78), 27); // back to clean
    const letRing = chorus.some((bar) => bar.voices.some((v) => v.beats.some((b) => b.notes.some((n) => n.isLetRing))));
    assert.ok(letRing);
  });
}

test('lyricLines: same chunks as alphaTab, line and verse starts marked', () => {
  const text = 'Used to sp-end my\nLi-quor was  the\n\n[chorus]You+are a-way';
  const { chunks, starts, stanzas } = lyricLines(text);
  const ly = new aT.model.Lyrics();
  ly.text = text;
  ly.finish();
  assert.deepEqual(chunks, ly.chunks);
  assert.deepEqual(chunks.slice(0, 5), ['Used', 'to', 'sp-', 'end', 'my']);
  assert.equal(chunks[starts[0]], 'Li-');
  assert.equal(chunks[stanzas[0]], 'You are');
});

test('lyricLines: every saved song with words splits exactly as alphaTab does', async () => {
  let songs = [];
  try {
    songs = await readdir(SONGS);
  } catch {
    return;
  }
  for (const folder of songs) {
    const { tracks } = await readSaved(join(SONGS, folder));
    const lines = songLyricLines(tracks);
    for (const [i, { starts }] of Object.entries(lines)) {
      const text = tracks[i].newLyrics.find((l) => l.text?.trim()).text;
      const ly = new aT.model.Lyrics();
      ly.text = text;
      ly.finish();
      assert.deepEqual(lyricLines(text).chunks, ly.chunks, `${folder} track ${i}`);
      assert.equal(starts.length + 1, text.split('\n').filter((l) => l.trim()).length, `${folder} track ${i} line count`);
    }
  }
});

test('popularTrack: the most played guitar track, never drums (plan §19.3)', () => {
  const t = (instrument, isDrums = false) => ({ instrument, isDrums });
  const meta = { tracks: [t('Vocals'), t('Electric Guitar'), t('Drums', true)], popularTrack: 2, popularTrackGuitar: 1 };
  assert.equal(popularTrack(meta), 1);
  assert.equal(popularTrack({ ...meta, popularTrackGuitar: undefined }), songsterrInstruments(meta).guitar[0] ?? 0);
  assert.notEqual(popularTrack({ ...meta, popularTrackGuitar: undefined }), 2);
  assert.equal(defaultTrack({ guitar: [], bass: [], drums: [0], other: [1] }, 2), 1);
  assert.equal(defaultTrack({ guitar: [3], bass: [], drums: [0], other: [] }, 4), 3);
});

test('popularTrack: every saved song opens on its most played guitar track', async () => {
  let songs = [];
  try {
    songs = await readdir(SONGS);
  } catch {
    return;
  }
  for (const folder of songs) {
    const { meta } = await readSaved(join(SONGS, folder));
    const pick = popularTrack(meta);
    assert.ok(!songsterrInstruments(meta).drums.includes(pick), `${folder} opens on drums`);
  }
});
