// npm test (offline). Chords view and Detect chords, plan §16.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as alphaTab from '@coderline/alphatab';
import { readSaved } from '../../tools/songsterr/fetch.mjs';
import { songLyricLines } from '../../tools/songsterr/lyrics.mjs';
import { chordTrack, sheetFromScore, trackNotes } from './tabSheet.ts';
import { intervalsOf, parseChord, prettyChord, simpleQuality, simplifyChord } from './chords.ts';
import { TOOL_IDS, toolOrder } from '../player/tools.ts';
import { chordName, detectChord, detectSegments, type NoteSpan } from './detect.ts';
import { autoCapo, fingeringFor } from './fingering.ts';
import { parseChordPro, sheetChords } from './sheet.ts';

const shape = (name: string) => fingeringFor(name)!.frets.map((f) => (f < 0 ? 'x' : String(f))).join('');

test('diagrams: the open and barre shapes every guitarist knows (§16.3)', () => {
  const want: Record<string, string> = {
    C: 'x32010', G: '320003', D: 'xx0232', A: 'x02220', E: '022100', Am: 'x02210',
    Em: '022000', Dm: 'xx0231', F: '133211', B7: 'x21202', Bm: 'x24432',
  };
  for (const [name, frets] of Object.entries(want)) assert.equal(shape(name), frets, name);
  assert.ok(fingeringFor('F')!.barre, 'F is a barre chord');
  assert.equal(fingeringFor('N.C.'), null);
});

test('diagrams: every chord in the saved songs gets a playable shape', () => {
  for (const name of ['E♭madd9', 'A♭', 'B♭', 'A♯', 'A7', 'D7M', 'D5', 'Esus4', 'E7sus4', 'F#m', 'C#m7', 'Gmaj7', 'D/F#', 'Bdim', 'Caug']) {
    const f = fingeringFor(name);
    assert.ok(f, name);
    const fretted = f.frets.filter((x) => x > 0);
    assert.ok(!fretted.length || Math.max(...fretted) - Math.min(...fretted) <= 3, `${name} stretches ${f.frets}`);
  }
});

test('chord qualities: aliases and simplify (§16.3)', () => {
  assert.deepEqual(intervalsOf('7M'), [0, 4, 7, 11]);
  assert.deepEqual(intervalsOf('m(add9)'), [0, 2, 3, 7]);
  const simple = ['E♭madd9', 'C/E', 'D7M', 'Esus4', 'A5', 'Bdim7', 'Am7', 'G7', 'Caug', 'N.C.'].map(simplifyChord);
  assert.deepEqual(simple, ['E♭m', 'C', 'D', 'E', 'A5', 'Bdim', 'Am', 'G', 'Caug', 'N.C.']);
  assert.equal(prettyChord('Bbm7b5/Ab'), 'B♭m7b5/A♭');
  assert.equal(prettyChord('F#m'), 'F♯m');
});

test('chordpro: Songsterr sheet with tuning, sections and chords inside words', () => {
  const sheet = parseChordPro('{tuning: Eb}\n{section: Intro} [F#m] – [E]\n\n{section: Verse}\n\nC[F#m]ome as you [E]are\n{c: x2}\n');
  assert.equal(sheet.tuning, 'Eb');
  assert.deepEqual(sheet.blocks.map((b) => b.title), ['Intro', 'Verse']);
  const verse = sheet.blocks[1].lines[0];
  assert.equal(verse.kind, 'words');
  if (verse.kind !== 'words') return;
  assert.deepEqual(verse.segments, [{ text: 'C' }, { chord: { name: 'F#m' }, text: 'ome as you ' }, { chord: { name: 'E' }, text: 'are' }]);
  assert.deepEqual(sheet.blocks[1].lines[1], { kind: 'comment', text: 'x2' });
  assert.deepEqual(sheetChords(sheet).map((c) => c.name), ['F#m', 'E', 'F#m', 'E']);
});

const notes = (pitches: number[], start = 0, end = 960): NoteSpan[] => pitches.map((pitch) => ({ start, end, pitch }));
const named = (pitches: number[]) => {
  const d = detectChord(notes(pitches), 0, 960);
  return d ? chordName(d) : null;
};

