// The chords view: words with chords over them, chord charts, capo, simplify, diagrams,
// autoscroll, and the current chord lit during playback. Plan §16.2, §16.3.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { getExtras, type SongExtras } from '../api.ts';
import { prettyChord, simplifyChord, spellingFor, transposeChord } from '../lib/chords.ts';
import { autoCapo, fingeringFor } from '../lib/fingering.ts';
import { parseChordPro, sheetChords, type Segment, type Sheet, type SheetChord, type SheetLine } from '../lib/sheet.ts';
import { sheetFromScore } from '../lib/tabSheet.ts';
import { getPrefs, setPrefs, setSongPrefs, usePrefs, type SheetSource } from '../prefs.ts';
import { barNumber, type Engine } from './engine.ts';

/** Autoscroll at 100%, in pixels a second. */
const SCROLL_PX = 24;
const MAX_CAPO = 9;

export function ChordsView({ engine, songId, scroller }: {
  engine: Engine; songId: string; scroller: React.RefObject<HTMLElement | null>;
}) {
  const state = useSyncExternalStore(engine.subscribe, engine.getState);
  const prefs = usePrefs();
  const song = prefs.songs[songId] ?? {};
  const [extras, setExtras] = useState<SongExtras | null>(null);
  const [scrolling, setScrolling] = useState(false);
  const scrollingRef = useRef(false);
  scrollingRef.current = scrolling;
  const paper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    getExtras(songId).then((e) => alive && setExtras(e));
    return () => {
      alive = false;
    };
  }, [songId]);

  const songsterr = useMemo(() => (extras?.chordpro ? parseChordPro(extras.chordpro) : null), [extras]);
  // Rebuilt for every new score (a transpose renames the tab's chords and re-detects).
  const fromTab = useMemo(
    () => (extras && engine.api.score ? sheetFromScore(engine.api.score, extras.lyricLines) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [extras, state.scoreVersion],
  );
  const source: SheetSource = song.sheetSource === 'tab' || !songsterr ? 'tab' : 'songsterr';
  const sheet = source === 'songsterr' ? songsterr : fromTab;

  // ---- what each chord is called on screen --------------------------------------------
  const raw = useMemo(() => (sheet ? sheetChords(sheet).map((c) => c.name) : []), [sheet]);
  // A sheet's own capo means its chords are shapes at that fret: move them to sounding names first.
  const sheetCapo = sheet?.capo ?? 0;
  const shift = (source === 'songsterr' ? state.transpose : 0) + sheetCapo;
  const simplify = prefs.simplifyChords;
  const sounding = useMemo(() => {
    const spelling = spellingFor(raw, shift);
    const m = new Map<string, string>();
    for (const n of new Set(raw)) {
      const s = shift ? transposeChord(n, shift, spelling) : n;
      m.set(n, simplify ? simplifyChord(s) : s);
    }
    return m;
  }, [raw, shift, simplify]);
  const changes = useMemo(() => raw.map((n) => sounding.get(n) ?? n), [raw, sounding]);
  const canSimplify = useMemo(() => raw.some((n) => simplifyChord(n) !== n), [raw]);
  const capoSetting = song.capo ?? sheetCapo;
  const auto = useMemo(() => (capoSetting === 'auto' ? autoCapo(changes) : null), [capoSetting, changes]);
  const capo = capoSetting === 'auto' ? (auto ?? 0) : capoSetting;
  const shown = useMemo(() => {
    const spelling = spellingFor(changes, -capo);
    const m = new Map<string, string>();
    for (const [n, s] of sounding) m.set(n, prettyChord(capo ? transposeChord(s, -capo, spelling) : s));
    return m;
  }, [sounding, changes, capo]);
  const show = (name: string) => shown.get(name) ?? prettyChord(name);
  const diagrams = useMemo(() => [...new Set(raw.map((n) => shown.get(n) ?? n))].filter((n) => fingeringFor(n)), [raw, shown]);

  // ---- the current chord, during playback ---------------------------------------------
  const timeline = useMemo(() => {
    if (!sheet?.timed) return null;
    const list = sheetChords(sheet).map((c, k) => ({ k, key: c.at!.bar * 1e7 + c.at!.offset }));
    return list.sort((a, b) => a.key - b.key || a.k - b.k);
  }, [sheet]);
  const index = useMemo(() => new Map(sheet ? sheetChords(sheet).map((c, k) => [c, k] as const) : []), [sheet]);

  useEffect(() => {
    const root = paper.current;
    const view = scroller.current;
    if (!timeline || !root || !view) return;
    let current = -2;
    const update = () => {
      const p = engine.getPosition();
      const key = p.bar * 1e7 + p.barTick;
      let lo = 0;
      let hi = timeline.length - 1;
      let found = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (timeline[mid].key <= key) {
          found = timeline[mid].k;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      if (found === current) return;
      current = found;
      root.querySelectorAll('.is-now').forEach((e) => e.classList.remove('is-now'));
      const el = root.querySelector<HTMLElement>(`[data-ci="${found}"]`);
      if (!el) return;
      el.classList.add('is-now');
      if (!engine.getState().playing || scrollingRef.current) return;
      // Keep the current line in the top third of the window.
      const r = el.getBoundingClientRect();
      const v = view.getBoundingClientRect();
      if (r.top < v.top + 48 || r.bottom > v.bottom - 72) {
        view.scrollTo({ top: view.scrollTop + (r.top - v.top) - v.height * 0.3, behavior: 'smooth' });
      }
    };
    update();
    const stop = engine.subscribePosition(update);
    return () => {
      stop();
    };
  }, [timeline, engine, scroller, shown]);

  // ---- autoscroll ----------------------------------------------------------------------
  useEffect(() => {
    const view = scroller.current;
    if (!scrolling || !view) return;
    let last = performance.now();
    let carry = 0;
    let frame = 0;
    const step = (now: number) => {
      carry += ((now - last) / 1000) * SCROLL_PX * getPrefs().autoscrollSpeed;
      last = now;
      const px = Math.floor(carry);
      if (px) {
        carry -= px;
        view.scrollTop += px;
      }
      if (view.scrollTop + view.clientHeight >= view.scrollHeight - 1) {
        setScrolling(false);
        return;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [scrolling, scroller]);

  const speedPct = Math.round(prefs.autoscrollSpeed * 100);
  const setSpeed = (pct: number) => setPrefs({ autoscrollSpeed: Math.min(3, Math.max(0.25, pct / 100)) });
  const pickSource = (s: SheetSource) => setSongPrefs(songId, { sheetSource: s });
  const seek = sheet?.timed ? (c: SheetChord) => c.at && engine.seekBar(c.at.bar, c.at.offset) : undefined;

  if (!extras || !sheet) return <p className="score-message" role="status">Reading the chords…</p>;

  const tuning = sheet.tuning ? prettyChord(sheet.tuning) : null;
  const empty = !sheet.blocks.length;

  return (
    <div className="chord-sheet" style={{ maxWidth: prefs.pageWidth }}>
      <div className="sheet-bar" role="toolbar" aria-label="Chord sheet">
        {songsterr && (
          <div className="pair" role="group" aria-label="Which sheet">
            <button type="button" className="chip" aria-pressed={source === 'songsterr'} onClick={() => pickSource('songsterr')}>Songsterr sheet</button>
            <button type="button" className="chip" aria-pressed={source === 'tab'} onClick={() => pickSource('tab')}>From the tab</button>
          </div>
        )}
        <label className="sheet-select">
          <span>Capo</span>
          <select aria-label="Capo" value={String(capoSetting)} onChange={(e) => {
            const v = e.target.value;
            setSongPrefs(songId, { capo: v === 'auto' ? 'auto' : Number(v) });
          }}>
            <option value="0">Off</option>
            <option value="auto">Auto{capoSetting === 'auto' ? (auto ? `: fret ${auto}` : ': none') : ''}</option>
            {Array.from({ length: MAX_CAPO }, (_, i) => i + 1).map((f) => <option key={f} value={f}>Fret {f}</option>)}
          </select>
        </label>
        <button type="button" className="chip" aria-pressed={simplify} disabled={!canSimplify && !simplify}
          title={canSimplify ? 'Play every chord as a plain major or minor chord' : 'No chords to simplify'}
          onClick={() => setPrefs({ simplifyChords: !simplify })}>Simplify</button>
        <button type="button" className="chip" aria-pressed={prefs.showDiagrams} onClick={() => setPrefs({ showDiagrams: !prefs.showDiagrams })}>Diagrams</button>
        <div className="pair autoscroll" role="group" aria-label="Autoscroll">
          <button type="button" className="chip" aria-pressed={scrolling} onClick={() => setScrolling(!scrolling)}>{scrolling ? 'Stop scrolling' : 'Autoscroll'}</button>
          <button type="button" className="step-sm" aria-label="Scroll slower" onClick={() => setSpeed(speedPct - 25)}>−</button>
          <output aria-label="Autoscroll speed">{speedPct}%</output>
          <button type="button" className="step-sm" aria-label="Scroll faster" onClick={() => setSpeed(speedPct + 25)}>+</button>
        </div>
      </div>

      <div className="sheet-paper" ref={paper}>
        {(tuning || capo > 0) && (
          <p className="cs-meta">
            {tuning && <>Tuning: <strong>{tuning}</strong></>}
            {tuning && capo > 0 && ' · '}
            {capo > 0 && <>Capo on fret <strong>{capo}</strong>: the names are the shapes you play</>}
          </p>
        )}
        {capoSetting === 'auto' && auto === null && <p className="cs-meta">No capo fret makes these chords easier, so the capo is off.</p>}
        {source === 'songsterr' && <p className="hint">Songsterr's chord sheet, written apart from the tab: it does not follow playback.</p>}
        {source === 'tab' && sheet.notes.length > 0 && <p className="hint">{sheet.notes.join(' ')}{sheet.timed && !empty ? ' Click a chord to play from there.' : ''}</p>}

        {prefs.showDiagrams && diagrams.length > 0 && (
          <ul className="cs-diagrams" aria-label="Chord diagrams">
            {diagrams.map((n) => <li key={n}><Diagram name={n} /></li>)}
          </ul>
        )}

        {empty && <p className="cs-empty">This song has no words or chords to show. Try Detect chords on a track that strums.</p>}
        {sheet.blocks.map((block, b) => (
          <section className="cs-block" key={b}>
            {block.title && <h3>{block.title}</h3>}
            {block.lines.map((line, l) => <Line key={l} line={line} show={show} index={index} seek={seek} pickup={state.pickup} />)}
          </section>
        ))}
      </div>
    </div>
  );
}

function ChordName({ chord, show, index, seek }: {
  chord: SheetChord; show: (n: string) => string; index: Map<SheetChord, number>; seek?: (c: SheetChord) => void;
}) {
  const name = show(chord.name);
  const cls = `cs-chord${chord.detected ? ' is-detected' : ''}`;
  const title = chord.detected ? 'Detected from the notes' : undefined;
  if (seek && chord.at) {
    return <button type="button" className={cls} title={title} data-ci={index.get(chord)} onClick={() => seek(chord)}>{name}</button>;
  }
  return <span className={cls} title={title} data-ci={index.get(chord)}>{name}</span>;
}

function Line({ line, show, index, seek, pickup }: {
  line: SheetLine; show: (n: string) => string; index: Map<SheetChord, number>; seek?: (c: SheetChord) => void; pickup: boolean;
}) {
  if (line.kind === 'space') return <div className="cs-space" />;
  if (line.kind === 'comment') return <p className="cs-comment">{line.text}</p>;
  if (line.kind === 'bars') {
    return (
      <div className="cs-bars">
        {line.bars.map((bar) => (
          <div className="cs-bar" key={bar.index}>
            <span className="cs-barnum" aria-label={`Bar ${barNumber(bar.index, pickup)}`}>{barNumber(bar.index, pickup)}</span>
            {bar.chords.length
              ? bar.chords.map((c, k) => <ChordName key={k} chord={c} show={show} index={index} seek={seek} />)
              : <span className="cs-same" aria-label="Same chord">–</span>}
          </div>
        ))}
      </div>
    );
  }
  const anyChord = line.segments.some((s: Segment) => s.chord);
  if (!anyChord) return <p className="cs-line cs-words-only">{line.segments.map((s) => s.text).join('')}</p>;
  return (
    <p className="cs-line">
      {line.segments.map((s, k) => (
        <span className="cs-seg" key={k}>
          {s.chord ? <ChordName chord={s.chord} show={show} index={index} seek={seek} /> : <span className="cs-chord" aria-hidden="true" />}
          <span className="cs-text">{s.text || ' '}</span>
        </span>
      ))}
    </p>
  );
}

/** One fingering diagram, standard tuning, low E on the left. Plan §16.3. */
function Diagram({ name }: { name: string }) {
  const f = fingeringFor(name);
  if (!f) return null;
  const rows = 4;
  const top = f.high > rows ? f.low : 1;
  // The fret number of a shape up the neck sits left of its first fret, clear of any barre.
  const x = (s: number) => 22 + s * 12;
  const y0 = 22;
  const gap = 15;
  const label = f.frets.map((v) => (v < 0 ? 'x' : String(v))).join(' ');
  return (
    <figure className="cs-diagram">
      <figcaption>{name}</figcaption>
      <svg viewBox="0 0 94 92" width="94" height="92" role="img" aria-label={`${name}: ${label}, low string first`}>
        {top > 1 && <text x="9" y={y0 + gap * 0.5 + 4} className="cs-fretno">{top}</text>}
        <line x1={x(0)} x2={x(5)} y1={y0} y2={y0} className={top === 1 ? 'cs-nut' : 'cs-fret'} />
        {Array.from({ length: rows }, (_, r) => <line key={r} x1={x(0)} x2={x(5)} y1={y0 + gap * (r + 1)} y2={y0 + gap * (r + 1)} className="cs-fret" />)}
        {f.frets.map((_, s) => <line key={s} x1={x(s)} x2={x(s)} y1={y0} y2={y0 + gap * rows} className="cs-string" />)}
        {f.frets.map((v, s) => (v < 0
          ? <text key={s} x={x(s)} y={y0 - 6} className="cs-mark">×</text>
          : v === 0 ? <circle key={s} cx={x(s)} cy={y0 - 9} r="3.2" className="cs-open" /> : null))}
        {f.barre && (
          <rect x={x(f.barre.from) - 5} y={y0 + gap * (f.barre.fret - top + 0.5) - 5} width={x(f.barre.to) - x(f.barre.from) + 10} height="10" rx="5" className="cs-dot" />
        )}
        {f.frets.map((v, s) => (v > 0 && !(f.barre && v === f.barre.fret && s >= f.barre.from)
          ? <circle key={s} cx={x(s)} cy={y0 + gap * (v - top + 0.5)} r="5" className="cs-dot" />
          : null))}
      </svg>
    </figure>
  );
}
