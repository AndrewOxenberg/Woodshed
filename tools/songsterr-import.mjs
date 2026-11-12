#!/usr/bin/env node
// Import a Songsterr tab into the Woodshed library. Plan §11.
//   npm run import-songsterr -- <link>
// Saves raw data and score.gp under library/songsterr/<songId>-r<revisionId>/.
// A link that is already saved is re-converted from disk without fetching.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importFromLink } from './songsterr/import.mjs';

const LIBRARY = join(dirname(fileURLToPath(import.meta.url)), '..', 'library');

async function main() {
  const link = process.argv[2];
  if (!link) {
    console.error('Usage: npm run import-songsterr -- <songsterr link>');
    process.exit(2);
  }

  const { dir, result } = await importFromLink(link, LIBRARY, console.log);

  console.log(`\n${result.artist} - ${result.title}: ${result.bars} bars, ${result.tracks.length} tracks, ${result.tempo} BPM`);
  console.log(`Saved ${join(dir, 'score.gp')} (${result.gpBytes} bytes)`);
  for (const key of ['problems', 'unknownFields', 'unmappedValues', 'warnings']) {
    const v = result[key];
    const n = Array.isArray(v) ? v.length : Object.keys(v).length;
    if (n) console.log(`${key}: ${JSON.stringify(v, null, 2)}`);
  }
  if (result.problems.length) process.exit(1);
  console.log('Round trip OK: every track has the same note count in the raw data and in score.gp.');
}

main().catch((e) => {
  console.error(`Import failed: ${e.message}`);
  process.exit(1);
});
