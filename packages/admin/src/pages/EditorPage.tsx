import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { defaultWidget, newId, type WidgetType } from '@pimarquee/shared';
import { api, type CameraView, type PiView } from '../api/client';
import { useConfigChange } from '../api/ws';
import { useEditor } from '../store';
import { EditorCanvas } from '../editor/Canvas';
import { PropertiesPanel } from '../editor/PropertiesPanel';
import { displayPreviewUrl } from '../preview';

const SAVE_DEBOUNCE_MS = 500;

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const layout = useEditor((s) => s.layout);
  const dirty = useEditor((s) => s.dirty);
  const load = useEditor((s) => s.load);
  const markSaved = useEditor((s) => s.markSaved);
  const addWidget = useEditor((s) => s.addWidget);
  const selectedId = useEditor((s) => s.selectedId);
  const removeWidget = useEditor((s) => s.removeWidget);
  const duplicateWidget = useEditor((s) => s.duplicateWidget);
  const updateWidget = useEditor((s) => s.updateWidget);
  const bringForward = useEditor((s) => s.bringForward);
  const sendBackward = useEditor((s) => s.sendBackward);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);

  const [cameras, setCameras] = useState<CameraView[]>([]);
  const [pi, setPi] = useState<PiView | null>(null);
  const [aspect, setAspect] = useState(16 / 9);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [snap, setSnap] = useState(true);
  const [grid, setGrid] = useState(false);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Initial load.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    Promise.all([api.layouts.get(id), api.cameras.list(), api.settings.pi(), api.settings.get(), api.display.get()])
      .then(([l, cams, p, s, d]) => {
        if (cancelled) return;
        load(l);
        setCameras(cams);
        setPi(p);
        setAspect(s.canvas.width / s.canvas.height);
        setActiveId(d.activeLayoutId);
      })
      .catch((e) => setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [id, load]);

  const refreshMeta = useCallback(() => {
    void api.cameras.list().then(setCameras);
    void api.settings.pi().then(setPi);
    void api.display.get().then((d) => setActiveId(d.activeLayoutId));
  }, []);
  useConfigChange(['cameras', 'settings', 'display'], refreshMeta);

  // Debounced autosave.
  const saveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!dirty || !layout) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      setSaving(true);
      api.layouts
        .save(layout.id, { name: layout.name, background: layout.background, widgets: layout.widgets })
        .then(() => {
          markSaved();
          setError(null);
        })
        .catch((e) => setError(`Save failed: ${(e as Error).message}`))
        .finally(() => setSaving(false));
    }, SAVE_DEBOUNCE_MS);
  }, [layout, dirty, markSaved]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if ((mod && e.key.toLowerCase() === 'y') || (mod && e.shiftKey && e.key.toLowerCase() === 'z')) {
        e.preventDefault();
        redo();
        return;
      }
      if (!selectedId) return;
      const w = useEditor.getState().layout?.widgets.find((x) => x.id === selectedId);
      if (!w) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeWidget(selectedId);
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateWidget(selectedId, newId());
      } else if (e.key === ']') {
        bringForward(selectedId);
      } else if (e.key === '[') {
        sendBackward(selectedId);
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 0.25;
        const r = { ...w.rect };
        if (e.key === 'ArrowLeft') r.x = Math.max(0, r.x - step);
        if (e.key === 'ArrowRight') r.x = Math.min(100 - r.w, r.x + step);
        if (e.key === 'ArrowUp') r.y = Math.max(0, r.y - step);
        if (e.key === 'ArrowDown') r.y = Math.min(100 - r.h, r.y + step);
        updateWidget(selectedId, { rect: r });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, undo, redo, removeWidget, duplicateWidget, updateWidget, bringForward, sendBackward]);

  const add = (type: WidgetType) => {
    const rect = type === 'clock' ? { x: 30, y: 30, w: 40, h: 20 } : { x: 25, y: 25, w: 50, h: 50 };
    const extra: Record<string, unknown> = type === 'camera' ? { cameraId: cameras[0]?.id ?? '' } : {};
    if (type === 'camera' && !cameras[0]) {
      setError('Add a camera on the Cameras page first.');
      return;
    }
    addWidget(defaultWidget(type, rect, extra));
  };

  if (error && !layout) return <div className="page error">{error}</div>;
  if (!layout) return <div className="page">Loading…</div>;

  const cameraWidgets = layout.widgets.filter((w) => w.type === 'camera' && w.visible).length;
  const max = pi?.effectiveMaxStreams ?? 0;
  const overLimit = cameraWidgets > max;
  const isActive = activeId === layout.id;

  return (
    <div className="editor">
      <div className="toolbar">
        <Link to="/" className="btn ghost">
          ← Layouts
        </Link>
        <strong className="title">{layout.name}</strong>
        {isActive && <span className="badge live">LIVE</span>}
        <span className="sep" />
        <span className="muted">Add:</span>
        <button onClick={() => add('camera')}>📷 Camera</button>
        <button onClick={() => add('webpage')}>🌐 Web page</button>
        <button onClick={() => add('text')}>🅣 Text</button>
        <button onClick={() => add('clock')}>🕒 Clock</button>
        <span className="sep" />
        <button disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)">
          ↶
        </button>
        <button disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Y)">
          ↷
        </button>
        <label className="check">
          <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Snap
        </label>
        <label className="check">
          <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> Grid
        </label>
        <label className="check">
          <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} /> Live preview
        </label>
        <span className="spacer" />
        <span className={`badge ${overLimit ? 'warn' : ''}`} title="Camera widgets vs. concurrent stream limit">
          Streams {cameraWidgets} / {max}
        </span>
        <span className="muted small">{saving ? 'Saving…' : dirty ? 'Unsaved' : 'Saved'}</span>
        {!isActive && (
          <button
            className="primary"
            onClick={() =>
              api.layouts
                .activate(layout.id)
                .then(() => setActiveId(layout.id))
                .catch((e) => setError((e as Error).message))
            }
          >
            Show on display
          </button>
        )}
      </div>
      {error && (
        <div className="error-bar" onClick={() => setError(null)}>
          {error}
        </div>
      )}
      <div className="editor-body">
        <div className="editor-main">
          {preview ? (
            <div className="stage-wrap">
              <iframe className="preview-frame" title="preview" src={displayPreviewUrl(layout.id)} style={{ aspectRatio: `${aspect}` }} />
            </div>
          ) : (
            <EditorCanvas aspect={aspect} snap={snap} grid={grid} />
          )}
        </div>
        <aside className="editor-side">
          <PropertiesPanel cameras={cameras} />
          <div className="props muted small">
            <p>
              <b>Shortcuts:</b> arrows nudge (Shift = 1%), Del remove, Ctrl+D duplicate, Ctrl+Z/Y undo/redo, [ ] z-order. Hold Shift while dragging
              to disable snapping.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
