// The library: every saved tab, plus the two ways to add one. Plan §3.15, §11, §12.1.
import { useEffect, useMemo, useRef, useState } from 'react';
import { deleteSong, importSongsterr, listSongs, uploadFile, type Instrument, type SongEntry } from '../api.ts';
import { setSongPrefs, toggleFavorite, usePrefs } from '../prefs.ts';
import { IconStar, IconTrash } from '../ui/icons.tsx';

const ACCEPT = '.gp,.gp3,.gp4,.gp5,.gpx,.xml,.musicxml,.mxl,.cap,.capx,.tex,.alphatex,.txt,.tab';

type Notice = { kind: 'ok' | 'error'; text: string } | null;
type Filter = 'all' | 'guitar' | 'bass' | 'drums';

const FILTERS: [Filter, string][] = [['all', 'All'], ['guitar', 'Guitar'], ['bass', 'Bass'], ['drums', 'Drums']];
const NAMES: [Instrument, string][] = [['guitar', 'Guitar'], ['bass', 'Bass'], ['drums', 'Drums']];

/** "Guitar, bass, drums" for the instruments a song has tracks for. */
function instrumentList(song: SongEntry): string {
  const have = NAMES.filter(([key]) => song.instruments[key].length > 0).map(([, label]) => label);
  return have.map((label, i) => (i === 0 ? label : label.toLowerCase())).join(', ');
}

