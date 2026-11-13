// The loop highlight and its two drag handles, drawn over the tab. Plan §3.3, §12.2.
import { useRef, useSyncExternalStore } from 'react';
import { barNumber, type Engine } from './engine.ts';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function LoopOverlay({ engine }: { engine: Engine }) {
  const state = useSyncExternalStore(engine.subscribe, engine.getState);
  const layer = useRef<HTMLDivElement>(null);
  const { loop } = state;
  const systems = engine.api.boundsLookup?.staffSystems;
  if (!loop.on || !systems) return null;

  // One rectangle per line of tab the loop touches. A loop that starts inside a multirest starts at that multirest.
  const from = engine.drawnBar(loop.startBar)?.index ?? loop.startBar;
  const rects: Rect[] = [];
  for (const system of systems) {
    const inside = system.bars.filter((b) => b.index >= from && b.index <= loop.endBar);
    if (!inside.length) continue;
    const first = inside[0].realBounds;
    const last = inside[inside.length - 1].realBounds;
    rects.push({ x: first.x, y: system.realBounds.y, w: last.x + last.w - first.x, h: system.realBounds.h });
  }
  if (!rects.length) return null;
  const head = rects[0];
  const tail = rects[rects.length - 1];

  const drag = (edge: 'start' | 'end') => (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const box = layer.current?.getBoundingClientRect();
      if (!box) return;
      const bar = engine.barAtPoint(ev.clientX - box.left, ev.clientY - box.top);
      if (bar === null) return;
      const now = engine.getState().loop;
      engine.setLoop(edge === 'start'
        ? { ...now, startBar: Math.min(bar, now.endBar) }
        : { ...now, endBar: Math.max(bar, now.startBar) });
    };
    const stop = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', stop);
      handle.removeEventListener('pointercancel', stop);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
  };

  const nudge = (edge: 'start' | 'end') => (e: React.KeyboardEvent) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    e.stopPropagation();
    engine.setLoop(edge === 'start'
      ? { ...loop, startBar: Math.min(loop.startBar + step, loop.endBar) }
      : { ...loop, endBar: Math.max(loop.endBar + step, loop.startBar) });
  };

  return (
    <div className="loop-layer" ref={layer}>
      {rects.map((r) => (
        <div key={`${r.x}-${r.y}`} className="loop-rect" style={{ left: r.x, top: r.y, width: r.w, height: r.h }} />
      ))}
      <button type="button" className="loop-handle" style={{ left: head.x, top: head.y, height: head.h }}
        aria-label={`Loop start: bar ${barNumber(loop.startBar, state.pickup)}. Drag or use the arrow keys.`}
        onPointerDown={drag('start')} onKeyDown={nudge('start')} />
      <button type="button" className="loop-handle is-end" style={{ left: tail.x + tail.w, top: tail.y, height: tail.h }}
        aria-label={`Loop end: bar ${barNumber(loop.endBar, state.pickup)}. Drag or use the arrow keys.`}
        onPointerDown={drag('end')} onKeyDown={nudge('end')} />
    </div>
  );
}