test('detect: triads, sevenths, power chords, inversions (§16.4)', () => {
  assert.equal(named([48, 52, 55]), 'C');
  assert.equal(named([45, 52, 57, 60, 64]), 'Am');
  assert.equal(named([45, 52, 55, 60, 64]), 'Am7');
  assert.equal(named([40, 47, 52]), 'E5');
  assert.equal(named([52, 55, 60]), 'C/E');
  assert.equal(named([50, 54, 57, 60]), 'D7');
  assert.equal(named([43, 47, 50, 55, 59, 67]), 'G');
  assert.equal(named([52]), null);
});

test('detect: a bar that changes chord halfway is split, repeats are dropped', () => {
  const bars = [0, 1, 2].map((i) => ({ index: i, start: i * 3840, end: (i + 1) * 3840 }));
  const spans = [
    ...notes([48, 52, 55], 0, 3840), // C
    ...notes([43, 47, 50], 3840, 5760), ...notes([45, 48, 52], 5760, 7680), // G then Am
    ...notes([45, 48, 52], 7680, 11520), // Am again
  ];
  assert.deepEqual(detectSegments(spans, bars).map((e) => [e.bar, e.start, e.name]), [[0, 0, 'C'], [1, 3840, 'G'], [1, 5760, 'Am']]);
});

// Saved songs (skipped in a fresh clone): the measurements of plan §16.6, kept as floors.
const SONGS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'library', 'songsterr');
async function saved(folder: string) {
  try {
    const bytes = new Uint8Array(await readFile(join(SONGS, folder, 'score.gp')));
    const settings = new alphaTab.Settings();
    settings.core.logLevel = alphaTab.LogLevel.None;
    return { score: alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes, settings), saved: await readSaved(join(SONGS, folder)) };
  } catch {
    return null;
  }
}

test('detect: agrees with the hand-written names in Tennessee Whiskey and Earrings (§16.6)', async () => {
  for (const [folder, floor] of [['482060-r7827442', 0.9], ['1576708-r8752738', 0.95]] as const) {
    const song = await saved(folder);
    if (!song) continue;
    const track = chordTrack(song.score)!;
    const { notes, bars } = trackNotes(track, song.score);
    const det = detectSegments(notes, bars);
    let total = 0;
    let same = 0;
    for (const staff of track.staves) for (const bar of staff.bars) for (const v of bar.voices) for (const b of v.beats) {
      if (!b.hasChord || !b.chord) continue;
      const t = bar.masterBar.start + b.playbackStart;
      const d = det.filter((e) => e.start <= t + 1).pop();
      const a = parseChord(b.chord.name)!;
      const c = d && parseChord(d.name);
      total++;
      if (c && c.root === a.root && simpleQuality(c.quality) === simpleQuality(a.quality)) same++;
    }
    assert.ok(same / total >= floor, `${folder}: ${same}/${total}`);
  }
});

test('sheet from the tab: the importer line starts give the real lines of the words (§16.6)', async () => {
  const song = await saved('482060-r7827442');
  if (!song) return;
  const sheet = sheetFromScore(song.score, songLyricLines(song.saved.tracks));
  const lines = sheet.blocks.flatMap((b) => b.lines).filter((l) => l.kind === 'words').map((l) => l.segments.map((s) => s.text).join(''));
  assert.equal(lines[0], 'Used to spend my nig hts out in a barroom');
  assert.equal(lines[1], "Liquor was the only love I'd known");
  assert.ok(sheet.timed);
  assert.deepEqual([...new Set(sheetChords(sheet).map((c) => c.name))].sort(), ['A', 'Bm', 'D']);
});

test('toolbar order: saved order kept, unknown names dropped, new buttons appended (§17.3)', () => {
  assert.deepEqual(toolOrder([]), [...TOOL_IDS]);
  const o = toolOrder(['print', 'nonsense', 'speed', 'print']);
  assert.deepEqual(o.slice(0, 2), ['print', 'speed']);
  assert.equal(o.length, TOOL_IDS.length);
  assert.equal(new Set(o).size, TOOL_IDS.length);
});

test('capo: auto picks the fret that makes the shapes open', () => {
  assert.equal(autoCapo(['B♭', 'E♭', 'F', 'Gm', 'B♭', 'F']), 3);
  assert.equal(autoCapo(['G', 'C', 'D', 'Em']), null);
});
