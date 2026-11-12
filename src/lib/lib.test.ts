// npm test (offline). Logic behind transpose, chord spelling and the audio writers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as alphaTab from '@coderline/alphatab';
import { parseChord, spellingFor, transposeChord } from './chords.ts';
import { transposeScoreJson } from './transpose.ts';
import { encodeWav, wavSeconds, countMidiNotes } from './audio.ts';

const LIBRARY = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'library', 'songsterr');
const Json = alphaTab.model.JsonConverter;

test('chords: +1 from Am spells every chord in flats', () => {
  const names = ['Am', 'E/G#', 'C/G', 'D/F#', 'Fmaj7'];
  const s = spellingFor(names, 1);
  assert.deepEqual(names.map((n) => transposeChord(n, 1, s)), ['B♭m', 'F/A', 'D♭/A♭', 'E♭/G', 'G♭maj7']);
});

test('chords: +2 from Am is Bm, in sharps', () => {
  const s = spellingFor(['Am', 'F', 'C#m'], 2);
  assert.equal(transposeChord('Am', 2, s), 'Bm');
  assert.equal(transposeChord('C#m', 2, s), 'D♯m'.replace('♯', '#'));
});

test('chords: plain-text accidentals stay plain, odd names pass through', () => {
  const s = spellingFor(['Bb', 'Eb7'], -1);
  assert.equal(transposeChord('Bb', -1, s), 'A');
  assert.equal(transposeChord('Eb7', -1, s), 'D7');
  assert.equal(transposeChord('N.C.', 3, s), 'N.C.');
  assert.equal(parseChord('Hm'), null);
});

async function load(folder: string) {
  const bytes = new Uint8Array(await readFile(join(LIBRARY, folder, 'score.gp')));
  const settings = new alphaTab.Settings();
  const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes, settings);
  return { score, settings, json: Json.scoreToJson(score) };
}

function pitches(score: alphaTab.model.Score) {
  return score.tracks.map((t) => {
    const out: { pitch: number; fret: number; string: number }[] = [];
    if (t.isPercussion) return out;
    for (const bar of t.staves[0].bars) for (const v of bar.voices) for (const b of v.beats) {
      for (const n of b.notes) out.push({ pitch: n.realValue, fret: n.fret, string: n.string });
    }
    return out;
  });
}

const have = async (folder: string) => readFile(join(LIBRARY, folder, 'score.gp')).then(() => true, () => false);

test('transpose +2: every fret goes up 2 on the same string', { skip: !(await have('1576708-r8752738')) }, async () => {
  const { score, settings, json } = await load('1576708-r8752738');
  const obj = JSON.parse(json);
  const result = transposeScoreJson(obj, 2);
  const moved = Json.jsObjectToScore(obj, settings);
  assert.deepEqual(result, { moved: 0, raised: 0 });
  const before = pitches(score);
  const after = pitches(moved);
  before.forEach((track, ti) => track.forEach((n, i) => {
    assert.equal(after[ti][i].fret, n.fret + 2);
    assert.equal(after[ti][i].string, n.string);
    assert.equal(after[ti][i].pitch, n.pitch + 2);
  }));
  // E♭madd9 and A♭ on the rhythm guitar become Fmadd9 and B♭.
  assert.deepEqual([...moved.tracks[2].staves[0].chords!.keys()].slice(0, 2), ['Fmadd9', 'B♭']);
});

test('transpose -3: open strings move down a string or go up an octave, never below fret 0', { skip: !(await have('14-r9744332')) }, async () => {
  const { score, settings, json } = await load('14-r9744332');
  const obj = JSON.parse(json);
  const result = transposeScoreJson(obj, -3);
  const moved = Json.jsObjectToScore(obj, settings);
  const before = pitches(score);
  const after = pitches(moved);
  let octaveUp = 0;
  before.forEach((track, ti) => {
    assert.equal(after[ti].length, track.length);
    track.forEach((n, i) => {
      const got = after[ti][i];
      assert.ok(got.fret >= 0, `fret ${got.fret}`);
      const diff = got.pitch - n.pitch;
      assert.ok(diff === -3 || diff === 9, `pitch moved by ${diff}`);
      if (diff === 9) octaveUp++;
    });
  });
  assert.ok(result.moved > 0, 'some notes moved to a lower string');
  assert.equal(octaveUp, result.raised);
  assert.equal(moved.tracks[5].staves[0].bars[0].keySignature, 4); // E minor (1 sharp) down 3 is C# minor (4 sharps)
});

test('transpose 0 changes nothing', { skip: !(await have('1576708-r8752738')) }, async () => {
  const { json } = await load('1576708-r8752738');
  const obj = JSON.parse(json);
  assert.deepEqual(transposeScoreJson(obj, 0), { moved: 0, raised: 0 });
  assert.equal(JSON.stringify(obj), json);
});

test('wav: header, length and sample values', () => {
  const samples = new Float32Array(44100 * 2); // one second, stereo
  samples[0] = 1;
  samples[1] = -1;
  const wav = encodeWav(samples, 44100);
  assert.equal(wav.length, 44 + 44100 * 2 * 2);
  assert.equal(String.fromCharCode(...wav.slice(0, 4)), 'RIFF');
  assert.equal(wavSeconds(wav), 1);
  const view = new DataView(wav.buffer);
  assert.equal(view.getInt16(44, true), 32767);
  assert.equal(view.getInt16(46, true), -32768);
});

test('midi: the byte-level note counter agrees with alphaTab, and with the score', { skip: !(await have('1576708-r8752738')) }, async () => {
  const { score, settings } = await load('1576708-r8752738');
  const file = new alphaTab.midi.MidiFile();
  new alphaTab.midi.MidiFileGenerator(score, settings, new alphaTab.midi.AlphaSynthMidiFileHandler(file, true)).generate();
  const events = file.tracks.flatMap((t) => t.events).filter((e) => e instanceof alphaTab.midi.NoteOnEvent).length;
  const counted = countMidiNotes(file.toBinary());
  assert.equal(counted, events);
  // Struck notes: everything except tie ends. Legato-slide targets aren't re-struck either (6 here).
  let struck = 0;
  for (const t of score.tracks) for (const bar of t.staves[0].bars) for (const v of bar.voices) for (const b of v.beats) {
    for (const n of b.notes) if (!n.isTieDestination) struck++;
  }
  assert.equal(struck, 5493);
  assert.equal(counted, 5487);
});
