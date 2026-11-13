# Woodshed plan

A tab player and practice site that does everything Songsterr does, free and
paid, with nothing behind a paywall. This file is the running record. Sections
are numbered so code comments can cite them (`// §7.3`). Add a section before
building a feature, then record what was verified.

Last updated: 2026-11-13.

---

## §0 The question

Can one site give a guitarist every practice tool Songsterr sells (slow down,
loop, transpose, mute, count-in, metronome, print, download, original-audio
sync) for free, using open-source parts for the hard pieces?

"Woodshed" is musician slang for locking yourself away to practice. It is a
working name. Rename it whenever.

---

## §1 How the analysis was done

Measured 2026-11-10 in the built-in browser, not from memory.

- `songster.com` (no "r") is a WN.com news and video aggregator. The features
  in the request (loop, speed, transpose, mute, count-in, metronome, print,
  download) are Songsterr's, so the analysis is of `songsterr.com`.
- Free tier: opened public tabs (Nirvana "Come As You Are" s14, Radiohead
  "Creep" s97) signed out, and read every control's label and lock icon.
- Paid tier: Songsterr's paywall popup links a **Demo Song** (Stairway to
  Heaven, `?demo=enabled`) with every Plus feature unlocked. Every paid
  control below was opened there.
- Text sources: the `/plus` page, the full `/help` center (21k chars, which
  includes the shortcut list), `/teacher-plan`, `/new`, `/favorites`.
- Not observed directly: the per-note editor toolbar (would not open inside
  the pane) and the Plus checkout page (needs sign-in). Price is from the
  Plus page via search, cross-checked against the App Store listing.

---

## §2 What Songsterr charges for

| Plan | Price | Notes |
|---|---|---|
| Free | $0 | Tab/sheet/chords views, synth playback, mixer, transpose, count-in, metronome, detect chords, editor, revisions. Original audio sync stops after 10 bars. AI transcription limited to a 20-second preview |
| Plus | $9.99/month | Monthly only, no yearly or lifetime. One subscription covers web, iOS and Android |
| Teacher | from $29.99/month | Plus for the teacher and 5 students, $4.99/month per extra seat. Private tabs and playlists, purchase orders. Launches 2026-11-16 |

Plus features as Songsterr lists them on `/plus`: pause-free sync with
original audio, playback speed, print, full AI transcription, download, solo
and mute, loop, pitch shift.

What the free player actually showed locks on: **speed, loop, download,
print**. Solo, mute and transpose had no lock icon on the free song even though
`/plus` lists solo and mute. Woodshed makes all of it free, so the difference
only matters as a record of what Songsterr gates.

---

## §3 Feature inventory

Every feature found, what it does on Songsterr, its tier there, and how
Woodshed builds it. **Phase** refers to §7. "aT" means alphaTab (§5).

### §3.1 Playback transport

| Feature | Songsterr behavior | Tier | Woodshed build | Phase |
|---|---|---|---|---|
| Play / pause | Space. Green cursor follows the beat | Free | aT player, `playPause()` | 1 |
| Go to start | Backspace goes to loop start, or bar 1 with no loop | Free | aT `tickPosition = loopStart ?? 0` | 1 |
| Click to place cursor | Single click on a beat moves the cursor | Free | aT `beatMouseDown` event | 1 |
| Play from beat | Double-click a beat | Free | same, then `play()` | 1 |
| Cursor keys | Left/Right one beat, Up/Down one line | Free | keyboard map over aT beat lookup | 1 |
| Follow scrolling | Scrolls only when needed to show the current and next line; manual scroll suspends follow, resumes on line change or Play | Free | custom scroll controller, not aT's default | 1 |
| Synth / original toggle | V toggles Songsterr's synth vs the synced recording | Free (orig limited to 10 bars) | §3.8 | 3 |

### §3.2 Speed (tempo)

| Feature | Songsterr behavior | Tier | Woodshed build | Phase |
|---|---|---|---|---|
| Speed panel | S opens it. Shows current BPM with -/+ buttons, a 15% to 175% slider, presets 15/25/50/75/100/125/150/175% | Plus | aT `playbackSpeed` (synth handles any rate) | 1 |
| Fine mode | The "- \| +" button switches to a big readout stepping in 1% | Plus | same control, 1% step | 1 |
| Speed on original audio | Same control drives the synced recording | Plus | YouTube: only rates the player reports (§4.2). Uploaded audio: time-stretch worklet | 3 |

### §3.3 Loop

| Feature | Songsterr behavior | Tier | Woodshed build | Phase |
|---|---|---|---|---|
| Loop toggle | L. Highlights the current bar with green drag handles at both ends | Plus | aT `isLooping` + `playbackRange` | 1 |
| Resize loop | Drag handles, or Shift+Left/Right moves the right edge one bar | Plus | handles snap to bar starts | 1 |
| Count in between loops | Settings toggle: one bar of clicks before every repeat | Free setting | insert count-in at each loop wrap | 1 |

### §3.4 Transpose and pitch

| Feature | Songsterr behavior | Tier | Woodshed build | Phase |
|---|---|---|---|---|
| Transpose song | K opens "Transpose notation": -/+ semitones, arrow keys work, Reset. Rewrites every fret number and chord name. Measured: +1 turned Am into A♯m, E/G♯ into F/A, D/F♯ into E♭/G | Free | rewrite frets in the model (fret + n, move to a lower string or flag when fret < 0) and transpose chord names with key-aware spelling, so +1 from Am gives B♭m, not a sharp/flat mix | 1 |
| Shift pitch (tuning) | Clicking the tuning letters at the left of bar 1 opens "Shift pitch". Changes playback pitch without changing frets, so a song in E♭ can be played in standard | Plus | aT `changeTrackTranspositionPitch` on synth. Uploaded audio: pitch-shift worklet | 1 (synth), 3 (audio) |
| Pitch shift on YouTube | Not possible. Songsterr's popup says to upload the audio file or switch to synth | n/a | same limit, same message (§4.2) | 3 |

### §3.5 Tracks and mixer

| Feature | Songsterr behavior | Tier | Woodshed build | Phase |
|---|---|---|---|---|
| Track list | T opens Mixer. Each row: instrument, then "player \| gear \| role" (e.g. "Kurt Cobain \| Mosrite Gospel \| Rhythm Guitar"). Clicking a row switches the shown track and changes the URL | Free | aT `score.tracks`, render one track | 1 |
| Switch track keys | Ctrl+Shift+Up/Down, Alt+Shift+1 to 9 | Free | keyboard map | 1 |
| Solo | Alt+M, plus a headphone button per mixer row | Plus (per `/plus`) | aT `changeTrackSolo` | 1 |
| Mute | M, plus a mute button per row | Plus (per `/plus`) | aT `changeTrackMute` | 1 |
| Master volume | Slider + mute in the Mixer | Free | aT `masterVolume` | 1 |
| Multitrack view | Toggle that renders several tracks stacked | Free | aT `renderTracks([...])` | 2 |
| AI track autoswitch | During playback, jump to another guitar track when the current one rests (one part split across clean/distorted tracks). Per-bar targets set from the bar menu | Free | precompute rest spans per track; switch view at span start; user overrides per bar | 2 |
| Remembers last track | Reopening a song opens the last track used | Free | store per song locally | 1 |
| Vocals as a track | Vocal line shown as a pitched track with lyrics under the notes | Free | aT renders lyrics | 2 |

### §3.6 Count-in and metronome

| Feature | Songsterr behavior | Tier | Woodshed build | Phase |
|---|---|---|---|---|
| Count in | C. One bar of clicks before playback starts | Free | aT `countInVolume` > 0 | 1 |
| Metronome | N. Clicks on every beat during playback | Free | aT `metronomeVolume` | 1 |
| Latency compensation | Settings: 0 to 1000 ms, step 5. Help says Bluetooth audio is the usual cause of lag | Free | offset cursor vs audio clock | 1 |

### §3.7 Display modes

| Feature | Songsterr behavior | Tier | Woodshed build | Phase |
|---|---|---|---|---|
| Tab | Tablature with rhythm stems, chord names, section names, tempo, tuning, "let ring", text cues | Free | aT `staveProfile: Tab` | 1 |
| Sheet | Standard notation only. URL changes `-tab-` to `-sheet-` | Free | aT `staveProfile: Score` | 2 |
| Chords | Lyrics with chord names above, section headings, a Capo on/off switch | Free | separate renderer from lyrics + chord track | 2 |
| Chord diagrams | Chords view: panel of fingering diagrams for every chord used | Free | chord-shape library + generated voicings | 2 |
| Simplify chords | Chords view button ("No chords to simplify" when n/a) | Free | map extended chords to triads | 2 |
| Autoscroll | Chords view: Space starts it, S sets its speed | Free | timed scroll | 2 |
| Transpose in chords view | K | Free | same as §3.4 | 2 |
| Drum notation | Alt+L, "Open drum notation" | Free | aT percussion rendering | 2 |
| Detect chords | Places green chord-name suggestions above the tab from the tab's harmony | Free | pitch-class set per beat group, template match (tonal.js `Chord.detect`) | 2 |

### §3.8 Original audio sync

