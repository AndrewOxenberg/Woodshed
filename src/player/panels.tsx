// The pop-up panels above the transport bar. Plan §3.2, §3.4, §3.5, §3.9, §3.10, §3.11.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { MAX_SPEED, MIN_SPEED, saveBytes, type Engine } from './engine.ts';
import { setPrefs, usePrefs, type Theme, type View } from '../prefs.ts';
import { IconClose } from '../ui/icons.tsx';

export type PanelName = 'speed' | 'transpose' | 'mixer' | 'view' | 'download' | 'print' | 'settings' | 'help';

export const VIEW_NAMES: Record<View, string> = { tab: 'Tab', sheet: 'Sheet', both: 'Both' };

const useEngine = (engine: Engine) => useSyncExternalStore(engine.subscribe, engine.getState);
const usePosition = (engine: Engine) => useSyncExternalStore(engine.subscribePosition, engine.getPosition);
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <section className="panel" role="dialog" aria-label={title} tabIndex={-1} ref={ref}>
      <header className="panel-head">
        <h2>{title}</h2>
        <button type="button" className="icon-btn" aria-label={`Close ${title}`} onClick={onClose}><IconClose /></button>
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function Stepper({ label, value, onDown, onUp, downLabel, upLabel }: {
  label: string; value: string; onDown: () => void; onUp: () => void; downLabel: string; upLabel: string;
}) {
  return (
    <div className="stepper">
      <span className="stepper-label">{label}</span>
      <div className="stepper-row">
        <button type="button" className="step" aria-label={downLabel} onClick={onDown}>−</button>
        <output className="stepper-value">{value}</output>
        <button type="button" className="step" aria-label={upLabel} onClick={onUp}>+</button>
      </div>
    </div>
  );
}

function SpeedPanel({ engine, onClose }: { engine: Engine; onClose: () => void }) {
  const state = useEngine(engine);
  const position = usePosition(engine);
  const pct = Math.round(state.speed * 100);
  const base = engine.baseBpm();
  const bpm = Math.round(position.bpm);
  return (
    <Panel title="Speed" onClose={onClose}>
      <div className="stepper-pair">
        <Stepper label="Speed" value={`${pct}%`} downLabel="Slower by 1%" upLabel="Faster by 1%"
          onDown={() => engine.setSpeed((pct - 1) / 100)} onUp={() => engine.setSpeed((pct + 1) / 100)} />
        <Stepper label="Tempo" value={`${bpm} bpm`} downLabel="Slower by 1 beat per minute" upLabel="Faster by 1 beat per minute"
          onDown={() => engine.setSpeed((bpm - 1) / base)} onUp={() => engine.setSpeed((bpm + 1) / base)} />
      </div>
      <input type="range" className="slider" aria-label="Speed, percent" min={MIN_SPEED * 100} max={MAX_SPEED * 100} step={1} value={pct}
        onChange={(e) => engine.setSpeed(Number(e.target.value) / 100)} />
      <div className="presets" role="group" aria-label="Speed presets">
        {[25, 50, 60, 70, 80, 90, 100, 125, 150].map((p) => (
          <button type="button" key={p} className="chip" aria-pressed={pct === p} onClick={() => engine.setSpeed(p / 100)}>{p}%</button>
        ))}
      </div>
      <p className="hint">The song is written at {Math.round(base)} bpm here. Pitch stays the same at any speed.</p>
    </Panel>
  );
}

function TransposePanel({ engine, onClose }: { engine: Engine; onClose: () => void }) {
  const state = useEngine(engine);
  const { transpose: n, pitchShift: p } = state;
  return (
    <Panel title="Transpose" onClose={onClose}>
      <Stepper label="Move the tab" value={n === 0 ? 'Original key' : `${signed(n)} ${Math.abs(n) === 1 ? 'semitone' : 'semitones'}`}
        downLabel="Down one semitone" upLabel="Up one semitone"
        onDown={() => engine.setTranspose(n - 1)} onUp={() => engine.setTranspose(n + 1)} />
      <p className="hint">Rewrites every fret and chord name. Arrow keys work while this is open.</p>
      {(state.transposeMoved > 0 || state.transposeRaised > 0) && (
        <p className="note" role="status">
          {state.transposeMoved > 0 && `${plural(state.transposeMoved, 'note', 'notes')} moved to another string. `}
          {state.transposeRaised > 0 && `${plural(state.transposeRaised, 'note', 'notes')} ran off the fretboard and ${state.transposeRaised === 1 ? 'was' : 'were'} shifted an octave.`}
        </p>
      )}
      <button type="button" className="btn" disabled={n === 0} onClick={() => engine.setTranspose(0)}>Back to original key</button>

      <hr />
      <Stepper label="Shift the sound only" value={p === 0 ? 'As written' : `${signed(p)} ${Math.abs(p) === 1 ? 'semitone' : 'semitones'}`}
        downLabel="Sound one semitone lower" upLabel="Sound one semitone higher"
        onDown={() => engine.setPitchShift(p - 1)} onUp={() => engine.setPitchShift(p + 1)} />
      <p className="hint">The tab stays as written. Use it when the song is tuned down and your guitar isn't: for a song in E♭, shift +1.</p>
      <button type="button" className="btn" disabled={p === 0} onClick={() => engine.setPitchShift(0)}>Sound as written</button>
    </Panel>
  );
}

