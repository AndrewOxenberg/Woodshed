// Which tracks of a song are guitar, bass, drums or something else. Plan §13.4.

const empty = () => ({ guitar: [], bass: [], drums: [], other: [] });

/** From Songsterr's own flags on each track in the page data. */
export function songsterrInstruments(meta) {
  const out = empty();
  meta.tracks.forEach((t, i) => {
    (t.isDrums ? out.drums : t.isBassGuitar ? out.bass : t.isGuitar ? out.guitar : out.other).push(i);
  });
  return out;
}

/**
 * From an alphaTab score, for uploaded files. Order of evidence: percussion staff,
 * then the MIDI program (32 to 39 are basses, 24 to 31 guitars), then the strings.
 */
export function scoreInstruments(score) {
  const out = empty();
  score.tracks.forEach((track, i) => {
    const staff = track.staves[0];
    const program = track.playbackInfo.program;
    const tuning = staff?.tuning ?? [];
    let kind = 'other';
    if (!staff) kind = 'other';
    else if (staff.isPercussion) kind = 'drums';
    else if (program >= 32 && program <= 39) kind = 'bass';
    else if (program >= 24 && program <= 31) kind = 'guitar';
    // No telling program: four or five strings reaching below the guitar's low E read as a bass.
    else if (tuning.length >= 4 && tuning.length <= 5 && Math.min(...tuning) < 40) kind = 'bass';
    else if (tuning.length >= 6) kind = 'guitar';
    out[kind].push(i);
  });
  return out;
}

/**
 * The track a Songsterr link points at, or null if it names none.
 * A track number wins. Otherwise "-bass-tab-" and "-drum-tab-" links use Songsterr's own pick.
 */
export function trackForLink(parsed, meta) {
  const valid = (i) => Number.isInteger(i) && i >= 0 && i < meta.tracks.length;
  if (valid(parsed.trackIndex)) return parsed.trackIndex;
  const kinds = songsterrInstruments(meta);
  if (parsed.kind === 'bass') {
    if (valid(meta.popularTrackBass) && kinds.bass.includes(meta.popularTrackBass)) return meta.popularTrackBass;
    return kinds.bass[0] ?? null;
  }
  if (parsed.kind === 'drums') {
    if (valid(meta.popularTrackDrum) && kinds.drums.includes(meta.popularTrackDrum)) return meta.popularTrackDrum;
    return kinds.drums[0] ?? null;
  }
  return null;
}
