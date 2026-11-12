// Plain-text guitar tab -> alphaTab score. Plan §7 phase 1, §12.1.
// Text tabs carry no real rhythm, so each bar's columns are mapped onto a 16th-note grid:
// a note's place across the bar's width becomes its place in time. Assumes 4/4.
import * as alphaTab from '@coderline/alphatab';

const { model: M, Settings } = alphaTab;

const STANDARD = {
  4: [43, 38, 33, 28],
  5: [43, 38, 33, 28, 23],
  6: [64, 59, 55, 50, 45, 40],
  7: [64, 59, 55, 50, 45, 40, 35],
  8: [64, 59, 55, 50, 45, 40, 35, 30],
};
const PITCH_CLASS = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const GRID = 16; // 16th notes per 4/4 bar
// length in 16ths -> [alphaTab duration, dots], longest first
const PIECES = [[16, 1, 0], [12, 2, 1], [8, 2, 0], [6, 4, 1], [4, 4, 0], [3, 8, 1], [2, 8, 0], [1, 16, 0]];

function matchTabLine(line) {
  const m = line.match(/^\s*([A-Ga-g][#b]?)?\s*\|(.*)$/);
  if (!m) return null;
  const body = m[2].replace(/\s+$/, '');
  if (body.length < 8) return null;
  if (/[^-0-9|hpbrstxXHPBRS/\\~()^*<>.=: ]/.test(body)) return null;
  const dashes = (body.match(/-/g) ?? []).length;
  if (dashes / body.length < 0.5) return null;
  return { label: m[1] ?? null, body };
}

/** Group consecutive tab lines into systems of 4 to 8 strings. */
function findSystems(lines) {
  const systems = [];
  let run = [];
  let heading = null;
  let pendingHeading = null;
  const flush = () => {
    if (run.length >= 4 && run.length <= 8) systems.push({ lines: run, heading: pendingHeading });
    if (run.length) pendingHeading = null;
    run = [];
  };
  for (const line of lines) {
    const tab = matchTabLine(line);
    if (tab) {
      if (!run.length) pendingHeading = heading ?? pendingHeading, heading = null;
      run.push(tab);
      continue;
    }
    flush();
    const t = line.trim();
    // A heading is a short line that starts with a run of capitals: "MAIN GROOVE  (8 bars)".
    const cap = t.match(/^([A-Z][A-Z0-9 '&-]{3,})(?:\s{2,}|\s*\(|$)/);
    if (cap && t.length < 70) heading = cap[1].trim();
  }
  flush();
  return systems;
}

function tuningFor(system) {
  const n = system.lines.length;
  const std = STANDARD[n];
  if (!std) throw new Error(`Tab has ${n} strings; 4 to 8 are supported.`);
  return system.lines.map((l, i) => {
    if (!l.label) return std[i];
    const pc = (PITCH_CLASS[l.label[0].toLowerCase()] + (l.label[1] === '#' ? 1 : l.label[1] === 'b' ? -1 : 0) + 12) % 12;
    // Nearest pitch with that note name to the standard string, so "D" on the low string reads as drop D.
    let best = std[i];
    for (let p = std[i] - 6; p <= std[i] + 6; p++) if (((p % 12) + 12) % 12 === pc) best = p;
    return best;
  });
}

/** Split a system into bars at the columns where every line has a bar line. */
function splitBars(system) {
  const width = Math.max(...system.lines.map((l) => l.body.length));
  const rows = system.lines.map((l) => l.body.padEnd(width, '-'));
  const cuts = [-1];
  for (let c = 0; c < width; c++) if (rows.every((r) => r[c] === '|')) cuts.push(c);
  cuts.push(width);
  const bars = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const from = cuts[i] + 1;
    const to = cuts[i + 1];
    if (to - from >= 4) bars.push(rows.map((r) => r.slice(from, to)));
  }
  return bars;
}

/** Read one string's line in one bar. prev is the last note on this string, for h / p / slides. */
function scanLine(seg, string, state, out) {
  let i = 0;
  while (i < seg.length) {
    const col = i;
    let prefix = null;
    if ('hpbsHPBS/\\('.includes(seg[i]) && /[0-9]/.test(seg[i + 1] ?? '')) {
      prefix = seg[i].toLowerCase();
      i++;
    }
    const ch = seg[i];
    if (/[0-9]/.test(ch)) {
      let text = ch;
      if (/[0-9]/.test(seg[i + 1] ?? '') && Number(ch + seg[i + 1]) <= 24) text += seg[i + 1];
      i += text.length;
      const fret = Number(text);
      const prev = state.prev[string];
      if (prefix === 'b' && prev) {
        prev.bend = Math.max(1, (fret - prev.fret) * 2); // quarter tones up to the target fret
        continue;
      }
      const note = { string, fret, col, ghost: prefix === '(', vibrato: false, dead: false };
      if ((prefix === 'h' || prefix === 'p') && prev) prev.hammer = true;
      if (prefix === '/' || prefix === '\\' || prefix === 's') {
        if (prev && prev.bar === state.bar) prev.slideOut = true;
        else note.slideIn = prefix === '\\' ? 'above' : 'below';
      }
      if (seg[i] === ')') i++;
      if (seg[i] === '~') {
        note.vibrato = true;
        i++;
      }
      note.bar = state.bar;
      state.prev[string] = note;
      out.push(note);
    } else if (/[xX]/.test(ch)) {
      out.push({ string, fret: 0, col, dead: true, bar: state.bar });
      i++;
    } else {
      i++;
    }
  }
}

function buildNote(n, strings) {
  const note = new M.Note();
  note.fret = n.fret;
  note.string = strings - n.string; // text tabs list the highest string first
  if (n.dead) note.isDead = true;
  if (n.ghost) note.isGhost = true;
  if (n.hammer) note.isHammerPullOrigin = true;
  if (n.vibrato) note.vibrato = M.VibratoType.Slight;
  if (n.slideOut) note.slideOutType = M.SlideOutType.Shift;
  if (n.slideIn) note.slideInType = n.slideIn === 'above' ? M.SlideInType.IntoFromAbove : M.SlideInType.IntoFromBelow;
  if (n.bend) {
    note.bendType = M.BendType.Bend;
    note.addBendPoint(new M.BendPoint(0, 0));
    note.addBendPoint(new M.BendPoint(60, n.bend));
  }
  return note;
}

function addPieces(voice, length, notes, strings) {
  let rest = length;
  let first = true;
  while (rest > 0) {
    const [len, duration, dots] = PIECES.find((p) => p[0] <= rest);
    const beat = new M.Beat();
    voice.addBeat(beat);
    beat.duration = duration;
    beat.dots = dots;
    if (first && notes) for (const n of notes) beat.addNote(buildNote(n, strings));
    first = false;
    rest -= len;
  }
}

function titleCase(s) {
  return s === s.toUpperCase() ? s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : s;
}

/** Parse a text tab. Returns the score plus what was understood, or throws if no tab lines were found. */
export function parseAsciiTab(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const systems = findSystems(lines);
  if (!systems.length) throw new Error('No tab lines found. A tab line looks like "e|--0--2--3--|".');

  const strings = systems[0].lines.length;
  const usable = systems.filter((s) => s.lines.length === strings);
  const tuning = tuningFor(systems.find((s) => s.lines.every((l) => l.label)) ?? systems[0]);

  const first = lines.find((l) => l.trim()) ?? '';
  const head = first.trim().split(/\s{2,}/)[0];
  const [rawTitle, rawArtist] = head.includes(' - ') ? head.split(' - ') : [head, ''];
  const tempo = Number(text.match(/(\d{2,3})\s*bpm/i)?.[1] ?? 0) || 120;
  const swung = /\b(swung|swing|shuffle)\b/i.test(text);

  const score = new M.Score();
  score.title = matchTabLine(first) ? '' : titleCase(rawTitle.trim());
  score.artist = rawArtist.trim();
  score.notices = 'Imported from a text tab. Rhythm is estimated from note spacing.';

  const track = new M.Track();
  track.name = strings <= 5 ? 'Bass' : 'Guitar';
  track.shortName = track.name;
  track.playbackInfo.program = strings <= 5 ? 33 : 27;
  track.playbackInfo.primaryChannel = 0;
  track.playbackInfo.secondaryChannel = 1;
  const staff = new M.Staff();
  staff.stringTuning = new M.Tuning('', tuning);
  staff.showTablature = true;
  staff.showStandardNotation = true;
  track.addStaff(staff);
  score.addTrack(track);

  let noteCount = 0;
  const state = { prev: [], bar: 0 };
  for (const system of usable) {
    const bars = splitBars(system);
    bars.forEach((rows, bi) => {
      const mb = new M.MasterBar();
      mb.timeSignatureNumerator = 4;
      mb.timeSignatureDenominator = 4;
      if (swung) mb.tripletFeel = M.TripletFeel.Triplet8th;
      if (bi === 0 && system.heading) {
        const section = new M.Section();
        section.text = titleCase(system.heading);
        section.marker = '';
        mb.section = section;
      }
      if (!score.masterBars.length) mb.tempoAutomations.push(M.Automation.buildTempoAutomation(false, 0, tempo, 2));
      score.addMasterBar(mb);

      const found = [];
      rows.forEach((seg, string) => scanLine(seg, string, state, found));
      state.bar++;
      noteCount += found.length;

      // Columns -> slots on the 16th grid, kept in order and never sharing a slot.
      const width = rows[0].length;
      const byCol = new Map();
      for (const n of found) byCol.set(n.col, [...(byCol.get(n.col) ?? []), n]);
      const groups = [];
      for (const col of [...byCol.keys()].sort((a, b) => a - b)) {
        let slot = Math.min(GRID - 1, Math.round((col / width) * GRID));
        const last = groups[groups.length - 1];
        if (last && slot <= last.slot) slot = last.slot + 1;
        if (slot > GRID - 1) last.notes.push(...byCol.get(col)); // no room left in the bar
        else groups.push({ slot, notes: byCol.get(col) });
      }

      const bar = new M.Bar();
      staff.addBar(bar);
      const voice = new M.Voice();
      bar.addVoice(voice);
      if (!groups.length) {
        addPieces(voice, GRID, null, strings);
        return;
      }
      if (groups[0].slot > 0) addPieces(voice, groups[0].slot, null, strings);
      groups.forEach((g, i) => {
        const end = i + 1 < groups.length ? groups[i + 1].slot : GRID;
        addPieces(voice, end - g.slot, g.notes, strings);
      });
    });
  }

  const settings = new Settings();
  score.finish(settings);
  return {
    score,
    settings,
    stats: { strings, tuning, tempo, swung, systems: usable.length, bars: score.masterBars.length, notes: noteCount },
  };
}