function MixerPanel({ engine, onClose, onPick }: { engine: Engine; onClose: () => void; onPick: (index: number) => void }) {
  const state = useEngine(engine);
  const lead = state.tracks[state.trackIndex];
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <Panel title="Tracks" onClose={onClose}>
      <label className="field">
        <span>Overall volume <output>{pct(state.masterVolume)}</output></span>
        <input type="range" className="slider" min={0} max={1} step={0.01} value={state.masterVolume}
          onChange={(e) => engine.setMasterVolume(Number(e.target.value))} />
      </label>
      <label className="field">
        <span>This track{lead ? `: ${lead.name}` : ''} <output>{pct(state.leadVolume)}</output></span>
        <input type="range" className="slider" min={0} max={1} step={0.01} value={state.leadVolume}
          onChange={(e) => { const v = Number(e.target.value); engine.setLeadVolume(v); setPrefs({ leadVolume: v }); }} />
      </label>
      {state.tracks.length > 1 && (
        <label className="field">
          <span>Backing: the other {plural(state.tracks.length - 1, 'track', 'tracks')} <output>{pct(state.backingVolume)}</output></span>
          <input type="range" className="slider" min={0} max={1} step={0.01} value={state.backingVolume}
            onChange={(e) => { const v = Number(e.target.value); engine.setBackingVolume(v); setPrefs({ backingVolume: v }); }} />
        </label>
      )}
      <hr />
      {state.tracks.length > 1 && <p className="hint">Pick a name to make it the lead track. Show draws another track under it.</p>}
      <ul className="tracks">
        {state.tracks.map((t) => {
          const shown = t.index === state.trackIndex;
          return (
            <li key={t.index} className={`track${shown ? ' is-shown' : ''}`}>
              <button type="button" className="track-pick" aria-pressed={shown} onClick={() => onPick(t.index)}>
                <span className="track-name">{t.name}</span>
                <span className="track-sub">{t.percussion ? 'Drums' : t.tuning}{shown ? ' · lead' : ''}</span>
              </button>
              <button type="button" className="toggle toggle-wide" aria-pressed={shown || state.also.includes(t.index)} disabled={shown}
                aria-label={`Show ${t.name} on the page`} title={shown ? 'This is the track on screen' : 'Show this track as well'}
                onClick={() => engine.setAlso(t.index, !state.also.includes(t.index))}>Show</button>
              <button type="button" className="toggle" aria-pressed={t.solo} aria-label={`Solo ${t.name}`} title="Solo" onClick={() => engine.setSolo(t.index, !t.solo)}>S</button>
              <button type="button" className="toggle" aria-pressed={t.mute} aria-label={`Mute ${t.name}`} title="Mute" onClick={() => engine.setMute(t.index, !t.mute)}>M</button>
              <input type="range" className="slider track-vol" aria-label={`${t.name} volume`} min={0} max={1} step={0.01} value={t.volume}
                onChange={(e) => engine.setVolume(t.index, Number(e.target.value))} />
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function DownloadPanel({ engine, onClose }: { engine: Engine; onClose: () => void }) {
  const state = useEngine(engine);
  const [error, setError] = useState<string | null>(null);
  const run = (make: () => Uint8Array | Promise<Uint8Array>, ext: string, type: string) => async () => {
    setError(null);
    try {
      saveBytes(await make(), engine.fileName(ext), type);
    } catch (e) {
      setError(`That download failed. ${(e as Error).message}`);
    }
  };
  const formats = [
    { name: 'Guitar Pro', ext: 'gp', hint: 'Every track, for Guitar Pro or MuseScore', make: () => engine.exportGuitarPro(), type: 'application/octet-stream' },
    { name: 'MIDI', ext: 'mid', hint: 'Notes only, for any music software', make: () => engine.exportMidi(), type: 'audio/midi' },
    { name: 'WAV', ext: 'wav', hint: 'Full-quality audio. Large file', make: () => engine.exportWav(), type: 'audio/wav' },
    { name: 'MP3', ext: 'mp3', hint: 'Smaller audio file', make: () => engine.exportMp3(), type: 'audio/mpeg' },
  ];
  return (
    <Panel title="Download" onClose={onClose}>
      <ul className="formats">
        {formats.map((f) => (
          <li key={f.ext}>
            <button type="button" className="format" disabled={!!state.busy} onClick={run(f.make, f.ext, f.type)}>
              <span className="format-name">{f.name}</span>
              <span className="format-hint">{f.hint}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="hint" role="status">{state.busy ?? 'Downloads use the current key. Audio uses the current mix: muted tracks stay out.'}</p>
      {error && <p className="note note-error" role="alert">{error}</p>}
    </Panel>
  );
}

function PrintPanel({ engine, onClose }: { engine: Engine; onClose: () => void }) {
  const prefs = usePrefs();
  const [error, setError] = useState<string | null>(null);
  const pct = Math.round(prefs.printScale * 100);
  const set = (v: number) => setPrefs({ printScale: Math.min(1.5, Math.max(0.5, v / 100)) });
  return (
    <Panel title="Print" onClose={onClose}>
      <Stepper label="Size on paper" value={`${pct}%`} downLabel="Smaller print" upLabel="Larger print" onDown={() => set(pct - 10)} onUp={() => set(pct + 10)} />
      <button type="button" className="btn btn-primary" onClick={() => {
        setError(null);
        try {
          engine.print(prefs.printScale);
        } catch {
          setError('The print view was blocked. Allow pop-ups for this page and try again.');
        }
      }}>Open print view</button>
      <p className="hint">Prints the track on screen in the current key, in black on white.</p>
      {error && <p className="note note-error" role="alert">{error}</p>}
    </Panel>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play or pause'], ['Backspace', 'Back to the loop start, or the top'], ['Double-click', 'Play from that beat'],
  ['← →', 'Move one beat'], ['↑ ↓', 'Move one line'], ['L', 'Loop on or off'], ['Shift + ← →', 'Move the loop end'],
  ['S', 'Speed'], ['K', 'Transpose'], ['T', 'Tracks'], ['Ctrl + Shift + ↑ ↓', 'Previous or next track'], ['Alt + Shift + 1–9', 'Jump to a track'],
  ['M', 'Mute this track'], ['Alt + M', 'Solo this track'], ['C', 'Count-in'], ['N', 'Metronome'], ['P', 'Print'], ['Ctrl + K', 'Help'], ['Esc', 'Close a panel'],
];

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const prefs = usePrefs();
  const themes: [Theme, string][] = [['device', 'Match device'], ['light', 'Light'], ['dark', 'Dark']];
  // The slider tops out at the window's width, rounded up to its 50 px step.
  const widest = Math.max(600, Math.ceil(window.innerWidth / 50) * 50);
  const width = Math.min(Math.max(500, prefs.pageWidth), widest);
  return (
    <Panel title="Settings" onClose={onClose}>
      <fieldset className="segmented">
        <legend>Appearance</legend>
        {themes.map(([value, label]) => (
          <label key={value}>
            <input type="radio" name="theme" checked={prefs.theme === value} onChange={() => setPrefs({ theme: value })} />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>

      <label className="field">
        <span>Tab size <output>{Math.round(prefs.scale * 100)}%</output></span>
        <input type="range" className="slider" min={70} max={150} step={5} value={Math.round(prefs.scale * 100)}
          onChange={(e) => setPrefs({ scale: Number(e.target.value) / 100 })} />
      </label>

      <label className="field">
        <span>Note spacing <output>{Math.round(prefs.spacing * 100)}%</output></span>
        <input type="range" className="slider" min={50} max={250} step={10} value={Math.round(prefs.spacing * 100)}
          onChange={(e) => setPrefs({ spacing: Number(e.target.value) / 100 })} />
      </label>
      <label className="field">
        <span>Page width <output>{width >= widest ? 'Full window' : `${width} px`}</output></span>
        <input type="range" className="slider" min={500} max={widest} step={50} value={width}
          onChange={(e) => setPrefs({ pageWidth: Number(e.target.value) })} />
      </label>
      <p className="hint">Spacing moves the notes apart. Width sets how much of the window the sheet may use.</p>

      <label className="check">
        <input type="checkbox" checked={prefs.fourBarsPerLine} onChange={(e) => setPrefs({ fourBarsPerLine: e.target.checked })} />
        <span>Four bars on every line</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={prefs.countInBetweenLoops} onChange={(e) => setPrefs({ countInBetweenLoops: e.target.checked })} />
        <span>Count in before every loop repeat</span>
      </label>

      <label className="field">
        <span>Sound delay <output>{prefs.latencyMs} ms</output></span>
        <input type="range" className="slider" min={0} max={1000} step={5} value={prefs.latencyMs}
          onChange={(e) => setPrefs({ latencyMs: Number(e.target.value) })} />
      </label>
      <p className="hint">Raise this if the sound arrives after the cursor, which is common with Bluetooth headphones. It holds the cursor back to match.</p>
    </Panel>
  );
}

function ViewPanel({ onClose }: { onClose: () => void }) {
  const prefs = usePrefs();
  const views: [View, string][] = [['tab', 'Tab'], ['sheet', 'Sheet'], ['both', 'Both']];
  return (
    <Panel title="View" onClose={onClose}>
      <fieldset className="segmented">
        <legend>Notation</legend>
        {views.map(([value, label]) => (
          <label key={value}>
            <input type="radio" name="view" checked={prefs.view === value} onChange={() => setPrefs({ view: value })} />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      <p className="hint">Tab shows fret numbers. Sheet shows standard notation. Both stacks them.</p>
      <label className="check">
        <input type="checkbox" checked={prefs.showRhythm} onChange={(e) => setPrefs({ showRhythm: e.target.checked })} />
        <span>Show rhythm under the tab</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={prefs.showDynamics} onChange={(e) => setPrefs({ showDynamics: e.target.checked })} />
        <span>Show dynamics (loud and soft marks)</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={prefs.multirest} onChange={(e) => setPrefs({ multirest: e.target.checked })} />
        <span>Combine runs of empty bars</span>
      </label>
    </Panel>
  );
}

function HelpPanel({ onClose }: { onClose: () => void }) {
  return (
    <Panel title="Help" onClose={onClose}>
      <dl className="howto">
        <div><dt>Loop a section</dt><dd>Put the cursor in a bar and press L. Drag the two handles, or hold Shift and press the arrow keys, to cover more bars.</dd></div>
        <div><dt>Slow it down</dt><dd>Press S and pick a speed. The pitch stays the same.</dd></div>
        <div><dt>Change key</dt><dd>Press K. "Move the tab" rewrites the frets. "Shift the sound" keeps the frets and changes what you hear.</dd></div>
        <div><dt>Hear less of the band</dt><dd>Press T. Turn the backing down, or use S and M on a track to solo or mute it.</dd></div>
        <div><dt>See sheet music or more tracks</dt><dd>View switches between tab and sheet. Show in the Tracks panel adds a track to the page.</dd></div>
      </dl>
      <hr />
      <div className="shortcuts">
        <h3>Keyboard shortcuts</h3>
        <dl>
          {SHORTCUTS.map(([keys, what]) => (
            <div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{what}</dd></div>
          ))}
        </dl>
      </div>
    </Panel>
  );
}

export function PanelHost({ name, engine, onClose, onPickTrack }: {
  name: PanelName; engine: Engine; onClose: () => void; onPickTrack: (index: number) => void;
}) {
  switch (name) {
    case 'speed': return <SpeedPanel engine={engine} onClose={onClose} />;
    case 'transpose': return <TransposePanel engine={engine} onClose={onClose} />;
    case 'mixer': return <MixerPanel engine={engine} onClose={onClose} onPick={onPickTrack} />;
    case 'download': return <DownloadPanel engine={engine} onClose={onClose} />;
    case 'print': return <PrintPanel engine={engine} onClose={onClose} />;
    case 'view': return <ViewPanel onClose={onClose} />;
    case 'settings': return <SettingsPanel onClose={onClose} />;
    case 'help': return <HelpPanel onClose={onClose} />;
  }
}
