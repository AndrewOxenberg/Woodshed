// The practice player: tab, transport bar, panels, keyboard shortcuts. Plan §3.1, §3.19.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getScore, getSong, type SongEntry } from '../api.ts';
import { getPrefs, setSongPrefs, toggleFavorite, usePrefs } from '../prefs.ts';
import { IconBack, IconPause, IconPlay, IconRestart, IconStar } from '../ui/icons.tsx';
import { Engine, barNumber, type ScoreColors } from './engine.ts';
import { LoopOverlay } from './LoopOverlay.tsx';
import { PanelHost, VIEW_NAMES, type PanelName } from './panels.tsx';

function readColors(): ScoreColors {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return { ink: v('--score-ink'), muted: v('--score-muted'), line: v('--score-line') };
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function Tool({ label, value, hint, pressed, open, onClick }: {
  label: string; value?: string; hint?: string; pressed?: boolean; open?: boolean; onClick: () => void;
}) {
  return (
    <button type="button" className={`tool${open ? ' is-open' : ''}`} aria-pressed={pressed} aria-expanded={open}
      title={hint ? `${label} (${hint})` : label} onClick={onClick}>
      <span className="tool-label">{label}</span>
      {value !== undefined && <span className="tool-value">{value}</span>}
    </button>
  );
}

function Transport({ engine, panel, toggle }: { engine: Engine; panel: PanelName | null; toggle: (p: PanelName) => void }) {
  const state = useSyncExternalStore(engine.subscribe, engine.getState);
  const pos = useSyncExternalStore(engine.subscribePosition, engine.getPosition);
  const prefs = usePrefs();
  const { loop } = state;
  const num = (index: number) => barNumber(index, state.pickup);
  const lastBar = num(Math.max(0, state.barCount - 1));
  const barText = (index: number) => (state.pickup && index === 0 ? 'Pickup' : `Bar ${num(index)}`);
  const fraction = pos.endTick ? pos.tick / pos.endTick : 0;
  const key = state.transpose || state.pitchShift
    ? [state.transpose ? `tab ${state.transpose > 0 ? '+' : ''}${state.transpose}` : '', state.pitchShift ? `sound ${state.pitchShift > 0 ? '+' : ''}${state.pitchShift}` : ''].filter(Boolean).join(', ')
    : 'original';

  const seek = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    engine.seekFraction((e.clientX - box.left) / box.width);
  };

  return (
    <footer className="transport">
      <div className="progress" role="slider" tabIndex={0} aria-label="Position in the song" aria-valuemin={num(0)} aria-valuemax={lastBar}
        aria-valuenow={num(pos.bar)} aria-valuetext={`${barText(pos.bar)} of ${lastBar}`} onPointerDown={seek}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            e.stopPropagation();
            engine.seekFraction(fraction + (e.key === 'ArrowRight' ? 0.02 : -0.02));
          }
        }}>
        <div className="progress-fill" style={{ width: `${fraction * 100}%` }} />
      </div>
      <div className="transport-row">
        <div className="transport-main">
          <button type="button" className="icon-btn" aria-label="Back to the start" title="Back to the start (Backspace)" onClick={() => engine.toStart()}><IconRestart /></button>
          <button type="button" className="play" disabled={!state.playerReady} aria-label={state.playing ? 'Pause' : 'Play'} title="Play or pause (Space)" onClick={() => engine.playPause()}>
            {state.playing ? <IconPause /> : <IconPlay />}
          </button>
          <div className="readout">
            {state.playerReady ? (
              <>
                <span className="readout-bar">{barText(pos.bar)}<small>{state.pickup && pos.bar === 0 ? ` · ${lastBar} bars` : ` of ${lastBar}`}</small></span>
                <span className="readout-time">{clock(pos.ms)} / {clock(pos.endMs)}</span>
              </>
            ) : (
              <span className="readout-time" role="status">Loading sounds {Math.round(state.soundProgress * 100)}%</span>
            )}
          </div>
        </div>
        <div className="tools">
          <Tool label="Speed" value={`${Math.round(state.speed * 100)}%`} hint="S" open={panel === 'speed'} onClick={() => toggle('speed')} />
          <Tool label="Loop" value={!loop.on ? 'off' : loop.startBar === loop.endBar ? `bar ${num(loop.startBar)}` : `bars ${num(loop.startBar)}–${num(loop.endBar)}`}
            hint="L" pressed={loop.on} onClick={() => engine.toggleLoop()} />
          <Tool label="Count-in" value={state.countIn ? 'on' : 'off'} hint="C" pressed={state.countIn} onClick={() => engine.setCountIn(!state.countIn)} />
          <Tool label="Metronome" value={state.metronome ? 'on' : 'off'} hint="N" pressed={state.metronome} onClick={() => engine.setMetronome(!state.metronome)} />
          <Tool label="Transpose" value={key} hint="K" open={panel === 'transpose'} onClick={() => toggle('transpose')} />
          <Tool label="Tracks" value={state.also.length ? `${state.also.length + 1} of ${state.tracks.length}` : `${state.tracks.length}`} hint="T" open={panel === 'mixer'} onClick={() => toggle('mixer')} />
          <Tool label="View" value={VIEW_NAMES[prefs.view]} open={panel === 'view'} onClick={() => toggle('view')} />
          <span className="tools-gap" />
          <Tool label="Download" open={panel === 'download'} onClick={() => toggle('download')} />
          <Tool label="Print" hint="P" open={panel === 'print'} onClick={() => toggle('print')} />
          <Tool label="Settings" open={panel === 'settings'} onClick={() => toggle('settings')} />
        </div>
      </div>
    </footer>
  );
}

