// The toolbar's buttons and their order. Plan §17.3.

/** Default order. "gap" is the space that pushes the buttons after it to the right. */
export const TOOL_IDS = ['speed', 'loop', 'countin', 'metronome', 'transpose', 'tracks', 'view', 'recording', 'gap', 'download', 'print', 'settings'] as const;
export type ToolId = (typeof TOOL_IDS)[number];

export const TOOL_NAMES: Record<ToolId, string> = {
  speed: 'Speed', loop: 'Loop', countin: 'Count-in', metronome: 'Metronome', transpose: 'Transpose', tracks: 'Tracks',
  view: 'View', recording: 'Recording', gap: 'Space (moves the rest right)', download: 'Download', print: 'Print', settings: 'Settings',
};

const known = (id: string): id is ToolId => (TOOL_IDS as readonly string[]).includes(id);

/** The saved order, with unknown names dropped and any new buttons added at the end. */
export function toolOrder(saved: string[]): ToolId[] {
  const kept = [...new Set(saved.filter(known))];
  return [...kept, ...TOOL_IDS.filter((id) => !kept.includes(id))];
}
