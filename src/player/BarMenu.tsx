// The ⋮ menu at the bottom right of a bar: loop it, play from it, pick the track it shows. Plan §17.1.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { setSongPrefs, usePrefs } from '../prefs.ts';
import { barNumber, type Engine } from './engine.ts';

export function BarMenu({ engine, songId, hoverBar }: { engine: Engine; songId: string; hoverBar: number | null }) {
  const state = useSyncExternalStore(engine.subscribe, engine.getState);
  const cursorBar = useSyncExternalStore(engine.subscribePosition, () => engine.getPosition().bar);
  const prefs = usePrefs();
  const [open, setOpen] = useState<number | null>(null);
  const [up, setUp] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  // Open upward when the menu would run off the bottom of the window.
  useLayoutEffect(() => {
    const el = menu.current;
    if (open === null || !el) return setUp(false);
    const view = el.closest('.score-scroll')?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!up && view && r.bottom > view.bottom) setUp(true);
  }, [open, up]);

  useEffect(() => {
    if (open === null) return;
    const close = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node)) setOpen(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(null);
      }
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', key, true);
    };
  }, [open]);

  const bar = open ?? hoverBar ?? cursorBar;
  const drawn = engine.drawnBar(bar);
  // Re-measure whenever the tab is laid out again.
  void state.layout;
  if (!drawn || state.status !== 'ready') return null;
  // Just under the bar's staff lines, at its right end.
  const box = drawn.visualBounds;
  const label = state.pickup && bar === 0 ? 'the pickup bar' : `bar ${barNumber(bar, state.pickup)}`;
  const group = engine.partTracks();
  const switches = prefs.songs[songId]?.switches ?? {};
  const chosen = switches[String(bar)];
  const choose = (track: number | null) => {
    const next = { ...switches };
    if (track === null) delete next[String(bar)];
    else next[String(bar)] = track;
    setSongPrefs(songId, { switches: next });
  };
  const done = () => setOpen(null);

  return (
    <div className="bar-menu-layer">
      <button type="button" className="bar-menu-btn" style={{ left: box.x + box.w - 26, top: box.y + box.h + 2 }}
        aria-label={`Menu for ${label}`} aria-expanded={open !== null} aria-haspopup="menu"
        onClick={() => setOpen(open === null ? bar : null)}>⋮</button>
      {open !== null && (
        <div className="bar-menu" role="menu" aria-label={`Menu for ${label}`} ref={menu}
          style={up ? { left: Math.max(0, box.x + box.w - 236), bottom: `calc(100% - ${box.y + box.h}px)` } : { left: Math.max(0, box.x + box.w - 236), top: box.y + box.h + 30 }}>
          <p className="bar-menu-title">{label[0].toUpperCase() + label.slice(1)}</p>
          <button type="button" role="menuitem" onClick={() => { engine.setLoop({ on: true, startBar: bar, endBar: bar }); done(); }}>Loop this bar</button>
          <button type="button" role="menuitem" onClick={() => { engine.seekBar(bar); engine.play(); done(); }}>Play from here</button>
          {group.length > 1 && (
            <fieldset className="bar-menu-part">
              <legend>In this bar show</legend>
              <label>
                <input type="radio" name="bar-part" checked={chosen === undefined} onChange={() => choose(null)} />
                <span>Automatic</span>
              </label>
              {group.map((i) => (
                <label key={i}>
                  <input type="radio" name="bar-part" checked={chosen === i} onChange={() => choose(i)} />
                  <span>{state.tracks[i]?.name}{i === state.home ? ' (picked)' : ''}</span>
                </label>
              ))}
              {!prefs.autoswitch && <p className="hint">Used when "Follow the part across tracks" is on in Tracks.</p>}
            </fieldset>
          )}
        </div>
      )}
    </div>
  );
}