export function PlayerPage({ id, track, theme }: { id: string; track: number | null; theme: 'light' | 'dark' }) {
  const prefs = usePrefs();
  const host = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [entry, setEntry] = useState<SongEntry | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelName | null>(null);
  const toggle = (p: PanelName) => setPanel((now) => (now === p ? null : p));

  // Create the engine once per song and load the tab into it.
  useEffect(() => {
    let alive = true;
    const eng = new Engine(host.current!, scroller.current!, getPrefs(), readColors());
    setEngine(eng);
    // Dev only: lets the browser checks in plan §12.3 read exact positions.
    if (import.meta.env.DEV) (window as unknown as { __woodshed?: Engine }).__woodshed = eng;
    (async () => {
      try {
        const [song, bytes] = await Promise.all([getSong(id), getScore(id)]);
        if (!alive) return;
        setEntry(song);
        document.title = `${song.title} · Woodshed`;
        const saved = getPrefs().songs[id];
        eng.load(bytes, track ?? saved?.track ?? song.defaultTrack, saved?.speed ?? 1, saved?.also ?? []);
      } catch (e) {
        if (alive) setLoadError((e as Error).message);
      }
    })();
    return () => {
      alive = false;
      eng.destroy();
    };
    // The track in the address is only read on first load; later changes go through showTrack.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const state = useSyncExternalStore(engine?.subscribe ?? noSubscribe, engine?.getState ?? noState);

  useEffect(() => {
    engine?.applyPrefs(prefs, readColors());
  }, [engine, prefs, theme]);

  // Remember the track and speed for this song, and keep the address in step.
  useEffect(() => {
    if (!state || state.status !== 'ready') return;
    setSongPrefs(id, { track: state.trackIndex, speed: state.speed, also: state.also });
    const want = `#/song/${id}/${state.trackIndex}`;
    if (location.hash !== want) history.replaceState(null, '', want);
  }, [id, state?.status, state?.trackIndex, state?.speed, state?.also]);

  useEffect(() => {
    if (engine && track !== null) engine.showTrack(track);
  }, [engine, track]);

  // Let the panels sit just above the transport bar, whatever its height.
  useEffect(() => {
    const bar = page.current?.querySelector('.transport');
    if (!bar || !page.current) return;
    const el = page.current;
    const ro = new ResizeObserver(() => el.style.setProperty('--transport-h', `${bar.getBoundingClientRect().height}px`));
    ro.observe(bar);
    return () => ro.disconnect();
  }, [engine]);

  useEffect(() => {
    if (!engine) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input:not([type=range]):not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable]')) return;
      const s = engine.getState();
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
      const done = () => e.preventDefault();

      if (key === 'Escape') { setPanel(null); return; }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && key === 'k') { toggle('help'); return done(); }
      if (e.ctrlKey && e.shiftKey && (key === 'ArrowUp' || key === 'ArrowDown')) {
        const next = s.trackIndex + (key === 'ArrowDown' ? 1 : -1);
        if (next >= 0 && next < s.tracks.length) engine.showTrack(next);
        return done();
      }
      if (e.altKey && e.shiftKey && /^Digit[1-9]$/.test(e.code)) {
        const next = Number(e.code.slice(5)) - 1;
        if (next < s.tracks.length) engine.showTrack(next);
        return done();
      }
      if (e.altKey && key === 'm') { engine.setSolo(s.trackIndex, !s.tracks[s.trackIndex]?.solo); return done(); }
      if (!plain) return;
      // A focused slider keeps its own arrow keys. Space is always play/pause; Enter still presses a focused button.
      const onControl = !!t.closest('button, a, [role=slider], input, summary');

      if (key === ' ') { engine.playPause(); return done(); }
      if (key === 'Backspace') { engine.toStart(); return done(); }
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        if (onControl && t.matches('input, [role=slider], .loop-handle')) return;
        const dir = key === 'ArrowRight' ? 1 : -1;
        if (e.shiftKey) engine.moveLoopEnd(dir);
        else if (panel === 'transpose') engine.setTranspose(s.transpose + dir);
        else if (panel === 'speed') engine.setSpeed(s.speed + dir / 100);
        else engine.stepBeat(dir);
        return done();
      }
      if (key === 'ArrowUp' || key === 'ArrowDown') {
        if (onControl && t.matches('input, [role=slider]')) return;
        const dir = key === 'ArrowDown' ? 1 : -1;
        if (panel === 'transpose') engine.setTranspose(s.transpose - dir);
        else if (panel === 'speed') engine.setSpeed(s.speed - dir / 100);
        else engine.stepLine(dir);
        return done();
      }
      if (e.shiftKey) return;
      switch (key) {
        case 'l': engine.toggleLoop(); break;
        case 's': toggle('speed'); break;
        case 'k': toggle('transpose'); break;
        case 't': toggle('mixer'); break;
        case 'p': toggle('print'); break;
        case 'c': engine.setCountIn(!s.countIn); break;
        case 'n': engine.setMetronome(!s.metronome); break;
        case 'm': engine.setMute(s.trackIndex, !s.tracks[s.trackIndex]?.mute); break;
        default: return;
      }
      done();
    };
    // Some browsers press a focused button on Space key-up; swallow that so Space only plays or pauses.
    const onKeyUp = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === ' ' && !t.closest('input:not([type=range]):not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable]')) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [engine, panel]);

  const title = state?.title || entry?.title || '';
  const artist = state?.artist || entry?.artist || '';
  const current = state?.tracks[state.trackIndex];
  const favorite = prefs.favorites.includes(id);
  const problem = loadError ?? (state?.status === 'error' ? state.error : null);

  return (
    <div className="player" ref={page}>
      <header className="topbar">
        <a className="back" href="#/" aria-label="Back to the library"><IconBack /><span className="back-label">Library</span></a>
        <div className="song-id">
          <h1>{title || 'Loading…'}</h1>
          {artist && <p>{artist}</p>}
        </div>
        {current && (
          <button type="button" className="track-chip" aria-expanded={panel === 'mixer'} title="Tracks (T)" onClick={() => toggle('mixer')}>
            <span className="track-chip-name">{current.name}</span>
            {current.tuning && <span className="track-chip-tuning">{current.tuning}</span>}
          </button>
        )}
        <button type="button" className="icon-btn help-btn" aria-expanded={panel === 'help'} aria-label="Help and keyboard shortcuts" title="Help (Ctrl+K)" onClick={() => toggle('help')}>?</button>
        <button type="button" className={`icon-btn star${favorite ? ' is-on' : ''}`} aria-pressed={favorite}
          aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'} onClick={() => toggleFavorite(id)}>
          <IconStar filled={favorite} />
        </button>
      </header>

      <main className="score-scroll" ref={scroller}>
        {problem && (
          <div className="score-message" role="alert">
            <p>{problem}</p>
            <a className="btn" href="#/">Back to the library</a>
          </div>
        )}
        {!problem && state?.status !== 'ready' && <p className="score-message" role="status">Drawing the tab…</p>}
        <div className="score-page" style={{ maxWidth: prefs.pageWidth }}>
          <div className="score-wrap">
            <div className="score-host" ref={host} onDoubleClick={() => engine?.play()} />
            {engine && <LoopOverlay engine={engine} />}
          </div>
        </div>
      </main>

      {engine && panel && (
        <PanelHost name={panel} engine={engine} onClose={() => setPanel(null)} onPickTrack={(i) => engine.showTrack(i)} />
      )}
      {engine && <Transport engine={engine} panel={panel} toggle={toggle} />}
    </div>
  );
}

const noSubscribe = () => () => {};
const noState = () => null;
