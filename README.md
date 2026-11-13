# Woodshed

A guitar tab player and practice site. It has the practice tools Songsterr
sells in its Plus plan (slow down, loop, transpose, solo and mute, count-in,
metronome, print, download) and none of them are behind a paywall.

**Live:** https://woodshed-black.vercel.app

Built on [alphaTab](https://alphatab.net) for notation and playback, with
Vite, React and TypeScript around it.

## State

| Phase | What | State |
|---|---|---|
| 1 | Practice player: library, tab view, speed, loop, transpose, mixer, count-in, metronome, print, downloads | Done |
| 2a | Sheet and tab+sheet views, several tracks on the page, display switches, help panel | Done |
| 2b | Chords view (lyrics with chords, capo, simplify, diagrams, autoscroll, print), detect chords | Done |
| 2c | Bar menu, track autoswitch, rearrange buttons | Done |
| 3a | Play along with the song's YouTube recordings, synced bar by bar | Done |
| 3b | Uploaded audio (any speed, pitch shift), tap-along sync, stems | Next |
| 4 | Tab editor and revisions | Planned |
| 5 | Accounts and a shared library (Google sign-in, upload limits, admin) | Designed, not built |
| 6 | AI transcription from audio | Planned |

`woodshed-plan.md` is the plan and the running record: what each feature
does, why it was built that way, and what was measured in the browser.

## Features

- **Library.** Open a Guitar Pro, MusicXML, alphaTex or plain-text
  ASCII tab, or paste a Songsterr link. Search, favorites, and a
  guitar / bass / drums filter. A bass or drum link opens on that track.
- **Views.** Tab, standard notation, or both stacked. Drums always draw as
  drum notation. Show extra tracks under the one you are playing.
- **Chords view.** The words with chord names over them, or a bar-by-bar
  chord chart for songs without words. Uses Songsterr's own chord sheet when
  the song has one, or builds the sheet from the tab, following playback.
  Capo (with an automatic choice), simplify, chord diagrams, autoscroll,
  print.
- **Detect chords.** Names the chords a tab plays, in green, where the tab
  names none.
- **Speed.** 15% to 175% in 1% steps, set by percent or by BPM. Pitch
  stays the same.
- **Loop.** Press L, then drag the handles. Optional count-in before every
  repeat.
- **Transpose.** Rewrites every fret and chord name. A second control
  shifts only the sound, for songs tuned down.
- **Tracks.** Switch, solo, mute and set volume per track, plus one slider
  for the track you are playing and one for the rest of the band. Follow
  the part across tracks: when a part is split over two guitar tracks, the
  page shows whichever one is playing.
- **Recordings.** Play along with the song's YouTube video instead of the
  synth: the full mix, a backing track without your part, or a
  playthrough. It plays by default; the tab follows the video bar by bar, with speed, loop and
  transpose. V switches back and forth.
- **Bar menu.** The ⋮ under any bar: loop it, play from it, or choose which
  track it shows.
- **Count-in and metronome.**
- **Download.** Guitar Pro, MIDI, WAV and MP3, in the current key and mix.
- **Print.** Black on white, with its own size setting.
- **Settings.** Light or dark, tab size, note spacing, page width, four
  bars per line, combine empty bars, dynamics, a sound delay for
  Bluetooth headphones, and the order of the toolbar buttons.

Press **Ctrl+K** in the player, or the **?** button, for help and the full
list of keyboard shortcuts.

## Run it locally

Needs Node 22 or newer.

```bash
npm install
npm run dev
```

Then open http://127.0.0.1:5183. The local copy keeps its library as
folders under `library/` on disk, served by a small API inside the Vite dev
server (`server/library-api.mjs`).

## The hosted copy

The site on Vercel is the same app built as static files, plus one
serverless function:

- Each browser keeps its own library in IndexedDB. Nothing is shared
  between visitors yet (that is phase 5).
- Songsterr links go through `api/songsterr.js`, which runs the importer in
  a scratch folder and sends back a Guitar Pro file. It stores nothing.

Deploy with:

```bash
npx vercel deploy --prod
```

`npm run build && npm run preview` serves the same build locally.

## Importing from Songsterr

The link box in the library does this, or from a terminal:

```bash
npm run import-songsterr -- "https://www.songsterr.com/a/wsa/malcolm-todd-earrings-tab-s1576708t1/r8752738"
```

It saves to `library/songsterr/<songId>-r<revisionId>/`: `score.gp` with
every track, Songsterr's raw data, `convert-report.json`, and Songsterr's
chord sheet as `chords.chordpro` when the song has one. Notation the
converter does not recognise is listed in that report and fails `npm test`
until it is mapped in `tools/songsterr/convert.mjs`. Nothing is guessed.

Songsterr's tabs are licensed from music publishers. The owner of this
project has permission from Songsterr for these imports (plan §11.2).
`library/` is git-ignored, so imported tabs are never in this repository.

## Checks

```bash
npm test
npx tsc
npm run build
```

Tests run offline: Songsterr link parsing, track picking, instrument
classification, chord spelling, transpose, the WAV writer, MIDI note counts,
and a note-by-note round trip on every song saved in `library/songsterr/`.
The tests that need saved songs skip when that folder is empty, as it is in
a fresh clone.
The browser checks and their measurements are in the plan, §12.3, §13.5 and
§15.6.

## Layout

| Path | What |
|---|---|
| `woodshed-plan.md` | The plan and the running record |
| `src/player/engine.ts` | Wraps alphaTab; all playback state |
| `src/player/` | Player page, panels, loop overlay |
| `src/library/` | Library page, and the in-browser store for the hosted copy |
| `src/lib/` | Transpose, chord names, chord detection, fingerings, chord sheets, audio helpers, tests |
| `src/player/ChordsView.tsx` | The chords view |
| `server/` | Local library API and the Songsterr request handler |
| `api/songsterr.js` | The Vercel function (re-exports the handler) |
| `tools/songsterr/` | Songsterr link importer and converter |
| `tools/ascii-tab.mjs` | Plain-text tab parser |
| `tools/instruments.mjs` | Guitar / bass / drums classification |

## License

No license yet: all rights reserved. alphaTab is MPL-2.0 and lamejs is
LGPL; both are used unmodified from npm.
