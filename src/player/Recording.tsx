// Playing along with the song's YouTube recordings. Plan §18.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Recording } from '../api.ts';
import { setSongPrefs, usePrefs } from '../prefs.ts';
import type { Engine, TrackState } from './engine.ts';
import { Panel } from './panels.tsx';
import { loadYouTube, youTubeError, type YTPlayer } from './youtube.ts';

/** At most this many other uploads of the full mix are offered, for when one is blocked. */
const MAX_ALTERNATIVES = 3;

/** The original full mix first, then its other uploads: what plays by default (§19.4). */
export function fullMixes(videos: Recording[]): Recording[] {
  return [...videos.filter((v) => v.feature === null), ...videos.filter((v) => v.feature === 'alternative')];
}

/** The recordings worth offering, in the order the panel lists them. */
export function offered(videos: Recording[]): Recording[] {
  const order = { null: 0, backing: 1, solo: 2, playthrough: 3, alternative: 4 } as const;
  const sorted = [...videos].sort((a, b) => order[a.feature ?? 'null'] - order[b.feature ?? 'null']);
  let alternatives = 0;
  return sorted.filter((v) => v.feature !== 'alternative' || alternatives++ < MAX_ALTERNATIVES);
}

export function recordingLabel(v: Recording, tracks: TrackState[], all: Recording[]): string {
  const names = (v.tracks ?? []).map((i) => tracks[i]?.name).filter(Boolean).join(', ');
  switch (v.feature) {
    case null: return 'Full mix';
    case 'backing': return names ? `Backing, without ${names}` : 'Backing track';
    case 'solo': return names ? `Only ${names}` : 'Solo';
    case 'playthrough': return 'Playthrough';
    default: {
      const n = all.filter((x) => x.feature === 'alternative').indexOf(v) + 2;
      return `Full mix, upload ${n}`;
    }
  }
}

export function RecordingPanel({ engine, songId, videos, current, onClose }: {
  engine: Engine; songId: string; videos: Recording[]; current: string | null; onClose: () => void;
}) {
  const state = useSyncExternalStore(engine.subscribe, engine.getState);
  const chosen = current;
  const list = offered(videos);
  const pick = (videoId: string | null) => setSongPrefs(songId, videoId ? { video: videoId, lastVideo: videoId } : { video: null });
  return (
    <Panel title="Recording" onClose={onClose}>
      <p className="hint">Play along with the recording instead of the synth. The tab follows the video, using Songsterr's timing for each bar.</p>
      <fieldset className="choices" aria-label="What plays">
        <label className="check">
          <input type="radio" name="recording" checked={!chosen} onChange={() => pick(null)} />
          <span>Synth (the tab's own sound)</span>
        </label>
        {list.map((v) => (
          <label className="check" key={v.videoId + (v.feature ?? '')}>
            <input type="radio" name="recording" checked={chosen === v.videoId} onChange={() => pick(v.videoId)} />
            <span>{recordingLabel(v, state.tracks, videos)}</span>
          </label>
        ))}
      </fieldset>
      {chosen && (
        <p className="note">
          With a recording, speed moves in YouTube's steps (25% to 175%). The track sliders, count-in, metronome and
          "shift the sound" change only the synth. Press V to switch back and forth.
        </p>
      )}
    </Panel>
  );
}

/**
 * The YouTube player, bottom left, and the handler that lets alphaTab drive it (§18.2).
 * Mounted per video; unmounting hands playback back to the synth.
 */
export function VideoBox({ engine, recording, label, onClose, onFail }: {
  engine: Engine; recording: Recording; label: string; onClose: () => void;
  /** Set when this video plays by default: a video YouTube refuses is skipped for the next upload. */
  onFail?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // A click on the video moves keyboard focus into YouTube's frame, where Space, V and the other
  // shortcuts never reach the page. Its own keys are off (disablekb), so take focus straight back.
  useEffect(() => {
    const onBlur = () => setTimeout(() => {
      const active = document.activeElement as HTMLElement | null;
      if (active?.tagName === 'IFRAME' && host.current?.contains(active)) {
        active.blur();
        window.focus();
      }
    }, 0);
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, []);

  useEffect(() => {
    let alive = true;
    let player: YTPlayer | null = null;
    let timer = 0;
    // YouTube starts playing on a seek; after a seek made while paused, its play events are ours to undo.
    let quietUntil = 0;
    loadYouTube().then((YT) => {
      if (!alive || !host.current) return;
      const el = document.createElement('div');
      host.current.appendChild(el);
      player = new YT.Player(el, {
        host: 'https://www.youtube-nocookie.com',
        videoId: recording.videoId,
        width: '100%',
        height: '100%',
        playerVars: { playsinline: 1, rel: 0, controls: 1, disablekb: 1, origin: location.origin },
        events: {
          onReady: ({ target }) => {
            if (!alive) return;
            const p = target;
            engine.useRecording(recording.points, {
              get backingTrackDuration() { return p.getDuration() * 1000; },
              get playbackRate() { return p.getPlaybackRate(); },
              set playbackRate(v: number) { p.setPlaybackRate(v); },
              get masterVolume() { return p.getVolume() / 100; },
              set masterVolume(v: number) { p.setVolume(Math.round(v * 100)); },
              seekTo(ms: number) {
                const playing = engine.getState().playing;
                p.seekTo(ms / 1000, true);
                if (!playing) {
                  quietUntil = performance.now() + 1500;
                  p.pauseVideo();
                }
              },
              play() { p.playVideo(); },
              pause() { p.pauseVideo(); },
            });
            timer = window.setInterval(() => engine.mediaTime(p.getCurrentTime() * 1000), 50);
            // Dev only, like window.__woodshed: lets the checks in plan §18.5 read the video's clock.
            if (import.meta.env.DEV) (window as unknown as { __video?: YTPlayer }).__video = p;
            setReady(true);
          },
          onStateChange: ({ data, target }) => {
            const playing = engine.getState().playing;
            if (data === YT.PlayerState.PLAYING && !playing) {
              if (performance.now() < quietUntil) target.pauseVideo();
              else engine.play(); // the video's own play button
            } else if ((data === YT.PlayerState.PAUSED || data === YT.PlayerState.ENDED) && playing) {
              engine.pause(); // the video's own pause, or its end
            }
          },
          onError: ({ data }) => {
            if (!alive) return;
            if (onFail) onFail();
            else setError(youTubeError(data));
          },
        },
      });
    }).catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
      window.clearInterval(timer);
      // React has already taken the box off the page, so YouTube's own clean-up can throw. An error
      // here would blank the whole app (it did on the way back to the library, §19.1).
      try {
        engine.useRecording(null, null);
      } catch {
        // the page is going anyway
      }
      try {
        player?.destroy();
      } catch {
        // nothing left to remove
      }
    };
    // onFail changes identity every render; the video is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, recording]);

  return (
    <aside className="video-box" aria-label={`Recording: ${label}`}>
      <div className="video-head">
        <span className="video-label">{label}</span>
        <button type="button" className="video-close" aria-label="Back to the synth" title="Back to the synth (V)" onClick={onClose}>×</button>
      </div>
      <div className="video-frame" ref={host} />
      {!ready && !error && <p className="video-msg" role="status">Loading the video…</p>}
      {error && (
        <div className="video-msg" role="alert">
          <p>{error}</p>
          <button type="button" className="btn" onClick={onClose}>Back to the synth</button>
        </div>
      )}
    </aside>
  );
}
