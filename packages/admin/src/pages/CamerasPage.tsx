import { useCallback, useEffect, useState } from 'react';
import { api, type CameraTestResult, type CameraView } from '../api/client';
import { useConfigChange } from '../api/ws';

interface Draft {
  name: string;
  rtspUrl: string;
  enabled: boolean;
  notes: string;
}
const empty: Draft = { name: '', rtspUrl: '', enabled: true, notes: '' };

export function CamerasPage() {
  const [cameras, setCameras] = useState<CameraView[]>([]);
  const [draft, setDraft] = useState<Draft>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, CameraTestResult | 'running'>>({});
  const [thumbNonce, setThumbNonce] = useState(0);

  const refresh = useCallback(() => {
    api.cameras.list().then(setCameras).catch((e) => setError((e as Error).message));
  }, []);
  useEffect(refresh, [refresh]);
  useConfigChange(['cameras'], refresh);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = { name: draft.name.trim(), rtspUrl: draft.rtspUrl.trim(), enabled: draft.enabled, notes: draft.notes || undefined };
    const p = editing ? api.cameras.update(editing, body) : api.cameras.create(body);
    p.then(() => {
      setDraft(empty);
      setEditing(null);
      refresh();
    }).catch((er) => setError((er as Error).message));
  };

  const test = (id: string) => {
    setTests((t) => ({ ...t, [id]: 'running' }));
    api.cameras
      .test(id)
      .then((r) => {
        setTests((t) => ({ ...t, [id]: r }));
        setThumbNonce((n) => n + 1);
      })
      .catch((er) => setTests((t) => ({ ...t, [id]: { ok: false, medias: [], hasH264: false, hasH265: false, error: (er as Error).message, warnings: [] } })));
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2>Cameras</h2>
      </div>
      {error && (
        <div className="error-bar" onClick={() => setError(null)}>
          {error}
        </div>
      )}
      <form className="card" onSubmit={submit}>
        <h3>{editing ? 'Edit camera' : 'Add camera'}</h3>
        <div className="grid2">
          <label className="field">
            <span className="field-label">Name</span>
            <input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">RTSP URL</span>
            <input
              required
              placeholder="rtsp://user:pass@192.168.1.20:554/stream2"
              value={draft.rtspUrl}
              onChange={(e) => setDraft({ ...draft, rtspUrl: e.target.value })}
            />
            <span className="field-hint">
              Use the camera's <b>sub-stream</b> (720p or lower, H.264). A Pi 4 cannot decode several 1080p/H.265 streams.
            </span>
          </label>
        </div>
        <label className="field">
          <span className="field-label">Notes</span>
          <input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </label>
        <div className="row">
          <label className="check">
            <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} /> Enabled
          </label>
          <span className="spacer" />
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setDraft(empty);
              }}
            >
              Cancel
            </button>
          )}
          <button className="primary" type="submit">
            {editing ? 'Save' : '+ Add camera'}
          </button>
        </div>
      </form>

      <div className="cards">
        {cameras.map((c) => {
          const t = tests[c.id];
          return (
            <div className="card camera-card" key={c.id}>
              <img className="thumb" alt="" src={`/api/v1/cameras/${c.id}/snapshot.jpg?n=${thumbNonce}`} onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0.15')} />
              <div className="camera-info">
                <h3>
                  {c.name} {!c.enabled && <span className="badge">disabled</span>}
                </h3>
                <div className="mono small muted">{c.rtspUrl}</div>
                {c.notes && <div className="small">{c.notes}</div>}
                {t === 'running' && <div className="small muted">Testing…</div>}
                {t && t !== 'running' && (
                  <div className={`small ${t.ok ? 'ok' : 'bad'}`}>
                    {t.ok ? `OK: ${t.medias.join(' | ')}` : `Failed: ${t.error}`}
                    {t.warnings.map((w) => (
                      <div key={w} className="warn-text">
                        ⚠ {w}
                      </div>
                    ))}
                  </div>
                )}
                <div className="row">
                  <button onClick={() => test(c.id)}>Test</button>
                  <button
                    onClick={() => {
                      setEditing(c.id);
                      setDraft({ name: c.name, rtspUrl: c.rtspUrl, enabled: c.enabled, notes: c.notes ?? '' });
                      window.scrollTo({ top: 0 });
                    }}
                  >
                    Edit
                  </button>
                  <button onClick={() => api.cameras.update(c.id, { enabled: !c.enabled }).then(refresh)}>{c.enabled ? 'Disable' : 'Enable'}</button>
                  <button
                    className="danger"
                    onClick={() => {
                      if (confirm(`Delete camera "${c.name}"? Widgets using it will be removed from layouts.`)) {
                        api.cameras.remove(c.id).then(refresh).catch((er) => setError((er as Error).message));
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {cameras.length === 0 && <p className="muted">No cameras yet.</p>}
      </div>
    </div>
  );
}
