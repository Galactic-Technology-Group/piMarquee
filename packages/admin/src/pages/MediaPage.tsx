import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type MediaItem } from '../api/client';
import { useConfigChange } from '../api/ws';
import { ProgressBar, formatBytes, mediaLabel } from '../media';

/** Downloaded YouTube videos: status, size, where they are used, and manual cleanup. */
export function MediaPage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [totalBytes, setTotalBytes] = useState(0);
  const [keep, setKeep] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.media
      .list()
      .then((r) => {
        setItems(r.items);
        setTotalBytes(r.totalBytes);
        setKeep(r.keepUnusedMedia);
      })
      .catch((e) => setError((e as Error).message));
  }, []);
  useEffect(refresh, [refresh]);
  useConfigChange(['media', 'layouts', 'settings'], refresh);

  const run = (p: Promise<unknown>) => p.then(refresh).catch((e) => setError((e as Error).message));

  return (
    <div className="page">
      <div className="page-head">
        <h2>Media</h2>
        <span className="muted small">
          {items.filter((i) => i.status === 'ready').length} videos · {formatBytes(totalBytes)} on disk
        </span>
      </div>
      {error && (
        <div className="error-bar" onClick={() => setError(null)}>
          {error}
        </div>
      )}
      <p className="small muted">
        Videos used by YouTube widgets in download mode are fetched once and kept in <code>/var/lib/pimarquee/media</code>.{' '}
        {keep
          ? 'Unused videos are kept until you delete them here (Settings → Keep unused videos).'
          : 'Unused videos are deleted automatically (Settings → Keep unused videos is off).'}
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Video</th>
            <th>Status</th>
            <th>Size</th>
            <th>Used by</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((m) => {
            const { text, cls } = mediaLabel(m);
            return (
              <tr key={m.videoId}>
                <td>
                  <div>{m.title ?? m.videoId}</div>
                  <div className="mono small muted">
                    <a href={`https://www.youtube.com/watch?v=${m.videoId}`} target="_blank" rel="noreferrer">
                      {m.videoId}
                    </a>
                  </div>
                </td>
                <td>
                  <span className={`small ${cls}`}>{text}</span>
                  <ProgressBar status={m} />
                </td>
                <td className="small">{m.status === 'ready' ? formatBytes(m.bytes) : m.progress?.totalBytes ? formatBytes(m.progress.totalBytes) : '–'}</td>
                <td className="small">
                  {m.usedBy.length === 0 && <span className="muted">not used</span>}
                  {m.usedBy.map((u, i) => (
                    <div key={`${u.layoutId}-${i}`}>
                      <Link to={`/layouts/${u.layoutId}`}>{u.layoutName}</Link> <span className="muted">· {u.widgetName}</span>
                    </div>
                  ))}
                </td>
                <td className="row right">
                  <button disabled={m.status === 'downloading'} onClick={() => run(api.media.refresh(m.videoId))}>
                    Re-download
                  </button>
                  <button
                    className="danger"
                    title={m.usedBy.length ? 'Still used by a layout: it will be downloaded again' : 'Delete the file'}
                    onClick={() => {
                      const q = m.usedBy.length
                        ? `"${m.title ?? m.videoId}" is still used by a layout and will be downloaded again. Delete the file anyway?`
                        : `Delete "${m.title ?? m.videoId}" from the Pi?`;
                      if (confirm(q)) run(api.media.remove(m.videoId));
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No downloads yet. Add a YouTube widget to a layout.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