export function Library() {
  const prefs = usePrefs();
  const [songs, setSongs] = useState<SongEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [instrument, setInstrument] = useState<Filter>('all');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [dragging, setDragging] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () => listSongs().then(setSongs, (e) => setLoadError(e.message));
  useEffect(() => {
    document.title = 'Woodshed';
    refresh();
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (songs ?? []).filter((s) =>
      (!onlyFavorites || prefs.favorites.includes(s.id)) &&
      (instrument === 'all' || s.instruments[instrument].length > 0) &&
      (!q || `${s.title} ${s.artist}`.toLowerCase().includes(q)));
  }, [songs, query, onlyFavorites, instrument, prefs.favorites]);

  /** The track a song opens on. With an instrument filter on, that instrument's track. */
  const trackFor = (s: SongEntry): number => {
    const remembered = prefs.songs[s.id]?.track ?? s.defaultTrack;
    if (instrument === 'all') return remembered;
    const tracks = s.instruments[instrument];
    return tracks.includes(remembered) ? remembered : tracks[0];
  };

  async function addFiles(files: FileList | File[]) {
    setNotice(null);
    const list = [...files];
    let last: SongEntry | null = null;
    try {
      for (const file of list) {
        setBusy(`Reading ${file.name}`);
        last = (await uploadFile(file)).entry;
      }
      await refresh();
      if (last) {
        setNotice({ kind: 'ok', text: list.length === 1
          ? `Added "${last.title}".${last.note ? ` ${last.note}` : ''}`
          : `Added ${list.length} tabs.` });
      }
    } catch (e) {
      await refresh();
      setNotice({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function addLink(e: React.FormEvent) {
    e.preventDefault();
    if (!link.trim()) return;
    setNotice(null);
    setBusy('Fetching the tab from Songsterr');
    try {
      const { entry, track, problems, unknown } = await importSongsterr(link.trim());
      // A link to a bass or drum tab, or to a numbered track, opens on that track.
      if (track !== null) setSongPrefs(entry.id, { track });
      setLink('');
      await refresh();
      const caveat = problems.length
        ? ` ${problems.length} check${problems.length === 1 ? '' : 's'} failed; see convert-report.json.`
        : unknown ? ` ${unknown} notation detail${unknown === 1 ? ' was' : 's were'} not recognised and left out.` : '';
      setNotice({ kind: problems.length ? 'error' : 'ok', text: `Added "${entry.title}" by ${entry.artist}, ${entry.tracks} tracks.${caveat}` });
    } catch (err) {
      setNotice({ kind: 'error', text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setConfirmDelete(null);
    try {
      await deleteSong(id);
      await refresh();
    } catch (e) {
      setNotice({ kind: 'error', text: (e as Error).message });
    }
  }

  return (
    <div className="library">
      <header className="library-head">
        <h1 className="wordmark">Woodshed</h1>
        <p className="tagline">Slow it down, loop it, learn it.</p>
      </header>

      <section className="add" aria-label="Add a tab">
        <div
          className={`dropzone${dragging ? ' is-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
        >
          <h2>Open a file</h2>
          <p>Guitar Pro, MusicXML, alphaTex, or a plain-text tab. Drop it here.</p>
          <button type="button" className="btn" disabled={!!busy} onClick={() => fileInput.current?.click()}>Choose a file</button>
          <input ref={fileInput} type="file" accept={ACCEPT} multiple hidden
            onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; }} />
        </div>
        <form className="linkbox" onSubmit={addLink}>
          <h2>Add from a Songsterr link</h2>
          <label htmlFor="songsterr-link">Paste the address of a tab page</label>
          <div className="linkbox-row">
            <input id="songsterr-link" type="url" inputMode="url" placeholder="https://www.songsterr.com/a/wsa/…" value={link}
              onChange={(e) => setLink(e.target.value)} disabled={!!busy} />
            <button type="submit" className="btn btn-primary" disabled={!!busy || !link.trim()}>Add</button>
          </div>
        </form>
      </section>

      <div className="status-line" role="status" aria-live="polite">
        {busy && <p className="notice notice-busy">{busy}…</p>}
        {!busy && notice && <p className={`notice notice-${notice.kind}`}>{notice.text}</p>}
      </div>

      <section aria-label="Your tabs">
        <div className="list-tools">
          <input type="search" aria-label="Search your tabs" placeholder="Search title or artist" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button type="button" className="chip" aria-pressed={onlyFavorites} onClick={() => setOnlyFavorites((v) => !v)}>
            <IconStar filled={onlyFavorites} /> Favorites
          </button>
        </div>
        <div className="filters" role="group" aria-label="Show tabs for">
          {FILTERS.map(([value, label]) => (
            <button type="button" key={value} className="chip" aria-pressed={instrument === value} onClick={() => setInstrument(value)}>{label}</button>
          ))}
        </div>

        {loadError && <p className="notice notice-error" role="alert">Could not read the library. {loadError}</p>}
        {songs && songs.length === 0 && (
          <p className="empty">No tabs yet. Open a file or paste a link above and it will show up here.</p>
        )}
        {songs && songs.length > 0 && shown.length === 0 && (
          <p className="empty">
            {instrument !== 'all' && !query.trim() && !onlyFavorites
              ? `No tabs with a ${instrument === 'drums' ? 'drum' : instrument} track yet.`
              : 'Nothing matches that.'}
          </p>
        )}

        <ul className="songs">
          {shown.map((s) => {
            const fav = prefs.favorites.includes(s.id);
            const track = trackFor(s);
            const instruments = instrumentList(s);
            return (
              <li key={s.id} className="song">
                <button type="button" className={`icon-btn star${fav ? ' is-on' : ''}`} aria-pressed={fav}
                  aria-label={fav ? `Remove ${s.title} from favorites` : `Add ${s.title} to favorites`} onClick={() => toggleFavorite(s.id)}>
                  <IconStar filled={fav} />
                </button>
                <a className="song-link" href={`#/song/${s.id}/${track}`}>
                  <span className="song-title">{s.title}</span>
                  <span className="song-artist">{s.artist || 'Unknown artist'}</span>
                </a>
                <span className="song-meta">
                  {instruments && <span className="song-instruments">{instruments}</span>}
                  <span>{s.tracks} {s.tracks === 1 ? 'track' : 'tracks'} · {s.kind === 'songsterr' ? 'Songsterr' : s.format}</span>
                </span>
                {confirmDelete === s.id ? (
                  <span className="confirm">
                    <button type="button" className="btn btn-danger" onClick={() => remove(s.id)}>Delete tab</button>
                    <button type="button" className="btn" onClick={() => setConfirmDelete(null)}>Keep</button>
                  </span>
                ) : (
                  <button type="button" className="icon-btn" aria-label={`Delete ${s.title}`} onClick={() => setConfirmDelete(s.id)}><IconTrash /></button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
