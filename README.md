# Woodshed

A guitar tab player and practice site with every feature Songsterr has, free
and paid, and no paywall.

**State:** phase 1 of 6 works. That is the practice player: library, tab
view, speed, loop, transpose, pitch shift, mixer, count-in, metronome,
settings, print, and downloads. Phases 2 to 6 (other views, original audio,
editor, accounts, AI transcription) are planned in `woodshed-plan.md` and not
built.

## Run it

```
npm install
npm run dev
```

Then open http://127.0.0.1:5183. It runs on your own machine only.

## Hosted copy

https://woodshed-black.vercel.app, behind a password (`SITE_PASSWORD` in the
Vercel project settings). The hosted copy keeps each person's library in
their own browser, and imports Songsterr links through one serverless
function. Deploy with `npx vercel deploy --prod`. Details in plan §14.

`npm run build && npm run preview` serves the same build locally on port
4173, without the password.

## What it does

- **Library.** Open a Guitar Pro, MusicXML, alphaTex or plain-text tab, or
  paste a Songsterr link. Tabs are saved as folders under `library/`.
  Filter by guitar, bass or drums; a bass or drum link opens on that track.
- **Speed.** 15% to 175%, in 1% steps, by percent or by BPM.
- **Loop.** Press L, then drag the two handles. Bars only.
- **Transpose.** Rewrites frets and chord names. A separate control shifts
  the sound only, for songs tuned down.
- **Tracks.** Switch track, solo, mute, volume per track. Two more sliders
  set the track on screen against everything else (lead and backing).
- **Count-in and metronome.** Optional count-in before every loop repeat.
- **Download.** Guitar Pro, MIDI, WAV, MP3.
- **Print.** Black on white, with its own size setting.
- **Settings.** Light or dark, tab size, note spacing, page width, four bars
  per line, sound delay for Bluetooth headphones.

Keyboard shortcuts are listed at the bottom of the Settings panel.

## Import from the command line

```
npm run import-songsterr -- "https://www.songsterr.com/a/wsa/malcolm-todd-earrings-tab-s1576708t1/r8752738"
```

Same thing the link box does. It saves to
`library/songsterr/<songId>-r<revisionId>/`: `score.gp` (every track),
Songsterr's raw data, and `convert-report.json`, which lists any notation
the converter did not recognise. Andrew has permission from Songsterr for
this (plan §11.2). `library/` is git-ignored, so imported tabs never get
pushed.

## Checks

```
npm test
npx tsc
```

Tests run offline: link parsing, transpose, chord spelling, audio writers,
and a note-by-note round trip on every song in `library/songsterr/`. The
browser checks and their numbers are in plan §12.3.

## Layout

| Path | What |
|---|---|
| `woodshed-plan.md` | The plan and the running record |
| `src/player/engine.ts` | Wraps alphaTab; all playback state |
| `src/player/` | Player page, panels, loop overlay |
| `src/library/` | Library page |
| `src/lib/` | Transpose, chord names, WAV and MIDI helpers, tests |
| `server/library-api.mjs` | Local library API, served by Vite |
| `tools/songsterr/` | Link importer and converter |
| `tools/ascii-tab.mjs` | Plain-text tab parser |