| Feature | Songsterr behavior | Tier | Woodshed build | Phase |
|---|---|---|---|---|
| Synced recording | A hidden-controls YouTube embed plays and the cursor follows it | Plus (free stops at 10 bars) | aT `PlayerMode.EnabledExternalMedia` + an `IExternalMediaHandler` over the YouTube IFrame API, time updates every 50 ms | 3 |
| Source picker | "Synced video" menu: Full mix, Backing track, Solo, Playthrough | Plus | Full mix and Playthrough = any YouTube video with its own sync points. Backing track and Solo = stems split from uploaded audio (§3.13) | 3 |
| Upload your own audio | Paperclip button: attach an audio file of the recording | Plus | `<audio>` + Web Audio, stored locally | 3 |
| Sync editor | Bars line up with the recording (Songsterr's editor has "Autosynchronization") | Free (editor) | tap-along: user taps each downbeat, store as aT sync points | 3 |

### §3.9 Download

| Feature | Songsterr behavior | Tier | Woodshed build | Phase |
|---|---|---|---|---|
| Download menu | "Choose file format": MIDI, MP3, WAV, Guitar Pro | Plus | MIDI: aT `downloadMidi()`. WAV: aT `exportAudio()` PCM + 44-byte header. MP3: same PCM through an MP3 encoder (lamejs). Guitar Pro: aT GP7 exporter, to be confirmed in P0 | 1 |

### §3.10 Print

| Feature | Songsterr behavior | Tier | Woodshed build | Phase |
|---|---|---|---|---|
| Print | P. Dialog with zoom out / zoom in (starts at 100%) and "Prepare...", which builds a print layout | Plus | aT `print()` with a scale setting and a light-theme print stylesheet | 1 |
| Print chords view | Print button in Chords mode | Plus | print stylesheet for the chords page | 2 |

### §3.11 Settings

| Setting | Songsterr options | Woodshed | Phase |
|---|---|---|---|
| Appearance | Device theme, light, dark | same | 1 |
| Language | Automatic plus English, Español, Italiano, Français, Deutsch, Português, Türkçe, Русский, 日本語, 中文, 한국어 | English first, string table ready for the rest | 5 |
| Draw 4 bars per line | toggle | aT `layout` bars per row | 1 |
| Show multirest | toggle | aT multibar rests | 2 |
| Show dynamics | toggle | aT element visibility | 2 |
| Show beat marks | toggle | aT element visibility | 2 |
| Count in between loops | toggle | §3.3 | 1 |
| Latency compensation | 0 to 1000 ms | §3.6 | 1 |
| Keep the panel open | pinned control panel does not fold on click or on play | same | 1 |
| Rearrange buttons | user orders the control panel buttons | drag to reorder, saved locally | 2 |

### §3.12 Bar menu

The ⋮ at the bottom right of each bar opens a small toolbar: edit this bar,
an autoswitch-target toggle, a loop-this-bar button, and more. Woodshed: same
three actions, phase 2.

### §3.13 Tab editor

Seen with E on the demo song. Changes save automatically as a private draft.

| Feature | Songsterr behavior | Woodshed build | Phase |
|---|---|---|---|
| Note entry | Click a note, arrow keys to move, digits 0 to 9 set the fret, Backspace deletes | aT model edits, re-render the bar | 4 |
| Note toolbar | Not observed (would not open in the pane). Rendered tabs show bends, slides, hammer-ons, pull-offs, vibrato, palm mute, let ring, ties, rests, accents | full Guitar Pro technique set that aT renders | 4 |
| Undo / redo / reset | buttons | command stack | 4 |
| Transcribe with AI | re-transcribe from inside the editor | §3.16 | 6 |
| Autosynchronization | re-syncs audio once bar count, order or length changes | recompute sync points | 4 |
| Reflow notes | moves notes across bars to fit a new time signature | reflow pass | 4 |
| Fix bars | repairs bars whose durations don't add up | validator + fixer | 4 |
| Fretboard | on-screen fretboard for entering notes | clickable fretboard component | 4 |
| Make a copy | "Create and edit a copy of the current tab, for personal experiments" | duplicate score | 4 |
| Import Guitar Pro | replace the tab with a GP file | aT importer | 1 (import), 4 (replace) |
| New blank tab | from `/new`: start from scratch | empty score template | 4 |
| Tutorial | editor tutorial tab | one guided tab | 4 |
| Submit revision | publish the draft | §3.14 | 4 |

### §3.14 Revisions

| Feature | Songsterr behavior | Woodshed build | Phase |
|---|---|---|---|
| Revision list | D. Each entry: date, author, comment, optional "Alternative" tag | revisions table | 4 |
| Diff view | Before/After side by side, changed notes highlighted red and green, unchanged bars hidden with "Show all bars", "Show full tab" for either side | bar-level diff of two scores | 4 |
| Drafts | private draft playable before publishing | draft flag | 4 |
| Delete own revision | within 24 hours of upload | rule in API | 5 |

### §3.15 Library, search, account

| Feature | Songsterr behavior | Woodshed build | Phase |
|---|---|---|---|
| Search | "Search over a million tabs", with a popular-songs list as default | search over the user's library (§4.1) | 1 (local), 5 (shared) |
| Filters | Instrument (guitar, bass, drums), tuning (about 100 presets for 6 to 12-string guitar and 4 to 6-string bass, plus "Create custom tuning"), difficulty (beginner, intermediate, advanced) | same filters, tuning list as data | 5 |
| Artist pages | `/a/wsa/<artist>-tabs-a<id>` | artist view | 5 |
| My tabs | Favorites, Contributions, Playlists | same | 1 (favorites, local), 5 (rest) |
| Playlists | free with an account | same | 5 |
| Mark as learned | named on `/plus` ("users of this feature learn 60% faster"); not seen in the free UI | per-song learned flag + date | 5 |
| Accounts | sign in, sync favorites across devices, delete account | auth (§5) | 5 |
| URLs | per song, track and mode: `-tab-s14`, `-bass-tab-s14`, `-sheet-`, `-chords-`, `s14t2`, revision diffs `/r<a>...r<b>` | readable routes per song/track/mode | 1 |

### §3.16 AI transcription

| Feature | Songsterr behavior | Woodshed build | Phase |
|---|---|---|---|
| Input | YouTube link or uploaded audio file | uploaded audio first; YouTube needs a download step with its own terms issue (§4.1) | 6 |
| Settings | time signature (beats, beat value), pickup bar, tempo, triplet feel, instruments Auto or Adjust, fingerstyle, per-track instrument/tuning/capo, piano staves 1 or 2 | same form | 6 |
| Output | separate tracks for rhythm and lead guitar, bass, drums, vocals, piano, keys/synth, strings, winds. Writes bends, vibrato, slides, palm mutes. Supports 6/7/8-string guitar and 4/5/6-string bass, custom tunings, capo | stem split (Demucs), note detection (basic-pitch), beat tracking, then string/fret assignment | 6 |
| Turnaround | 5 to 15 minutes, emailed when done; free preview is 20 seconds | background job queue | 6 |

### §3.17 Teacher plan

Private workspace, student seats, private tabs and student playlists, invoices
and purchase orders. Billing does not apply when everything is free. The useful
part is private sharing: a playlist shared with chosen accounts. Phase 5.

### §3.18 Apps, offline, help

| Feature | Songsterr behavior | Woodshed build | Phase |
|---|---|---|---|
| iOS / Android apps | native apps, offline cache of opened tabs and played audio, YouTube not offline | installable PWA with a service worker cache | 5 |
| Help center | FAQ, shortcuts, AI assistant, contact form, screencast bug reports | help page with the shortcut list | 2 |

### §3.19 Keyboard shortcuts (Songsterr's list, kept as-is)

Space play/pause · Backspace loop start or bar 1 · double-click beat play from
there · Left/Right beat · Up/Down line · T tracks · Ctrl+Shift+Up/Down or
Alt+Shift+1–9 switch track · S speed · L loop · Shift+Left/Right loop end ·
Alt+M solo · M mute · C count-in · N metronome · V synth/original · K transpose ·
E editor · P print · D revisions · Alt+L drum notation · Esc close popup ·
Ctrl+K help.

---

## §4 Hard constraints

### §4.1 The catalog is the one thing that can't be copied

Songsterr's value is 1.3 million tabs, and its help page says it licenses that
content from music publishers, and that this does not allow showing its
content on another site through an API or embedded player. Woodshed must not
scrape or mirror it.

So Woodshed's tabs come from:

1. Files the user already has: Guitar Pro (gp3, gp4, gp5, gpx, gp), MusicXML,
   alphaTex, and plain-text ASCII tabs.
2. Tabs written in the Woodshed editor.
3. AI transcription of audio the user supplies.

A public site where anyone shares tabs of copyrighted songs needs publisher
licenses, the same way Songsterr has them. Until that question is answered
(§9), libraries are private to their owner, and sharing is limited to the
user's own work and public-domain music. YouTube-link transcription also
needs a look at YouTube's terms before it ships. Songsterr links are handled
in §11.

### §4.2 YouTube limits

The YouTube iframe can't be pitch-shifted, which Songsterr's own popup admits.
Its speed is limited to the rates `getAvailablePlaybackRates()` returns, not
1% steps from 15%. Full speed range and pitch shift on the real recording
only work on uploaded audio. `seekTo` can start playback by itself
(alphaTab's sync guide calls this out), so the handler has to re-pause.

### §4.3 alphaTab limits (from its docs, to be measured in P0)

- In backing-track mode you hear either the recording or the synth, not both
  mixed. Songsterr behaves the same way (ORIG or SYNTH).
- alphaTab doesn't pitch-shift recorded audio. That needs our own worklet.
- A Guitar Pro exporter isn't on the API page. Check the package for
  `Gp7Exporter` before promising GP download.

### §4.4 Don't look like Songsterr

Same features, own name, own layout and colors. No Songsterr logo, wording,
green-on-dark look, or URL scheme copied as-is.

### §4.5 Heavy compute

Stem splitting and transcription are GPU-hungry. On this machine they compete
with ReversiBot self-play, which already starves the job-pipeline poll. Phase
6 needs a queue that runs one job at a time and can wait.

---

## §5 Stack

| Layer | Choice | Why |
|---|---|---|
| Notation, playback, cursor | **alphaTab** (`@coderline/alphatab`, MPL-2.0, v1.9.0) | Reads every format in §4.1. Has speed, loop range, count-in, metronome, per-track mute/solo/volume/transpose, print, MIDI export, audio export, external media sync. Covers most of §3.1 to §3.10 |
| App | Vite + TypeScript + React | Boring and well known. The player is mostly one interactive page |
| Sound | SoundFont through alphaTab's synth | Ships with a default font; swap for a better GM font after a license check |
| Chord names | tonal.js | Chord detection and key-aware transposition |
| Audio stretch/pitch | SoundTouch in an AudioWorklet | Independent speed and pitch on uploaded audio. LGPL, used unmodified |
| MP3 encode | lamejs | Pure JS |
| Local storage | IndexedDB | Phases 1 to 4 need no server |
| Accounts and sync | Supabase (Postgres, auth, file storage) | Same choice as Vinyl Crate. Phase 5 |
| AI jobs | Python worker: Demucs (stems), basic-pitch (notes), a beat tracker | Phase 6 only |
| Offline | PWA service worker | Phase 5 |

---

## §6 Data model (first cut)

- **Song**: id, title, artist, source (file / editor / ai), created, learned_at.
- **Score file**: the canonical file (alphaTab JSON or GP), versioned per
  revision.
- **Track meta**: player, gear, role, autoswitch targets per bar.
- **Media**: kind (youtube / upload / stem), url or blob id, label (full mix,
  backing, solo, playthrough), sync points `[{bar, time_ms}]`.
- **Revision**: id, song, parent, author, comment, alternative flag, draft
  flag, created.
- **Prefs**: theme, language, layout toggles, latency ms, panel order, last
  track per song, last speed per song.
- **Playlist**, **Favorite**: phase 5.

---

## §7 Build order

Each phase ends with the acceptance checks listed, run in a real browser, and
the results written back here.

### Phase 1: the practice player (the essentials)

Import a file, see the tab, and practise it. Covers everything named in the
request: loop, speed, transpose, mute, count-in, settings, print, download,
metronome.

- Import GP / MusicXML / alphaTex / ASCII text tab into a local library.
- Add from a Songsterr link: fetch the tab data, save it raw, convert it to
  a Guitar Pro file (§11).
- Tab view, cursor, follow scrolling, click and double-click on beats.
- Transport, speed panel, loop with handles, count-in, metronome, count-in
  between loops, latency compensation.
- Transpose (fret rewrite + chord respelling) and shift pitch (synth).
- Mixer: track switch, solo, mute, per-track and master volume.
- Download MIDI, WAV, MP3, and GP if P0 confirms it. Print with scale.
- Settings panel and every shortcut in §3.19 that phase 1 covers.

Acceptance checks:

- 50% speed: four bars take twice as long as at 100%, within 2%.
- Loop on bars 3 to 4 plays them three times in a row with no drift. With
  count-in between loops on, a bar of clicks plays before each repeat.
- Transpose +2: every fret is 2 higher, Am reads Bm. Transpose −3 on an open
  string either moves the note to the next string or flags it.
- Mute the shown track: it goes silent and the others keep playing. Solo
  plays only that track.
- Count-in plays exactly one bar of clicks in the song's time signature.
- The downloaded MIDI reopens in alphaTab with the same note count. The WAV
  is the song length at 44.1 kHz.

First real test file: `Desktop/Claude/guitar-tabs/earrings-malcolm-todd.txt`,
the ASCII tab transcribed on 2026-11-09. It exercises the ASCII importer, has
a known tempo (160, swung), and has audio to check it against.

### Phase 2: views and tracks

Sheet view, chords view (lyrics, capo, simplify, diagrams, autoscroll),
detect chords, drum notation, multitrack, AI track autoswitch, bar menu,
remaining settings, help page.

### Phase 3: original audio

YouTube sync with tap-along sync points, uploaded audio, speed and pitch on
uploaded audio, source picker (full mix, backing, solo, playthrough), stems
from uploaded audio.

### Phase 4: editor and revisions

Note entry and techniques, undo and redo, fretboard, reflow, fix bars,
autosync, copy, blank tab, revisions with diff view and drafts.

### Phase 5: accounts and library

Supabase auth, cloud library, favorites, contributions, playlists, private
sharing (teacher-plan equivalent), mark as learned, search with instrument,
tuning and difficulty filters, artist pages, PWA offline, languages.

### Phase 6: AI transcription

Uploaded audio to stems to notes to tab, with the `/new` settings form and a
job queue. Treat it as research. Expect rough output that the editor fixes.

---

## §8 P0: probe before building

Write `probe/` scripts and record results in `FINDINGS.md`.

1. Load a GP5 and a GP7 file in alphaTab. Confirm tracks, lyrics, tuning and
   techniques render.
2. Measure `playbackSpeed` at 0.15 and 1.75 against wall-clock time.
3. Loop a two-bar `playbackRange` ten times. Measure drift.
4. Confirm count-in and metronome volumes, and whether count-in can repeat at
   each loop wrap or needs our own click.
5. Check the npm package for a GP7 exporter and try a round trip. **Done
   2026-11-10 (§11.5):** `exporter.Gp7Exporter` exists in 1.9.0 and two
   songs round-trip with every note and pitch intact.
6. `exportAudio()`: get PCM, write a WAV, play it back.
7. YouTube handler: list available playback rates and measure cursor drift
   over two minutes with sync points every 4 bars.
8. Check the default SoundFont's license and size.

---

## §9 Open questions for Andrew

1. Personal tool, or a public site other people sign up for? This decides
   whether phase 5 exists and how §4.1 plays out.
   **Answered 2026-11-11: shared with other users, behind Google sign-in.
   Design in §13.3.**
2. Do you have Guitar Pro or MusicXML files to start the library with?
3. Keep the name Woodshed?

---

## §10 Log

- 2026-11-10: Songsterr analyzed in the browser (free song, demo song, help
  center, Plus, teacher and new-tab pages). Plan written. No code yet.
- 2026-11-10: §11 added (add a tab from a Songsterr link). Measured how the
  link page loads its data and read Songsterr's terms and `ai.txt`. First
  draft routed the copy through Songsterr's Download button.
- 2026-11-10: Andrew says he has special permission from Songsterr. §11
  rewritten for direct import of the link's tab data. Importer built and
  tested on Earrings and Come As You Are (§11.5). P0 item 5 answered.
- 2026-11-10: Phase 1 app written (§12). Library and tab view confirmed,
  the rest untested when the session ran out.
- 2026-11-11: Phase 1 browser checks finished (§12.3). Nine bugs found and
  fixed. Eight more Songsterr fields mapped (§12.4).
- 2026-11-11: Four requests from Andrew (§13). Page width, note spacing,
  lead and backing volume, and the bass filter are built and checked. The
  shared library is designed and waiting on accounts.
- 2026-11-11: Hosted copy deployed to Vercel behind a password gate (§14).
  GitHub push waiting on Andrew's sign-in; password waiting on him too.
- 2026-11-12: Phase 2 cut into three slices. Slice 2a built and checked
  (§15): sheet and tab+sheet views, several tracks at once, multirest,
  dynamics and rhythm switches, help panel.
- 2026-11-12: Code pushed to github.com/AndrewOxenberg/Woodshed. Password
  gate removed from the hosted copy at Andrew's request (§14.5).
- 2026-11-13: Songsterr's Chords view measured: it is a separate ChordPro
  sheet, not the tab. Slice 2b designed (§16), built and checked (§16.6).
  Slice 2c (bar menu, track autoswitch, rearrange buttons) designed and
  built (§17.5). Phase 2 is done. Phase 3 cut in two; 3a (YouTube sync with
  Songsterr's points) designed, built and checked (§18.5). Not committed,
  not deployed.
- 2026-11-13: Andrew's report: blank page on the way back to the library,
  a crash on drum tracks, no audio on bake shop, songs opening on drums.
  Fixed, with the recording now playing by default (§19).

---

## §11 Add a tab from a Songsterr link

Requested 2026-11-10: paste a link such as
`https://www.songsterr.com/a/wsa/malcolm-todd-earrings-tab-s1576708t1/r8752738`
and end up with that tab saved in Woodshed.

### §11.1 What was measured

- The link carries the song id (`s1576708`), the track (`t1`, "Lead Guitar"
  on this song) and the revision (`r8752738`). Track and revision are
  optional; without a revision the page serves the latest one.
- The page HTML embeds `<script id="state" type="application/json">`.
  `state.meta.current` holds songId, revisionId, title, artist, `image` (a
  hash naming the notation build), `defaultTrack`, `tracks[]` (instrument,
  name, MIDI tuning, isGuitar / isBassGuitar / isDrums / isVocalTrack) and
  `videos[]` (YouTube ids). Earrings: 13 tracks, 17 videos.
- Each track's notation is a separate file:
  `https://dqsljvtekg760.cloudfront.net/{songId}/{revisionId}/{image}/{trackIndex}.json`.
  Earrings lead guitar: 21 KB, format `version: 8`, 50 measures. Shape:
  measures, voices, beats, notes. Measures carry `signature`,
  `tripletFeel`, `marker`. Beats carry `duration` as `[num, den]`, `rest`,
  `tuplet`, `graceNote`, `velocity`, `text`. Notes carry `fret`, `string`,
  `hp`, `dead`, `ghost`, `staccato`, `bend`, `leftHandVibrato`. Tempo is in
  `automations.tempo`, lyrics in `newLyrics`.
- YouTube sync points come from `/api/video-points/{songId}/{revisionId}/list`.
- alphaTab 1.9.0 ships `exporter.Gp7Exporter` and `exporter.AlphaTexExporter`
  (checked in the npm package). So a converted score can be saved as a
  Guitar Pro file. This answers P0 item 5's existence question; the round
  trip is tested in §11.5.

### §11.2 Permission

Songsterr's terms (updated 2026-06-10) reserve Download for Plus and say
copying needs "express advance written permission". On 2026-11-10 Andrew said
he has special permission from Songsterr, so the importer fetches directly.
Keep that permission in writing somewhere findable.

Design rules that hold regardless:

- One link at a time, when asked. No crawling search, artist or popular
  pages.
- Requests go one after another with a short pause, from a generic client
  name.
- Imported tabs stay in the private local library. `library/` is
  git-ignored, so a pushed repo never republishes them.

### §11.3 Flow

1. `npm run import-songsterr -- <link>`. Phase 1's "Add from Songsterr" box
   calls the same module.
2. Parse the link, fetch the page, read `state`, fetch every track file and
   the video sync points.
3. Save the raw files under `library/songsterr/<songId>-r<revisionId>/`:
   `meta.json`, `tracks/<i>.json`, `video-points.json`, `source.json` (link,
   fetch time, client). Raw is the source of truth. A better converter
   re-runs on it without fetching again.
4. Convert raw to an alphaTab score and write `score.gp` with `Gp7Exporter`.
   Re-import that file with alphaTab to check it.
5. Importing a newer revision of the same song saves next to the old one.

### §11.4 Where it lands

Phase 1, as a Node tool now (`tools/songsterr-import.mjs`), with the app's
button later.

Acceptance checks:

- The example link parses to song 1576708, track 1, revision 8752738.
- All 13 track files and `meta.json` save. A second run with a link that
  names its revision doesn't fetch anything. A link without a revision
  fetches the page once to learn the latest revision, then reuses the saved
  tracks if that revision is already there.
- `score.gp` re-imports with 13 tracks, and the lead guitar has 50 bars with
  the same note count as the raw JSON.
- Spot check bars against the Songsterr page: frets, strings, durations,
  tempo, time signature, tuning.

### §11.5 Results (2026-11-10)

Built: `tools/songsterr/fetch.mjs` (link to raw files),
`tools/songsterr/convert.mjs` (raw to alphaTab score to `score.gp`),
`tools/songsterr-import.mjs` (the command), and
`tools/songsterr/songsterr.test.mjs` (7 tests, `npm test`, no network).

Earrings (song 1576708, revision 8752738):

- 13 tracks, 50 bars, 80 BPM, 16th-note triplet feel, 2-beat pickup bar.
  Raw track files 355,599 bytes, `score.gp` 99,874 bytes.
- Note counts match in raw, built score and re-read `score.gp` for every
  track: 5,777 pitched notes and 512 drum hits.
- Every pitched note in `score.gp` has the pitch Songsterr's data gives
  (tuning[string] + fret): 5,777 of 5,777.
- String direction confirmed two ways. Read with string 0 as the top line,
  the chord labeled A♭ comes out A♭ E♭ C A♭ E♭ A♭ and the E♭madd9 comes out
  F D♭ G♭ E♭, the same voicing as `guitar-tabs/earrings-malcolm-todd.txt`
  ("Ebm9 x6466x"). The other direction gives non-chord tones. Songsterr's
  page also draws bar 18's bend on the B string and bar 19's on the high E,
  as the data says.
- Bend scale confirmed: `tone: 100` is drawn as "full" on Songsterr, so
  tone / 25 = alphaTab quarter tones.
- Playback length from alphaTab's MIDI generator: 148.50 s, exactly 2 beats
  plus 49 bars of 4/4 at 80 BPM.
- Songsterr numbers the pickup bar 0, so its "bar 17" is index 17 in the
  file and bar 18 counting from 1.

Come As You Are (song 14, revision 9744332), run to find fields Earrings
doesn't use. First run reported 9 unknown fields. Now mapped and checked in
`score.gp`:

| Songsterr field | alphaTab | Checked |
|---|---|---|
| `beat.letRing` | `note.isLetRing` on each note | 2,235 notes |
| `measure.keySignature` `{accidentalCount, mode, transposeAs}` | `bar.keySignature` + type (on each staff bar; the master-bar setter crashes in 1.9) | E minor, 1 sharp |
| `beat.pickStroke` up/down | `beat.pickStroke` | 6 beats |
| `beat.brushStroke.direction` | `beat.brushType` | 3 beats. Duration (563, unit unknown) not mapped |
| `beat.vibratoWithTremoloBar` | `beat.vibrato` | 731 beats |
| `note.slide: "upwards"` | `SlideOutType.OutUp` | 1 note |
| `track.sounds` + `trackAutomations` | instrument automation on the bar's first beat | clean to distortion at bar 60, back at 78 |
| `newLyrics` (Guitar Pro syntax) | `track.applyLyrics`, after `score.finish()` | first vocal line lands on bar 10, one syllable per beat |
| `track.title`, `withLyrics` | ignored, informational | |

Tuning D G C F A D (whole step down) carries over; 4,871 of 4,871 pitches
match.

Known limits:

- Fields not seen in these two songs are reported in `convert-report.json`
  and by the tests, never guessed. Likely next: repeats, palm mute,
  harmonics, tremolo picking, tapping, capo, flat key signatures.
- Tempo changes and sound changes are placed at the start of their bar.
  Only position 0 has been seen.
- Not imported yet: Songsterr's per-song video list and sync points
  (`video-points.json` is saved raw for phase 3).
- The phase 1 app doesn't exist yet. The library is `library/songsterr/`,
  and the app will read `score.gp` from there.

---

## §12 Phase 1 build notes

Written 2026-11-10, before the code. Decisions that differ from §5 to §7 or
fill a gap in them.

### §12.1 Library lives on disk, behind a local API

§5 said IndexedDB. The Songsterr importer has to run in Node (the browser
can't fetch songsterr.com pages across origins), so a local server exists
anyway. One store is simpler than two: every tab is a folder under
`library/`, and the dev server exposes it.

- `GET /api/library` lists songs. `GET /api/library/<id>/score` returns the
  score file. `POST /api/library/files?name=` saves an uploaded file.
  `POST /api/library/songsterr` runs §11 on a link. `DELETE
  /api/library/<id>` removes a song.
- The API is a Vite plugin (`server/library-api.mjs`), attached to both
  `vite dev` and `vite preview`. It only listens on localhost.
- Uploads are checked by loading them with alphaTab on the server. Guitar
  Pro, MusicXML and alphaTex are kept as they are. A plain-text tab is
  parsed (`tools/ascii-tab.mjs`) and saved as `score.gp` next to the
  original.
- Preferences (theme, layout, latency, last track and speed per song,
  favorites) stay in the browser's localStorage.
- If §9 lands on "public site", the store moves to Supabase in phase 5. The
  player only talks to the API, so nothing else changes.

### §12.2 Player decisions

- alphaTab 1.9 settings: `playerMode: EnabledSynthesizer`,
  `enableSeekToClick` on, `enablePlaybackRangeSelection` off (loops are
  bar-snapped, like Songsterr's), `scrollMode: Off` (own follow scroller,
  §3.1).
- Loop: own overlay drawn from `boundsLookup`, with a handle at each end.
  `playbackRange` is set from bar starts and ends.
- Count-in between loops: alphaTab counts in on every `play()`, not on a
  loop wrap. With the setting on, looping is manual: on `playerFinished`,
  seek to the loop start and call `play()` again.
- Transpose: serialize the score to JSON, change frets, strings, chord names
  and key signatures there, and rebuild with `JsonConverter.jsonToScore`.
  That reruns alphaTab's `finish()` so its internal lookups stay right. A
  note pushed below fret 0 moves to the next lower string. If there is none
  (or it's taken in that beat) the note goes up an octave and is counted,
  and the panel shows the count.
- Chord spelling: the first chord sets the key. Flat keys spell every chord
  with flats, sharp keys with sharps.
- Shift pitch: `changeTrackTranspositionPitch` on every pitched track.
- Latency compensation: delays the cursor, not the audio.
- Downloads: MIDI from `MidiFileGenerator`, WAV from `exportAudio` at 44.1
  kHz, MP3 from the same samples through `@breezystack/lamejs` (the plain
  `lamejs` package breaks under ES module bundlers), Guitar Pro from
  `Gp7Exporter`. All four export the score as currently transposed.
- Routes are hash-based: `#/` library, `#/song/<id>/<track>`.

### §12.3 Results (2026-11-11)

Phase 1 is built and checked in a real browser (Chromium, 967 px wide, then
375 px). `npm run dev` serves it at `http://127.0.0.1:5183`. `npx tsc` is
clean, `npm test` passes 18 tests offline, and `npm run build` produces a
7.5 MB `dist/`.

I can't hear the output. Where a check says "level", it is the signal
measured with a Web Audio analyser tapped onto alphaTab's output node.

§7 acceptance checks, on Earrings (13 tracks, 80 BPM):

| Check | Result |
|---|---|
| 50% speed takes twice as long | Four bars: 12,000 ms at 100%, 23,999 ms at 50%. Ratio 1.9998 |
| Loop bars 3 to 4, three times, no drift | Range is ticks 5,760 to 13,440. Passes took 6,020, 6,020 and 6,019 ms. Steady, with a fixed 20 ms gap at the wrap |
| Count-in is one bar | The song started moving 3,014 ms after play. One bar at 80 BPM is 3,000 ms |
| Count-in between loops | Each repeat took 9,030 ms: the 6 s loop plus a 3 s count-in |
| Mute and solo | Level 0.363 with all tracks. 0 with the lead guitar soloed in a bar where it rests. 0 with every track muted. 0.136 with only the bass unmuted. 0.016 with only drums soloed |
| Transpose +2 | E♭madd9 became Fmadd9, A♭ became B♭, frets 6-6-4-6 became 8-8-6-8. Cursor stayed on its bar. Tool shows "tab +2" |
| Transpose below fret 0 | Tests only: on Come As You Are at -3, no fret is negative; notes move down a string or the beat goes up an octave, and the counts match |
| MIDI download | 69 KB, valid header. Tests: 5,487 note-ons, which is alphaTab's own count |
| WAV download | 26.2 MB, 44.1 kHz stereo, 148.50 s, the exact song length. Rendered in 2.9 s |

Other checks:

- Click a note: the cursor jumps there. Double-click: it plays from there.
- Every shortcut in §3.19 that phase 1 covers, with real key presses.
- Loop handles dragged with the mouse: end handle to the next line gave
  bars 2 to 9, start handle gave bars 5 to 9. The highlight spans both lines.
- Follow scrolling: over seven lines it scrolled twice, each time because
  the next line would have left the screen. Scrolling by hand held the view
  until play was pressed again.
- Shift pitch: a bass note measured 116.7 Hz as written, 122.9 Hz at +1,
  104.0 Hz at -2. Frets unchanged.
- MP3: 3.56 MB, valid frames, 148.5 s at 192 kbps. Guitar Pro: 105 KB zip.
- Download buttons save `Malcolm Todd - Earrings.mid` and so on (the save
  was intercepted in the test, no file written).
- Print view: A4 width, title "Earrings - Malcolm Todd", black and grey ink,
  print called once. Tested with the pop-up pointed at an in-page frame, so
  the real system print dialog has not been seen.
- Sound delay at 300 ms: the cursor moved 306 and 315 ms after alphaTab
  asked. At 0 it moved at once.
- Text-tab import: `guitar-tabs/earrings-malcolm-todd.txt` is in the library
  (22 bars, 284 notes, three section names) and plays at 160 BPM.
- Library page: file drop, Songsterr link box, search, favorites filter,
  delete with confirm. Bad files answer HTTP 400 with a plain message. Path
  tricks answer 404.
- Light and dark themes both redraw the tab in the right ink.
- Phone width (375 px): no sideways page scroll, one bar per line, toolbar
  scrolls inside its own row.

Bugs the checks found, all fixed:

1. **Frozen playback after pausing a count-in.** alphaTab keeps a
   half-played count-in and finishes it silently before the song moves, even
   with count-in off. The engine now tracks that state and reloads the MIDI
   to clear it. After the fix the song moves 132 ms after play.
2. **Clock wrong at any speed but 100%.** alphaTab's times are already
   wall-clock at the current speed; the engine divided by the speed again.
   75% showed 4:24 for a 3:18 song. Now 2:28, 3:18 and 4:57 at 100, 75, 50%.
3. **Clipping.** The 13-track mix peaks at 1.48 against a limit of 1.0.
   Default volume is now 70%, and WAV/MP3 exports are scaled to a 0.98 peak.
4. **Page wider than the window.** The toolbar's width leaked into the page
   grid. Fixed with a `minmax(0, 1fr)` column; the toolbar wraps on desktop.
5. **Bar numbers off by one** on songs with a pickup bar. The tab numbers
   the pickup 0, so the readout and loop label now do too.
6. **Space toggled the focused button**, so after clicking Loop, Space
   switched the loop off. Space is now always play/pause outside text boxes.
7. **Fonts and sounds 404 in dev.** alphaTab's Vite plugin copies them into
   `public/` at startup, after Vite has listed that folder. The local API
   serves them from `node_modules` as well.
8. **Top bar squeezed the title** to "Earr…" on a phone.
9. Unreadable uploads answered 500. Now 400.

Not checked, or known gaps:

- No human has listened to it. Levels and pitches are measured, tone is not.
- Only Chromium. Firefox and Safari are untested.
- The system print dialog and a real saved download.
- A real drag of a file from the desktop (the drop was simulated).
- Manual scrolling was not held through a line change, only within a line.
- The loop wrap has a 20 ms gap every pass (alphaTab's, not tuned).
- Guitar Pro 3 to 6, MusicXML and alphaTex uploads. Only Guitar Pro 7 and
  text tabs have been through the importer.
- Left out of phase 1 on purpose: "Keep the panel open" (the transport bar
  is always visible) and "Rearrange buttons" (phase 2).

### §12.4 Songsterr fields added since §11.5 (2026-11-11)

Andrew imported three more songs through the link box. Two used fields the
converter had not seen. Mapped from their real values, then re-converted
from the saved raw data and counted in `score.gp`:

| Songsterr field | alphaTab | Seen in |
|---|---|---|
| `note.vibrato: true` | `note.vibrato = Slight` | Tennessee Whiskey, 9 notes |
| `note.trill {auxiliaryFret, speed}` | `note.trillValue` = string pitch + fret. Speed (84, 69) has an unknown unit and is left at alphaTab's default | 6 notes |
| `beat.gradualVelocity: "crescendo"` | `beat.crescendo` | 19 beats |
| `beat.tremolo: [1, 32]` | `beat.tremoloSpeed`, 32nd notes | 6 beats |
| `slide: "below"` | `SlideInType.IntoFromBelow` | 2 notes |
| `slide: "downwards"` | `SlideOutType.OutDown` | 2 notes |
| `track.voices: 1` | ignored, a count | Fly Love |
| `beat.upStroke: 1` | ignored when the beat has a `brushStroke`, which it always has so far. Reported if it ever appears alone | Fly Love, 3 beats |

Five songs are in the library now and all convert with nothing unknown.

---

## §13 Requests from Andrew, 2026-11-11

Four asks after trying phase 1. Checked against the plan first.

| Ask | Already planned? | Now |
|---|---|---|
| Change the page width to spread the notes out | No. Only tab size and four bars per line (§3.11) | Build now, §13.1 |
| Volume for the lead and for the backing | Per-track sliders exist. No single lead-vs-rest control | Build now, §13.2 |
| Songs shared between all users, Google login, upload limits, admin | Phase 5 had "accounts and cloud library" with no detail, waiting on §9 | Designed in §13.3. Not built: needs accounts and hosting from Andrew. He said it is not a priority |
| Add and filter by bass tabs | Instrument filter was phase 5 (§3.15). Bass links not handled | Build now, §13.4 |

### §13.1 Page width and note spacing

Two settings, because they do different things in alphaTab's page layout.

- **Page width.** How wide the sheet is, from 500 px up to the full window.
  Default stays 1100 px. A wider page fits more bars on a line; it does not
  move notes apart by itself.
- **Note spacing.** alphaTab's `display.stretchForce`, 50% to 250%, default
  100%. This is the one that spreads notes out: bars get wider, so fewer fit
  on a line.

Both live in Settings, save in prefs, and redraw as the slider moves.

Checks: at 200% spacing the same bar is about twice as wide and each line
holds fewer bars. Narrowing the page reduces bars per line. No sideways
page scroll at any setting.

### §13.2 Lead and backing volume

"Lead" is the track on screen. "Backing" is every other track. Two sliders
at the top of the Tracks panel, next to overall volume.

- A track's level is its own slider times the lead or backing slider.
- Switching track moves which one counts as lead.
- Saved in prefs, so "backing at 50%" carries to the next song.
- WAV and MP3 exports use the same levels.
- Songs with one track show no backing slider.

Checks, by measured level: backing at 0 with the lead resting gives silence.
Lead at 0 leaves the backing level unchanged. Both at 100% matches the level
from before the change.

When original audio arrives in phase 3, the backing slider also drives the
backing-track recording.

### §13.3 Shared library (designed, not built)

Andrew's ask: every song anyone adds is there for everyone. Google sign-in.
Five uploads per user per day. He is admin: unlimited uploads, sees the user
list, can raise limits for chosen people. This answers §9 with "public
site", and replaces the vague half of phase 5.

Design:

- **Hosting.** The app as a static site on Vercel (already used for the JAPN
  trainer). Supabase for the database, Google sign-in and file storage. The
  Songsterr importer and text-tab parser move from the Vite plugin into
  serverless functions; they already run in Node.
- **Tables.** `profiles` (id, email, name, role `admin` or `member`,
  `daily_limit` default 5, `blocked`). `songs` (id, title, artist, kind,
  songsterr song and revision ids, file hash, instruments, added_by,
  added_at, storage path).
- **Reading.** Signed-in users see every song. Nothing is readable without
  signing in, which also keeps the library out of search engines.
- **Adding.** Counted in the server function and in database rules, not
  just hidden in the page. A user may add while their songs from the last
  24 hours number fewer than their `daily_limit`. Admin has no limit.
- **Duplicates.** The same Songsterr song and revision, or the same file
  hash, is stored once. Re-adding it opens the existing song and does not
  use up the day's allowance.
- **Admin page.** Users: email, joined, songs added, limit, block. Songs:
  who added each, remove.
- **Per user, not shared.** Favorites, last track and speed per song,
  settings.
- **Storage.** Keep `score.gp` only (about 100 KB a song), not Songsterr's
  raw files. Roughly 10,000 songs per GB.

Suggestions beyond the ask:

1. **Start invite-only.** An allowlist of Google accounts instead of open
   sign-up. Open sign-up plus five a day still lets 100 strangers add 500
   songs a day. Opening up later is one switch.
2. **A "report this tab" link** and a way for the admin to remove a song
   fast.
3. **Rolling 24 hours**, not a midnight reset, so nobody adds five at 11:59
   and five at 12:01.

One thing to settle before opening it to other people: handing tabs of
copyrighted songs to all users is distribution, including the ones copied
from Songsterr. Songsterr pays publishers for that (§4.1). The permission
from §11.2 covers Andrew's own imports. It needs to say, in writing, that it
covers sharing with other users. Invite-only among friends lowers the
exposure but does not remove the question. This is Andrew's call, not a
reason to skip the build.

Needed from Andrew to build: a Supabase project, a Google OAuth client, the
admin email, and a yes on Vercel. Roughly phase-5 sized. Order to be agreed
against phase 2.

### §13.4 Bass tabs

- **Links.** A Songsterr link with `-bass-tab-` or `-drum-tab-` in it and no
  track number opens on Songsterr's own pick for that instrument
  (`popularTrackBass`, `popularTrackDrum` in the page data). Links with a
  track number (`t3`) already worked.
- **Library data.** Each song lists which tracks are guitar, bass, drums or
  other. Songsterr imports use Songsterr's flags. Uploaded files are
  classified once from the score: percussion staff, MIDI program (32 to 39
  is bass, 24 to 31 guitar), then string count.
- **Filter.** Chips above the list: All, Guitar, Bass, Drums. With Bass on,
  only songs with a bass track show, and opening one lands on that track.
- **Badges.** Each row says which instruments the song has.
- Text tabs with four or five strings were already read as bass.

Checks: a `-bass-tab-` link opens the bass track. The Bass filter hides
songs with no bass. Opening from the Bass filter shows a four-string tab.

### §13.5 Results (2026-11-11)

§13.1, §13.2 and §13.4 are built and checked in the browser. §13.3 is design
only. `npx tsc` clean, `npm test` 21 passing, `npm run build` succeeds.

Page width and note spacing (Earrings, lead guitar, 1024 px window):

| Setting | Lines | Bars per line | Bar 18 width |
|---|---|---|---|
| Spacing 100% | 11 | 7, 6, 5, 3, 2, 4 | 401 px |
| Spacing 200% | 21 | 4, 3, 3, 3, 3, 2 | 561 px |
| Spacing 50% | 8 | 11, 7, 3, 2, 6, 11 | 440 px |
| Page width 700 | 18 | 4, 4, 4, 4, 2, 2 | 386 px |
| Page width full | 11 | as 100% | 401 px |

The plan said a bar would be about twice as wide at 200%. It is 1.4 times,
because a bar can't grow past its line. The count of bars per line is what
halves. No sideways page scroll at any setting. alphaTab re-lays the page
out by itself when the sheet's width changes.

Lead and backing volume, as measured signal level with overall volume at
70%:

| Lead | Backing | Bar | Level |
|---|---|---|---|
| 100% | 100% | solo | 0.396 |
| 100% | 0 | solo | 0.0435 |
| 50% | 0 | solo | 0.022, half |
| 0 | 100% | solo | 0.398 |
| 0 | 0 | solo | 0 |
| 100% | 100% | lead resting | 0.260 |
| 100% | 50% | lead resting | 0.130, half |
| 100% | 0 | lead resting | 0 |

With the bass on screen, lead-only gave 0.106 and backing-only 0.233, so
"lead" follows the track being shown. A click on the backing slider set 50%
in the player and in the saved settings.

Bass:

- Library rows now read "Guitar, bass, drums" and so on.
- Bass filter: four of six songs remain (Fly Love and the Earrings text tab
  have no bass) and each opens on its bass track.
- Opening Come As You Are from the Bass filter shows the four-string track,
  tuned D G C F.
- A `-drum-tab-` link for a saved song set it to open on track 7 and made no
  duplicate. Through the API a `-bass-tab-` link gives track 6, a `t2` link
  gives 2, a plain link gives none.

One bug found: the dev server's watcher ignored `**/library/**` so that
saving a tab would not reload the page. That glob also matched
`src/library/`, so edits to the library page were never picked up until a
restart. The ignore now names the top-level `library/` folder only.

Not checked: none of this has been listened to, and the two volume sliders
have not been tried during an export.

---

## §14 First hosted copy (Vercel), 2026-11-11

Andrew asked for the code on a new GitHub repo and the app live on Vercel
now. The shared library (§13.3) is the real hosted design, but it waits on
Supabase and Google accounts. This section gets a working hosted copy
without them.

### §14.1 What changes for the hosted copy

The app on Andrew's machine keeps its local library API (§12.1). Vercel has
no lasting disk, so the hosted build keeps its library in the browser
instead.

- **Library in the browser.** The production build stores songs in
  IndexedDB: the entry and the score file. Each browser has its own library
  until §13.3 replaces it. `npm run dev` still uses `library/` on disk.
- **Opening files** happens in the browser: alphaTab reads Guitar Pro,
  MusicXML and alphaTex there, and the text-tab parser and instrument check
  are plain JavaScript that already run anywhere.
- **Songsterr links** go to one serverless function, `/api/songsterr`. It
  runs the §11 importer in a scratch folder and returns `score.gp` plus the
  song's details. It stores nothing.
- **Password gate (removed 2026-11-12, §14.5).** `middleware.ts` put a password on every request,
  static files and the function included, the same way the JAPN trainer
  does: a login form, a 30-day cookie, and HTTP 503 until `SITE_PASSWORD`
  is set in the Vercel dashboard. Two reasons it can't be skipped: the
  function is a Songsterr download proxy, and Andrew's permission covers
  his own use, not the internet's.
- **The password is set by Andrew in the Vercel dashboard**, never in a
  command here, so it never lands in a transcript.

### §14.2 GitHub

New private repo `woodshed` on Andrew's account. Pushed: the code, the plan
and the tests. Not pushed: `library/` (Songsterr data and his tabs),
`node_modules/`, `dist/`, and alphaTab's copied fonts and sounds. All four
are in `.gitignore`. `.vercelignore` repeats them, so a CLI deploy doesn't
upload them either.

### §14.3 Checks

- `npm run build` and `npm run preview` behave like the hosted copy:
  browser library plus the Songsterr function, minus the gate. Add a link,
  open a text tab, reload the page, delete.
- Gate tests in Node: 503 with no password, the login form for a page,
  401 for a file or the function, wrong password refused, right password
  sets the cookie and lets requests through.
- After deploy: the live URL answers 503 before the password exists. Once
  Andrew sets it and the site is redeployed, his login works and a
  Songsterr link imports. That last one also answers whether Songsterr
  serves Vercel's servers at all, which can't be known before trying.

### §14.4 Results (2026-11-11, part done)

**Live:** https://woodshed-black.vercel.app (Vercel project
`andrews-projects-ae4b872b/woodshed`). Built in 20 s: the static app, the
`api/songsterr` function (1.1 MB) and the gate middleware.

Checked:

- Before any password exists, every path answers 503 "Site password not
  configured": the page, the scripts, the sound file, the function (GET and
  POST), and a made-up `library/` path.
- Gate tests: 26 of 26 in Node (`npm run test:gate`).
- The hosted build, served by `npm run preview` on port 5184 (launch
  config `woodshed-hosted`): starts empty; a Songsterr link imported
  Earrings through the same function code (13 tracks, opens on the lead
  guitar); a four-string text tab uploaded and was classed as bass; both
  survived a page reload; Earrings played (clock 0:02 to 0:04 in 2 s).
- A copy holding only the committed files: `npm ci`, `tsc`, build and tests
  all pass (four library-dependent tests skip).

Found and fixed before the push: `.gitignore` had `library/`, which also
matched `src/library/`. The repo would have shipped without the library
page and the Vercel build would have failed. Ignore rules are now anchored
(`/library/`). Same mistake as the Vite watcher in §13.5.

`vercel link` wrote `.env.local` with a Vercel token. It is git-ignored and
in `.vercelignore`.

Waiting on Andrew:

1. **Set `SITE_PASSWORD`** in the Vercel dashboard (project woodshed,
   Settings, Environment Variables, Production), then redeploy. Until then
   the site shows the 503.
2. **Sign in to GitHub** in the built-in browser so the private repo can be
   created and pushed. Two commits are ready locally.

Answered 2026-11-12 in §14.5: Songsterr answers requests from Vercel's
servers.


### §14.5 Gate removed, repo pushed (2026-11-12)

Andrew asked for the password to go and for the code on
`https://github.com/AndrewOxenberg/Woodshed`.

- `middleware.ts`, its 26 tests (`tools/test_middleware.mjs`) and the
  `test:gate` script are deleted. The site and `/api/songsterr` now answer
  anyone with the address.
- What that changes, as §14.1 warned: anyone who finds the URL can use the
  function to pull tabs from Songsterr through Vercel, and Andrew's
  Songsterr permission (§11.2) was for his own use. His call; recorded so
  it is a known state, not an accident. If it needs closing again, the
  smallest fix is a gate on `/api/songsterr` only.
- Kept: the `X-Robots-Tag: noindex, nofollow` header in `vercel.json`, so
  search engines still don't list it.
- The repo holds the code, plan, tests and README. Not pushed, by
  `.gitignore`: `library/` (Songsterr data and his tabs), `.env.local`
  (Vercel token), `node_modules/`, `dist/`, alphaTab's copied fonts and
  sounds.

Checked after the deploy (commit fdb5f59):

- The pushed `main` on GitHub is the local HEAD; `git ls-files` holds none
  of the ignored paths.
- `https://woodshed-black.vercel.app/` answers 200 with the app, the
  sound font answers 200 (1.35 MB), and `/api/songsterr` answers 400
  "Paste a Songsterr link." to an empty request, with no password.
- **Songsterr does serve Vercel's servers**, the question §14.4 left open:
  the Earrings link imported through the live site with all 13 tracks and
  opened in the player, with the phase 2a View and Help buttons present.

---

## §15 Phase 2, first slice: views and tracks (2026-11-12)

Phase 2 (§7) is too big for one sitting, so it is cut in three. This slice is
the part alphaTab already knows how to draw. Written before the code.

| Slice | What | State |
|---|---|---|
| 2a | Tab / sheet / both views, drum notation, several tracks at once, the three display settings, help panel | built and checked, §15.6 |
| 2b | Chords view: lyrics with chords, capo, simplify, diagrams, autoscroll, print. Detect chords | built and checked, §16.6 |
| 2c | Bar menu, AI track autoswitch, rearrange buttons | built and checked, §17.5 |

### §15.1 Notation view

A **View** button in the toolbar opens a panel with three choices: Tab,
Sheet, Both. Saved in prefs, so it carries across songs.

- Tab = alphaTab `StaveProfile.Tab`, Sheet = `Score`, Both = `ScoreTab`.
- With Both, the rhythm stems under the tab go away (`TabRhythmMode.Automatic`),
  because the sheet staff above already shows the rhythm.
- Drum tracks: measured in §15.6. alphaTab draws drums as standard drum
  notation; whether the Tab choice shows anything for them decides whether
  Songsterr's "drum notation" switch (Alt+L) needs its own control.
- Print and Guitar Pro download follow the view on screen.

### §15.2 Several tracks at once

Each row in the Tracks panel gets a **Show** switch. The track picked by
name is still the lead: it is the one the lead volume, mute key and bass
filter act on. Shown tracks stack under each other in file order.

- Saved per song, next to the last track.
- Switching the lead keeps the others shown.
- The loop highlight, handles, cursor keys and follow scrolling work on
  whole lines, so they should not care how many staves a line has. To be
  checked, not assumed.

### §15.3 Display settings

| Setting | alphaTab | Default |
|---|---|---|
| Combine empty bars (Songsterr: "Show multirest") | `stylesheet.multiTrackMultiBarRest` and `perTrackMultiBarRest` | off |
| Show dynamics | `NotationElement.EffectDynamics` | on |
| Show rhythm under the tab | `TabRhythmMode` shown or hidden | on |

The third is my reading of Songsterr's "Show beat marks". Its settings page
does not say what a beat mark is and §1 did not open it, so this is the
nearest thing alphaTab has, named for what it does.

Transpose rebuilds the score from JSON, so the multirest flags have to be
put back on every rebuild.

### §15.4 Help

A **Help** panel (Ctrl+K, as on Songsterr) holds the shortcut list, which
moves out of Settings, plus a short "how to" for loop, speed and transpose.

### §15.5 Checks

- Sheet view shows no tab lines; Both shows a five-line staff over the tab
  on every line; Tab is as before.
- The cursor, click-to-seek, loop handles and follow scrolling work in all
  three views and with three tracks shown.
- A drum track draws drum notation.
- Multirest on: a run of empty bars becomes one bar with a count, and the
  bar numbers after it are still right. Loop and the bar readout still land
  on the right bar.
- Dynamics off removes every dynamic mark and nothing else.
- Transpose +2 with multirest on keeps the multirests.
- Phone width: no sideways page scroll with Both and two tracks.
- `npx tsc` clean, `npm test` green, `npm run build` succeeds.

### §15.6 Results (2026-11-12)

Built and checked in the browser on Earrings (13 tracks). `npx tsc` clean,
`npm test` 21 passing, `npm run build` succeeds. Not committed, not deployed.

Views, lead guitar, 1024 px window:

| View | Lines | Staves per line | Staff heights |
|---|---|---|---|
| Tab | 11 | 1 | 65 px |
| Sheet | 13 | 1 | 36 px |
| Both | 15 | 2 | 36 + 65 px |

- With Both, the stems under the tab go away by themselves. Hammer-on and
  pull-off letters are drawn on both staves; that is alphaTab's choice.
- **Drums need no switch.** A drum track draws drum notation in every view,
  Tab included, so Songsterr's Alt+L has nothing to do here. Left out.
- Three tracks shown (lead guitar, rhythm guitar, drums) in Both: five
  staves a line, 29 lines, all 50 bars drawn. The loop highlight covered
  the full height of each line it touched (563 and 577 px, matching the
  lines). Seek, beat step, line step and handle hit-testing landed on the
  right bars.
- Playing with three tracks shown: the cursor spans all five staves and the
  current line stayed 16 px from the top through four line changes.
- Making the bass the lead kept the other two shown, and the song's saved
  settings held `also: [2, 12]`.
- Phone width (375 px), Both, three tracks: one bar a line, no sideways
  page scroll.
- Ctrl+K opens Help. The **?** button sits in the top bar, not the toolbar,
  so the toolbar did not grow.

Display settings:

| Setting | Result |
|---|---|
| Combine empty bars | 50 drawn bars became 22 on the lead guitar. Off again: 50 |
| Same, after transpose +2 | still 22, and the bass kept its bass clef |
| Show dynamics off | two marks gone (510 drawn elements to 508), back on: 510 |
| Show rhythm off | a line of tab went from 126 to 101 px tall |

Two things the checks turned up, both fixed:

1. **Bars inside a multirest have no place on the page.** alphaTab gives
   bounds only to the bars it draws, so a loop set on bars 4 to 7 drew no
   highlight, and follow scrolling and the line keys did nothing there.
   `Engine.drawnBar()` now answers with the multirest that covers a bar.
   Checked: the loop on bars 4 to 7 highlights the multirest it sits in
   while the playback range is still exactly those four bars, and the
   down-arrow from bar 5 goes to bar 18 on the next line.
2. **Sheet view was at the wrong octave with the wrong clefs.** Songsterr's
   data has no clefs, so every staff came out treble at sounding pitch,
   drums included. On load the engine now gives drums the percussion clef,
   writes guitars and basses (General MIDI sounds 24 to 39) an octave up as
   is standard, and gives a bass the bass clef. Voices and keyboards are
   left alone; Songsterr gives those tracks a guitar tuning too, which is
   why the rule goes by sound and not by tuning. Uploaded files that carry
   their own clefs are not touched. Playback and the tab are unchanged.

Not checked, or known gaps:

- Not listened to, and only Chromium.
- Print and Guitar Pro download in Sheet or Both view were not opened.
- Sheet view shows no key signature on songs whose Songsterr data has none
  (Earrings is spelled in sharps).
- "Show rhythm under the tab" is still a guess at Songsterr's "beat marks"
  (§15.3).
- The view is one setting for the whole app, not part of the address, so a
  link cannot open a song in sheet view.
- Only Earrings went through these checks. A song with real multi-voice
  bars or uploaded Guitar Pro clefs has not been looked at in Sheet view.

---

## §16 Phase 2, second slice: chords view and detect chords (2026-11-13)

Written before the code, after opening Songsterr's Chords view on Come As
You Are in the browser.

### §16.1 What Songsterr does (measured 2026-11-13)

- **The Chords view is not drawn from the tab.** It is a separate,
  hand-written sheet in ChordPro text with its own revision number.
  `/api/chords/{songId}` names it, and it is served from
  `https://chordpro1.songsterr.com/{songId}/{chordsRevisionId}/{chordpro}.chordpro`
  (gzip, so a plain `curl` shows bytes; `fetch` unpacks it).
- Come As You Are's sheet is `{tuning: Eb}`, then `{section: Verse}` lines
  and chords inside the words: `C[F#m]ome as you [E]are`. Its chords are
  F♯m, E, A, B and D. The tab's own chord names for the same song are D5,
  G, Esus4, Em, A5, C and E7sus4, so the two do not agree.
- Only 1 of the 6 saved songs has a sheet (`hasChords` in `meta.json`).
  `/api/chords/1576708` (Earrings) answers 404.
- Lyrics are rarer still: 2 of the 6 songs (Come As You Are, Tennessee
  Whiskey) have a track with words. Songsterr's raw lyric text keeps its line
  breaks, but alphaTab's Guitar Pro reader and writer keep only the
  syllable on each beat, so `score.gp` has no line breaks.
- Chord names in the tabs: 4 of the 6 songs, on one or two guitar tracks,
  only where the chord changes. Songsterr's chord data is a name and a
  width, no fingering.
- Controls: a Capo on/off switch above the sheet. A bottom panel with
  autoscroll speed (S, shows "100%"), Show diagrams, Simplify ("No chords
  to simplify" on this song), Transpose (K), Start autoscroll (Space) and
  Print (P, locked to Plus).
- Its code shows an automatic capo ("No capo position can be found for
  this song" when it fails) and a fingering generator with costs for fret
  height, span, fingers, muted strings, open strings and barres, plus a
  "cycle the fingering" key.

### §16.2 Where the sheet comes from

1. **Songsterr's sheet**, when the song has one. The importer saves it as
   `chords.chordpro` next to `score.gp`. A song saved before this slice
   picks it up the next time its link is imported: one extra request, the
   tab is not fetched again. The hosted function sends it back with the
   Guitar Pro file and the browser library keeps it with the song.
2. **Built from the tab**, when there is no sheet, and as a second choice
   when there is:
   - Words from the track with the most lyric syllables. Chords from the
     track with the most chord names. Both are placed by time, so a chord
     sits on the syllable that is sung when the chord starts.
   - A line of words ends where the singer rests for a half note or more,
     at a section marker, or past about 48 characters.
   - Bars with no words become a chord chart: one cell per bar, four bars a
     line, under the tab's section names.
   - When no track has chord names, the chords come from Detect chords
     (§16.4), run on the guitar or keys track with the most beats of two or
     more notes.
   - A sheet built from the tab knows when every chord starts, so during
     playback the current chord lights up and the page follows it.
     Songsterr's sheet has no timing; it gets autoscroll instead.

### §16.3 The chords view

- The View panel gets a fourth choice, **Chords**. The tab is hidden; the
  transport stays, so play, speed and loop work as before.
- A bar above the sheet holds Source (only when both kinds exist), Capo,
  Simplify, Diagrams and Autoscroll.
- **Transpose** (K) renames every chord, with the §3.4 spelling rule. A
  sheet built from the tab reads the already transposed score.
- **Capo**: Off, Auto, or fret 1 to 9. With a capo, the names are the
  shapes you play: the sounding chord moved down by the fret. Auto picks
  the fret from 0 to 7 that turns the most chord changes into open shapes,
  the lower fret on a tie, and says so when no fret beats no capo. A
  sheet's own `{capo: N}` starts the capo at N and reads its chords as
  shapes; no real sheet with one has been seen yet.
- **Simplify**: every chord to its triad. 7, maj7, 9, add9, 6 and sus go
  to major; m7, m9, madd9 and m6 to minor; slash basses are dropped; 5, dim
  and aug stay. Says so when there is nothing to simplify.
- **Diagrams**: one diagram per chord, in order of first use, for standard
  tuning (a sheet with a tuning line names its chords as standard-tuning
  shapes). Fingerings come from a search over every shape within four
  frets, scored on height, span, fingers, muted strings, open strings and
  barres, like Songsterr's generator. They must come out as the shapes
  every guitarist knows: C x32010, G 320003, D xx0232, A x02220,
  E 022100, Am x02210, Em 022000, Dm xx0231, F 133211, B7 x21202,
  Bm x24432.
- **Autoscroll**: start and stop, speed 25% to 300%, stops at the end.
- **Print**: the sheet in black on white, through the browser's print
  dialog.

### §16.4 Detect chords

- A switch in the View panel. On: green chord names above the tab of the
  lead track, at the bars where it names none of its own. Worked out again
  after a transpose.
- How: one chord per bar, or one per half bar when the halves name
  different chords. Notes are weighted by how long they sound. The chord is
  the template (major, minor, 5, sus2, sus4, dim, aug, 6, m6, 7, maj7, m7,
  m7♭5, dim7, 7sus4, add9, madd9, 9) that covers the most sound with the
  least left over, preferring the lowest note as the root and naming any
  other bass note as a slash chord. Fewer than two different notes: no
  name. Spelled with the §3.4 rule.
- Own code instead of tonal.js (§5). tonal's `Chord.detect` takes a bare
  set of notes, with no weights and no bass, and returns names such as
  "CM", so it would need the same wrapping. A small matcher with tests is
  less to depend on.
- Check: run it on the tracks that already carry hand-written names
  (Tennessee Whiskey, Earrings, Fly Love, Come As You Are) and count the
  bars where it agrees.

### §16.5 Checks

- Come As You Are in Chords view shows Songsterr's sheet: tuning line,
  sections, chords over the right syllables. Source can switch to the sheet
  built from the tab.
- Tennessee Whiskey: words with chords from the tab. Compare the guessed
  line breaks with the real ones in Songsterr's raw lyrics.
- Earrings (no words): a chord chart under its section names.
- Sprinter (no chord names anywhere): a chart from detected chords.
- Transpose +2 renames every chord in both sources; capo 2 then shows the
  original shapes again. Auto capo on a song in E♭ or B♭ picks a fret.
- Simplify turns E♭madd9 into E♭m. Diagrams match the shapes in §16.3.
- During playback, the current chord lights up and the page follows.
- Autoscroll moves and stops at the end. Print shows only the sheet.
- Detect chords: green names above the tab, gone when switched off,
  agreement counts recorded.
- Phone width: no sideways scroll. `npx tsc`, `npm test`, `npm run build`.

### §16.6 Results (2026-11-13)

Built and checked in the browser (Chromium) on Come As You Are, Tennessee
Whiskey, Earrings and Sprinter, and through the hosted build
(`npm run build` + preview). `npx tsc` clean, `npm test` 33 passing,
`npm run build` succeeds. Not committed, not deployed.

What changed from the design while building:

1. **The real line breaks travel with the song.** Guessing lines from rests
   and length found only 23% (Tennessee Whiskey) and 13% (Come As You Are)
   of the real ones. `score.gp` keeps one syllable per beat in exactly the
   order of Songsterr's text (353 and 232 syllables, checked one by one), so
   the importer reads the line breaks from the raw text
   (`tools/songsterr/lyrics.mjs`, same states as alphaTab's lyric reader)
   and sends them along: `GET /api/library/<id>/extras` locally, `extras`
   in the hosted function's reply, an `extras` store in the browser library
   (IndexedDB version 2). Result: **100%** of the real lines in both songs
   (26 of 26, 38 of 38); the few extra breaks fall on the tab's section
   markers. Uploaded files have no such data and still guess, now also at
   capital letters: 69% and 61%.
2. **Detection uses sounding pitch, not tuned-down shapes.** Come As You
   Are's hand-written names (Em, D5 on a guitar tuned a whole step down)
   are sounding names; reading notes as shapes matched 0 of them.
3. **Detection splits down to quarter bars**, but only where both halves are
   struck chords of three or more notes, and not between two voicings of
   one harmony (B♭m7 and D♭/A♭). Without those rules a riff spelled a new
   "chord" every beat (Come As You Are: 209 changes for 12 written names).
   Spelling is a vote of every detected chord, not the first one (Sprinter
   came out D♯m, A♯m, C♯6; now E♭m, B♭m, D♭6).
4. **Sparse names are filled in.** Songsterr names a riff once and leaves
   the rest (Come As You Are: 12 names in 112 bars). When a track's own names
   cover under half the bars it plays, detection fills the other bars. In
   the chords view, detected names are green, like on the tab.

Detection against the hand-written names, at each written name:

| Song, track | Written | Same name | Same triad | Changes found |
|---|---|---|---|---|
| Tennessee Whiskey, rhythm guitar | 94 | 95% | 95% | 57 |
| Earrings, rhythm guitar | 27 | 67% | 100% | 27 |
| Come As You Are, chorus guitar | 12 | 75% | 100% | 107 (riff, Em/D5 a bar) |
| Fly Love, track 1 | 5 | 100% | 100% | 90 (jazz voicings) |

Earrings' 67% is E♭madd9 against E♭m9: the bar holds E♭ G♭ D♭ F, so the
detected name is the closer one. Two floors are now tests (Tennessee
Whiskey 90%, Earrings 95% same triad).

Checked in the browser:

- Come As You Are: Songsterr's sheet with its tuning line, sections and
  chords over the right syllables; "From the tab" shows the real lyric
  lines with Em/D5 filled in green.
- Playback: the current chord lights up (bar 4 lit D5) and the page follows:
  by bar 17 it had scrolled 400 px with the lit chord 374 px down a 615 px
  window. Clicking a chord moves the cursor there.
- Transpose +2: the tab sheet went Em→F♯m, D5→E5; Songsterr's sheet
  F♯m→G♯m, E→F♯. Capo 2 then showed F♯m E A B D again. Auto capo at the
  original key chose fret 2: Em D G A C, all open shapes.
- Diagrams match all eleven shapes in §16.3 (also a test). Bm draws as the
  x24432 barre; shapes up the neck show their fret on the left.
- Tennessee Whiskey: words with A, Bm, D. Earrings: a four-bar chart under
  its section names; Simplify turns E♭madd9 into E♭m. Sprinter: whole chart
  detected, 23 different chords, each with a diagram.
- Autoscroll: about 25 px a second at 100%, stops on Stop and by itself at
  the end of the page.
- Detect chords on the tab: 81 green names on Sprinter, re-detected after
  transpose +2 (E♭m F7 B♭m → Fm G7 Cm). Off again: no names or styles left.
  A Guitar Pro download made with it on holds none of them.
- Phone width (375 px): no sideways scroll; long lines wrap at chords.
- Hosted build: importing Come As You Are stored the sheet and 37 line
  starts in the browser; the chords view offered both sheets.

Not checked, or known gaps:

- **Green spreads to other marks on the same beat.** alphaTab colours all
  of a beat's marks above the staff together, so a tempo mark or a dynamic
  on a beat that gets a detected name turns green too (bar 1 of Sprinter).
- The print dialog was not opened; only the print stylesheet is written.
- Not listened to; Chromium only.
- Detection is busy on arpeggiated and jazz parts (Fly Love: 90 changes in
  74 bars) and names the chord each voicing spells, not the chord the
  written names imply over several bars.
- One fingering per chord, standard tuning only; Songsterr can cycle
  through fingerings.
- A sheet's own `{capo: N}` is handled but no real sheet with one was seen.
- Sheets disagree with tabs in Songsterr's own data: Come As You Are's sheet
  says tuning E♭ with F♯m and E, its tab is tuned to D with Em and D5.
- Chord names are shown as the tab writes them (Earrings has one A♯ among
  its B♭s).

---

## §17 Phase 2, third slice: bar menu, track autoswitch, rearrange (2026-11-13)

Written before the code. Songsterr's code (read 2026-11-13) generates the
switch points itself (`partSwitching/generate`), has an on/off setting
(`aiTrackAutoswitch`), and saves per-bar corrections ("markers") to the
account. Woodshed keeps the corrections in this browser.

### §17.1 Bar menu

- A small ⋮ button sits at the bottom right of the bar under the pointer,
  and of the bar the cursor is in (so touch screens have one too).
- It opens a menu for that bar: **Loop this bar**, **Play from here**, and,
  when the song has another track of the same kind, **In this bar show**:
  Automatic, the picked track, or any other guitar (bass, keys) track.
- Edit this bar waits for the editor (phase 4).

### §17.2 Track autoswitch

- A switch in the Tracks panel: **Follow the part across tracks**. Off by
  default.
- A song's part is often split over several tracks (clean and distorted
  guitar). With the switch on, during playback, when the picked track rests
  for a whole bar and another track of the same kind plays in it, the page
  shows that track for those bars, then goes back.
- "Same kind": guitars (General MIDI 24 to 31) with guitars, basses (32 to
  39) with basses, other pitched sounds with each other; never drums.
- Which one: the track already showing if it plays; else the one that
  plays the most notes in that bar.
- The bar menu's choice for a bar wins over the automatic one. Kept per
  song in this browser.
- The picked track stays the one saved for the song and in the address;
  only the page follows the part. The lead volume follows the track shown,
  since it is the same part.
- The switch is drawn a beat early, so the new track is on screen when its
  bar starts. alphaTab redraws the whole page on a switch: to be measured.

### §17.3 Rearrange buttons

- Settings gets **Rearrange buttons**: the toolbar's buttons in a list,
  each with move-up and move-down buttons (and drag on a mouse). Saved in
  this browser. **Reset** puts them back.

### §17.4 Checks

- The ⋮ button follows the pointer; Loop this bar loops exactly that bar;
  Play from here starts at its first beat.
- On a song with a split part, playing with autoswitch on shows the other
  track in the bars where the picked one rests and comes back after;
  switching costs measured; per-bar choice from the menu respected and
  remembered after a reload.
- Rearranged buttons keep their order after a reload; Reset works;
  keyboard-only reordering works.
- `npx tsc`, `npm test`, `npm run build`.

### §17.5 Results (2026-11-13)

Built and checked in the browser on Earrings (Lead Guitar picked, Rhythm
Guitar the other guitar). `npx tsc` clean, `npm test` 34 passing,
`npm run build` succeeds. Not committed, not deployed.

- **Bar menu.** The ⋮ sits just under the staff at the right end of the bar
  under the pointer, or the cursor's bar. First version chased the pointer:
  moving toward the button crossed into the next bar and the button moved
  away, so the click landed on the tab. Fixed: the bar holds still while
  the pointer is on the button or menu. Loop this bar looped exactly bar 15
  (`{startBar: 15, endBar: 15}`). Near the bottom of the window the menu
  opens upward; Escape and a click outside close it.
- **Autoswitch.** Planned run for Earrings: Rhythm Guitar in bars 1–16,
  37–40 and 45–48 (where Lead Guitar rests), Lead Guitar elsewhere. Played
  with it on: switched to Rhythm Guitar at the last beat of the pickup bar
  and back to Lead Guitar at tick 2904 of bar 16 (the last beat), so each
  new track was on the page before its bar. **A switch redraws the page in
  43 to 69 ms** (four switches measured), during playback without a stutter
  in the cursor. The picked track and the address stayed on Lead Guitar
  throughout.
- **Per-bar choice.** "In this bar show: Rhythm Guitar" on bar 20 (where the
  lead plays) switched for exactly that bar: to Rhythm at the last beat of
  bar 19, back at the last beat of bar 20. Saved per song (`switches:
  {"20": 2}`) and still applied after a reload.
- **Rearrange buttons.** Moving with the arrow buttons reorders the toolbar
  at once and survives a reload. With the keyboard alone, two Enter presses
  on "Move Print earlier" moved it two places, so focus stays with the
  button as its row moves. Reset puts back the default order. The Space
  between the two groups is in the list as its own row.

Not checked, or known gaps:

- Drag to reorder is written but was not tried with a real mouse drag.
- Not listened to. A switch changes which track gets the lead volume, as
  designed, so with backing turned down the sound follows the part.
- Autoswitch acts only while playing. Moving the cursor by hand while
  paused leaves the page on whatever track it shows.
- Only Earrings has been tried; Come As You Are has four guitar tracks and
  would be the harder case.

---

## §18 Phase 3, first slice: play along with the YouTube recording (2026-11-13)

Written before the code. Phase 3 (§7) is cut in two: **3a** plays the
song's YouTube videos in step with the tab, using the sync points Songsterr
already has; **3b** is uploaded audio (any speed, pitch shift), tap-along
sync for songs without points, and stems.

### §18.1 What is already saved

Every Songsterr import keeps `video-points.json` (§11). Measured on the six
saved songs: 3 to 70 videos a song, each with a YouTube id, a `feature`
(none = the original full mix, `backing`, `solo`, `playthrough`,
`alternative` = another upload of the full mix), for backing tracks the
tracks left out (`tracks: [3]` = without track 3), and `points`: the time in
seconds at which each bar starts, in playing order. Earrings: pickup at
0.14 s, bar 1 at 1.63 s, then 3.0 s a bar at 80 BPM. Most videos have one
point per bar played; a few have one or two more or fewer (Earrings 52 for
50 bars, Come As You Are 107 to 113 for 112). Only the first points that
match bars are used; a video with fewer simply ends early.

### §18.2 How it plays

- alphaTab 1.9's external-media mode (`PlayerMode.EnabledExternalMedia`):
  the video is the clock. Woodshed gives alphaTab a handler (play, pause,
  seek, rate, volume, duration) wrapping the YouTube IFrame API, reports the
  video's time every 50 ms (`updatePosition`), and turns each point into a
  sync point (bar, which pass through it, milliseconds).
- Sync points are applied again after every new score (transpose rebuilds
  it), from the bar order the player itself uses.
- The video plays in a small box above the transport, bottom left
  (Songsterr puts it in a corner too), from youtube-nocookie.com. Its own
  play button, pause and scrub keep the tab in step.

### §18.3 Controls

- A **Recording** button in the toolbar (shortcut V switches between the
  synth and the last video, as on Songsterr) opens a panel: Synth, Full
  mix, each backing track ("Backing, without Bass"), Solo, Playthrough, and
  up to three other uploads of the full mix in case one is blocked. Saved
  per song.
- **Speed** with a video: only YouTube's rates (§4.2), so the speed snaps to
  25, 50, 75, 100, 125, 150 or 175%. The panel says so.
- **Shift the sound**, the mixer, count-in and metronome do nothing to a
  video; their controls say so instead of failing silently.
- Loop works: alphaTab seeks the video back at the loop end.
- The hosted copy gets the points through the song's extras (§16.2), so it
  works there too.

### §18.4 Checks

- Earrings, full mix: the cursor is on the bar the recording plays (check
  the bar readout at several times against the points); pause, seek by
  clicking a bar, and the video's own controls all keep step.
- A backing video and a loop of two bars.
- Speed 50% snaps and plays at half speed; transpose keeps sync.
- Back to Synth: the synth plays again with mixer and count-in.
- Hosted build: a newly imported song has its videos.
- `npx tsc`, `npm test`, `npm run build`.

### §18.5 Results (2026-11-13)

Built and checked in the browser on Earrings with its full-mix video, and
through the hosted build. `npx tsc` clean, `npm test` 34 passing,
`npm run build` succeeds. Not committed, not deployed.

- **In step with the recording.** Sampled while playing, the video's time
  and the tab's position against Songsterr's points:

  | Video time | Bar the points give | Bar on the tab | Into the bar: video / tab |
  |---|---|---|---|
  | 7.04 s | 2 | 2 | 2.41 / 2.40 s |
  | 14.05 s | 5 | 5 | 0.42 / 0.40 s |
  | 21.06 s | 7 | 7 | 1.42 / 1.40 s |
  | 31.57 s (after transpose +2) | 10 | 10 | 2.93 / 2.80 s |

- Pause stops the video. Moving the cursor to bar 20 while paused moved the
  video to 58.75 s and left it paused. The video's own play and pause (its
  events) start and stop the tab.
- Speed 50% plays the video at 0.5; one step up from there is 75%, one down
  from 74% is 50%.
- Loop on bars 4 and 5: after bar 5 the video jumped back to 11.5 s and the
  tab to bar 4, three times running.
- Transpose rebuilds the score; the sync points went back on by themselves
  (last row above).
- V switches between the synth and the last recording. **Found and fixed:**
  a click on the video moved keyboard focus into YouTube's frame, where V,
  Space and every other shortcut stopped reaching the page. The page now
  takes focus back (YouTube's own keys are off), and V worked after a click
  on the video.
- Back on the synth the player is the synthesizer again (mode 2) and
  count-in, metronome and the mixer apply.
- The Recording panel lists Synth, Full mix, each backing track by what it
  leaves out ("Backing, without Bass Guitar"), solo and playthrough videos
  when there are any, and up to three other uploads.
- Hosted build: re-importing Earrings stored its 17 recordings with the
  song, and the Recording button appeared.

Not checked, or known gaps:

- The automated browser shows YouTube's frame as black and does not pass
  clicks into it, so the video was never watched and its on-screen buttons
  were not clicked; its play and pause events were raised through the API.
- Not listened to.
- Sync was sampled at four moments on one video of one song. Videos whose
  point count differs from the bars played (Come As You Are, 107 to 113 for
  112 bars) were not tried; past the last point the tab cannot follow.
- Songs already saved in a browser before this slice have no recordings
  there until their link is imported again.
- YouTube keeps its own volume; the master volume slider sets it, but the
  per-track sliders cannot reach inside a video.
- 3b (uploaded audio with any speed and pitch, tap-along sync, stems) is
  not started.

---

## §19 Fixes from Andrew's report (2026-11-13)

What he saw, what caused it, what changed. Checked in the browser after.

### §19.1 Blank page on the way back to the library

- Cause: with a recording loaded, leaving the song removed the video's box,
  then YouTube's own clean-up threw ("Failed to execute 'removeChild'"). An
  error in a clean-up takes down the whole React tree, so the page went
  blank. Reproduced before the fix.
- Fix: the video's clean-up can no longer throw, and the engine ignores the
  recording calls that arrive after the page has closed.
- Checked: back to the library from bake shop with its video loaded, then
  into Earrings and back again: library shown both times, no errors.

### §19.2 "Cannot read properties of undefined (reading 'staves')"

- Cause: alphaTab's Tab profile draws tab staves only. A drum track has no
  tab, so a drum track alone on the page left alphaTab nothing to draw and it
  crashed. Every song's drum track did it (Earrings and bake shop tried).
  §15.6 had only drawn drums next to a guitar. The error then stuck until a
  reload, because a later good drawing never cleared it.
- Fix: every view now draws with all staff types allowed, and each staff
  says what it shows: drums always drum notation; fretted tracks tab (Tab),
  notation (Sheet) or both (Both); anything without strings notation. A
  finished drawing clears an earlier drawing error.
- Checked on bake shop: drums alone in Tab and Both draw (45 lines); guitar
  in Tab shows tab only, in Both two staves a line, in Sheet notation only;
  guitar to drums and back with no error.

### §19.3 Opening track: the most popular one, never drums by accident

- A Songsterr song opens on the track the link names (a track number, or a
  bass or drum link), else Songsterr's most played guitar track, else its
  most played track if that isn't drums, else the first guitar, else the
  first track that isn't drums. Uploaded files: first guitar, else first
  non-drum track.
- The track used last is still remembered, except a drum track: from the
  library a song opens on its default instead, unless the Drums filter is on.
- Checked: with Earrings remembering its drum track, the library opened it
  on Lead Guitar; bake shop opened on Rhythm Guitar. A test checks that no
  saved song defaults to drums.

### §19.4 The recording plays by default

- A song that was never set to Synth plays its YouTube full mix: the
  original upload, else the next upload of the full mix. When YouTube
  refuses one (blocked on other sites, removed), the next is tried, then
  the synth. Picking Synth in the Recording panel (or V) is remembered per
  song.
- bake shop had no sound because of §19.2: the page was showing the error,
  and the video is only loaded once the tab has drawn. Its full mix plays:
  YouTube playing, not muted, and the tab on the right bar (bars 2 and 4 at
  3.97 s and 7.97 s).

`npx tsc` clean, `npm test` 36 passing, `npm run build` succeeds.

### §19.5 Committed, pushed, deployed (2026-11-13)

Slices 2b, 2c, 3a and these fixes went to GitHub as one commit (`1e8de44`)
and to https://woodshed-black.vercel.app. Checked on the live site: the
Come As You Are link imported through Vercel with its chord sheet, lyric
lines and 70 recordings; the song opened on Rhythm Guitar with the full mix
loaded; its drum track drew; back to the library worked with no errors.
