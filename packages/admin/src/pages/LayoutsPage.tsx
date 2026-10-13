import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type LayoutSummary } from '../api/client';
import { useConfigChange, useServerStatus } from '../api/ws';

export function LayoutsPage() {
  const [layouts, setLayouts] = useState<LayoutSummary[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [power, setPower] = useState<'on' | 'off'>('on');
  const nav = useNavigate();
  const { status } = useServerStatus();

  const refresh = useCallback(() => {
    api.layouts.list().then(setLayouts).catch((e) => setError((e as Error).message));
    api.display.get().then((d) => setPower(d.power)).catch(() => undefined);
  }, []);
  useEffect(refresh, [refresh]);
  useConfigChange(['layouts', 'display'], refresh);

  const run = (p: Promise<unknown>) => p.then(refresh).catch((e) => setError((e as Error).message));

  return (
    <div className="page">
      <div className="page-head">
        <h2>Layouts</h2>
        <div className="row">
          <span className="muted small">
            Display: {status ? `${status.display.connected} connected` : '…'}
            {status?.display.resolution ? ` · ${status.display.resolution.w}×${status.display.resolution.h}` : ''}
          </span>
          <button onClick={() => run(api.display.power(power !== 'on'))}>{power === 'on' ? '⏻ Turn display off' : '⏻ Turn display on'}</button>
          <button onClick={() => run(api.display.reload())}>↻ Reload display</button>
        </div>
      </div>
      {error && (
        <div className="error-bar" onClick={() => setError(null)}>
          {error}
        </div>
      )}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          api.layouts
            .create(name.trim())
            .then((l) => {
              setName('');
              nav(`/layouts/${l.id}`);
            })
            .catch((er) => setError((er as Error).message));
        }}
      >
        <input placeholder="New layout name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="primary" type="submit">
          + Create
        </button>
      </form>
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Widgets</th>
            <th>Cameras</th>
            <th>Updated</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {layouts.map((l) => (
            <tr key={l.id} className={l.isActive ? 'active-row' : ''}>
              <td>
                <Link to={`/layouts/${l.id}`}>{l.name}</Link> {l.isActive && <span className="badge live">LIVE</span>}
              </td>
              <td>{l.widgetCount}</td>
              <td>{l.cameraWidgets}</td>
              <td className="muted small">{new Date(l.updatedAt).toLocaleString()}</td>
              <td className="row right">
                {!l.isActive && <button onClick={() => run(api.layouts.activate(l.id))}>Show on display</button>}
                <button onClick={() => run(api.layouts.duplicate(l.id))}>Duplicate</button>
                <button
                  className="danger"
                  onClick={() => {
                    if (confirm(`Delete layout "${l.name}"?`)) run(api.layouts.remove(l.id));
                  }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {layouts.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No layouts yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
