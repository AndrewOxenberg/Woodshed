// The YouTube IFrame API, loaded once on first use. Plan §18.2.
// Only the calls Woodshed makes are typed here.

export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlaybackRate(): number;
  setPlaybackRate(rate: number): void;
  getVolume(): number;
  setVolume(volume: number): void;
  getPlayerState(): number;
  destroy(): void;
}

export interface YTNamespace {
  Player: new (el: HTMLElement, options: {
    host?: string;
    videoId: string;
    width?: number | string;
    height?: number | string;
    playerVars?: Record<string, string | number>;
    events?: {
      onReady?: (e: { target: YTPlayer }) => void;
      onStateChange?: (e: { data: number; target: YTPlayer }) => void;
      onError?: (e: { data: number }) => void;
    };
  }) => YTPlayer;
  PlayerState: { UNSTARTED: -1; ENDED: 0; PLAYING: 1; PAUSED: 2; BUFFERING: 3; CUED: 5 };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let loading: Promise<YTNamespace> | null = null;

export function loadYouTube(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  loading ??= new Promise((resolve, reject) => {
    const before = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      before?.();
      resolve(window.YT!);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => {
      loading = null;
      reject(new Error('YouTube could not be reached.'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** Playback rates YouTube offers (§4.2), within Woodshed's 15% to 175%. */
export const YT_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75];

/** YouTube's error codes, in words. */
export function youTubeError(code: number): string {
  if (code === 101 || code === 150) return 'The owner of this video does not allow it to play on other sites. Try another upload.';
  if (code === 100) return 'This video was removed or made private. Try another upload.';
  if (code === 5) return 'This video cannot play in this browser.';
  return 'YouTube could not play this video.';
}
