// The chord sheet model, and the reader for Songsterr's ChordPro sheets. Plan §16.2.

export interface SheetChord {
  name: string;
  /** Named by Detect chords, not written in the tab: shown in green (§16.4). */
  detected?: boolean;
  /** Where the chord starts, for sheets built from the tab: bar index and ticks into the bar. */
  at?: { bar: number; offset: number };
}

/** A chord and the words sung from it on. Either may be empty. */
export interface Segment {
  chord?: SheetChord;
  text: string;
}

export interface SheetBar {
  index: number;
  chords: SheetChord[];
}

export type SheetLine =
  | { kind: 'words'; segments: Segment[] }
  | { kind: 'bars'; bars: SheetBar[] }
  | { kind: 'comment'; text: string }
  /** A blank line between verses. */
  | { kind: 'space' };

export interface SheetBlock {
  title?: string;
  lines: SheetLine[];
}

/** Which syllables start a line or a verse, per track: from the importer (§16.2). */
export type LyricLines = Record<number, { starts: number[]; stanzas: number[] }>;

export interface Sheet {
  source: 'songsterr' | 'tab';
  blocks: SheetBlock[];
  tuning?: string;
  /** A capo the sheet itself names; its chords are then shapes at that fret. */
  capo?: number;
  /** Chords carry times, so playback can light them up. */
  timed: boolean;
  /** Where the words and chords came from, for sheets built from the tab. */
  notes: string[];
}

const SECTION_DEFAULTS: Record<string, string> = {
  start_of_verse: 'Verse', sov: 'Verse', start_of_chorus: 'Chorus', soc: 'Chorus',
  start_of_bridge: 'Bridge', sob: 'Bridge', start_of_tab: 'Tab', sot: 'Tab', start_of_part: 'Part',
};

/** "Intro [F#m] – [E]" -> a segment per chord, with the words before any chord kept first. */
export function parseSegments(line: string): Segment[] {
  const parts = line.split(/\[([^\]]*)\]/);
  const out: Segment[] = [];
  if (parts[0]) out.push({ text: parts[0] });
  for (let k = 1; k < parts.length; k += 2) {
    const name = parts[k].trim();
    out.push(name ? { chord: { name }, text: parts[k + 1] ?? '' } : { text: parts[k + 1] ?? '' });
  }
  return out;
}

/** Read a ChordPro sheet. Directives Woodshed has no use for are skipped. */
export function parseChordPro(text: string): Sheet {
  const sheet: Sheet = { source: 'songsterr', blocks: [], timed: false, notes: [] };
  let block: SheetBlock = { lines: [] };
  const startBlock = (title: string | undefined) => {
    if (block.lines.length || block.title) sheet.blocks.push(block);
    block = { title, lines: [] };
  };

  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    let line = raw;
    // Directives may share a line with chords: "{section: Intro} [F#m] – [E]".
    for (;;) {
      const m = line.trimStart().match(/^\{\s*([^:}]+?)\s*(?::\s*([^}]*))?\}/);
      if (!m) break;
      const name = m[1].toLowerCase();
      const value = (m[2] ?? '').trim();
      if (name === 'section') startBlock(value || undefined);
      else if (name in SECTION_DEFAULTS) startBlock(value || SECTION_DEFAULTS[name]);
      else if (name === 'tuning') sheet.tuning = value || undefined;
      else if (name === 'capo') {
        const n = Number.parseInt(value, 10);
        if (n > 0 && n < 12) sheet.capo = n;
      } else if (['comment', 'c', 'ci', 'comment_italic', 'cb', 'comment_box', 'highlight'].includes(name) && value) {
        block.lines.push({ kind: 'comment', text: value });
      }
      line = line.trimStart().slice(m[0].length);
    }
    if (!line.trim()) continue;
    block.lines.push({ kind: 'words', segments: parseSegments(line.trimEnd()) });
  }
  startBlock(undefined);
  return sheet;
}

/** Every chord on the sheet, in reading order, repeats included. */
export function sheetChords(sheet: Sheet): SheetChord[] {
  const out: SheetChord[] = [];
  for (const block of sheet.blocks) {
    for (const line of block.lines) {
      if (line.kind === 'words') for (const s of line.segments) if (s.chord) out.push(s.chord);
      if (line.kind === 'bars') for (const b of line.bars) out.push(...b.chords);
    }
  }
  return out;
}
