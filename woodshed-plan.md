# Woodshed plan

A tab player and practice site that does everything Songsterr does, free and
paid, with nothing behind a paywall. This file is the running record. Sections
are numbered so code comments can cite them (`// §7.3`). Add a section before
building a feature, then record what was verified.

Last updated: 2026-11-10.

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
needs a look at YouTube's terms before it ships.

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
5. Check the npm package for a GP7 exporter and try a round trip.
6. `exportAudio()`: get PCM, write a WAV, play it back.
7. YouTube handler: list available playback rates and measure cursor drift
   over two minutes with sync points every 4 bars.
8. Check the default SoundFont's license and size.

---

## §9 Open questions for Andrew

1. Personal tool, or a public site other people sign up for? This decides
   whether phase 5 exists and how §4.1 plays out.
2. Do you have Guitar Pro or MusicXML files to start the library with?
3. Keep the name Woodshed?

---

## §10 Log

- 2026-11-10: Songsterr analyzed in the browser (free song, demo song, help
  center, Plus, teacher and new-tab pages). Plan written. No code yet.
