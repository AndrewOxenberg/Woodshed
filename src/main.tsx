import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Library } from './library/Library.tsx';
import { PlayerPage } from './player/PlayerPage.tsx';
import { getPrefs, resolvedTheme, usePrefs } from './prefs.ts';
import './styles.css';

type Route = { page: 'library' } | { page: 'song'; id: string; track: number | null };

function parseRoute(hash: string): Route {
  const m = hash.match(/^#\/song\/((?:songsterr|file)-[a-z0-9-]+)(?:\/(\d+))?$/);
  return m ? { page: 'song', id: m[1], track: m[2] !== undefined ? Number(m[2]) : null } : { page: 'library' };
}

// Set before first paint so the tab is drawn in the right colors from the start.
document.documentElement.dataset.theme = resolvedTheme(getPrefs().theme);

function App() {
  const prefs = usePrefs();
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  const [, setDeviceTheme] = useState(0);

  useEffect(() => {
    const onHash = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setDeviceTheme((n) => n + 1);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const theme = resolvedTheme(prefs.theme);
  document.documentElement.dataset.theme = theme;

  return route.page === 'song'
    ? <PlayerPage key={route.id} id={route.id} track={route.track} theme={theme} />
    : <Library />;
}

createRoot(document.getElementById('root')!).render(<App />);
