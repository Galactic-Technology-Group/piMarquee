import type { Widget } from '@pimarquee/shared';
import { FONT_FAMILIES } from '@pimarquee/shared';
import type { CameraView } from '../api/client';
import { useEditor } from '../store';

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function Num({ value, onChange, min, max, step = 1 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
    />
  );
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}

export function PropertiesPanel({ cameras }: { cameras: CameraView[] }) {
  const layout = useEditor((s) => s.layout);
  const selectedId = useEditor((s) => s.selectedId);
  const updateWidget = useEditor((s) => s.updateWidget);
  const mutate = useEditor((s) => s.mutate);
  const removeWidget = useEditor((s) => s.removeWidget);
  const bringForward = useEditor((s) => s.bringForward);
  const sendBackward = useEditor((s) => s.sendBackward);

  if (!layout) return null;
  const widget = layout.widgets.find((w) => w.id === selectedId);

  if (!widget) {
    return (
      <div className="props">
        <h3>Layout</h3>
        <Field label="Name">
          <input
            value={layout.name}
            onChange={(e) =>
              mutate((d) => {
                d.name = e.target.value;
              })
            }
          />
        </Field>
        <Field label="Background">
          <div className="row">
            <input
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(layout.background) ? layout.background : '#000000'}
              onChange={(e) =>
                mutate((d) => {
                  d.background = e.target.value;
                })
              }
            />
            <input
              value={layout.background}
              onChange={(e) =>
                mutate((d) => {
                  d.background = e.target.value;
                })
              }
            />
          </div>
        </Field>
        <p className="muted">Select a widget on the canvas to edit it, or add one from the toolbar.</p>
      </div>
    );
  }

  const set = <K extends keyof Widget>(key: K, value: Widget[K]) => updateWidget(widget.id, { [key]: value } as Partial<Widget>);
  const setAny = (key: string, value: unknown) => updateWidget(widget.id, { [key]: value } as Partial<Widget>);
  const rect = widget.rect;
  const setRect = (patch: Partial<typeof rect>) => set('rect', { ...rect, ...patch });

  return (
    <div className="props">
      <h3>
        {widget.type} widget
        <button className="icon-btn danger" title="Delete (Del)" onClick={() => removeWidget(widget.id)}>
          🗑
        </button>
      </h3>
      <Field label="Name">
        <input value={widget.name} onChange={(e) => set('name', e.target.value)} />
      </Field>
      <div className="grid2">
        <Field label="X %">
          <Num value={rect.x} min={0} max={100} step={0.5} onChange={(v) => setRect({ x: v })} />
        </Field>
        <Field label="Y %">
          <Num value={rect.y} min={0} max={100} step={0.5} onChange={(v) => setRect({ y: v })} />
        </Field>
        <Field label="Width %">
          <Num value={rect.w} min={0.5} max={100} step={0.5} onChange={(v) => setRect({ w: v })} />
        </Field>
        <Field label="Height %">
          <Num value={rect.h} min={0.5} max={100} step={0.5} onChange={(v) => setRect({ h: v })} />
        </Field>
      </div>
      <div className="row">
        <button onClick={() => sendBackward(widget.id)} title="Send backward ([)">
          ⬇ Back
        </button>
        <button onClick={() => bringForward(widget.id)} title="Bring forward (])">
          ⬆ Front
        </button>
        <span className="muted">z = {widget.z}</span>
      </div>
      <div className="grid2">
        <Field label="Opacity">
          <Num value={widget.opacity} min={0} max={1} step={0.05} onChange={(v) => set('opacity', v)} />
        </Field>
        <Field label="Corner radius">
          <Num value={widget.borderRadius} min={0} max={50} step={0.5} onChange={(v) => set('borderRadius', v)} />
        </Field>
      </div>
      <Field label="Background" hint="CSS colour, e.g. transparent, #222, rgba(0,0,0,.5)">
        <input value={widget.background} onChange={(e) => set('background', e.target.value)} />
      </Field>
      <Check checked={widget.visible} onChange={(v) => set('visible', v)} label="Visible" />

      <hr />

      {widget.type === 'camera' && (
        <>
          <Field label="Camera">
            <select value={widget.cameraId} onChange={(e) => setAny('cameraId', e.target.value)}>
              <option value="">— choose —</option>
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.enabled ? '' : ' (disabled)'}
                </option>
              ))}
            </select>
          </Field>
          {cameras.length === 0 && <p className="muted">No cameras yet. Add one on the Cameras page.</p>}
          <div className="grid2">
            <Field label="Fit">
              <select value={widget.fit} onChange={(e) => setAny('fit', e.target.value)}>
                <option value="cover">Cover (crop)</option>
                <option value="contain">Contain (letterbox)</option>
              </select>
            </Field>
            <Field label="Mode">
              <select value={widget.mode} onChange={(e) => setAny('mode', e.target.value)}>
                <option value="auto">Auto (settings default)</option>
                <option value="webrtc">WebRTC (lowest latency)</option>
                <option value="mse">MSE</option>
                <option value="mjpeg">MJPEG (lowest CPU on Pi)</option>
              </select>
            </Field>
          </div>
          <Field label="Priority" hint="Lower numbers keep their stream first when the limit is hit.">
            <Num value={widget.priority} min={0} max={1000} onChange={(v) => setAny('priority', v)} />
          </Field>
          <Check checked={widget.showLabel} onChange={(v) => setAny('showLabel', v)} label="Show camera name" />
          <Check checked={widget.muted} onChange={(v) => setAny('muted', v)} label="Muted" />
        </>
      )}

      {widget.type === 'webpage' && (
        <>
          <Field label="URL">
            <input value={widget.url} onChange={(e) => setAny('url', e.target.value)} />
          </Field>
          <div className="grid2">
            <Field label="Refresh (s)" hint="blank = never">
              <input
                type="number"
                min={5}
                value={widget.refreshIntervalSec ?? ''}
                onChange={(e) => setAny('refreshIntervalSec', e.target.value === '' ? null : Number(e.target.value))}
              />
            </Field>
            <Field label="Zoom">
              <Num value={widget.zoom} min={0.25} max={4} step={0.05} onChange={(v) => setAny('zoom', v)} />
            </Field>
          </div>
          <Check checked={widget.allowScripts} onChange={(v) => setAny('allowScripts', v)} label="Allow scripts" />
          <Check checked={widget.stripFrameHeaders} onChange={(v) => setAny('stripFrameHeaders', v)} label="Proxy through server (strip X-Frame-Options)" />
          <p className="muted small">
            Many sites refuse to load inside a frame. The proxy helps with simple dashboards; sites that need logins or load assets from other
            domains may still break.
          </p>
          <p className="muted small">
            The live preview uses this browser's logins, certificates and name resolution; the display is a separate browser on the Pi with none of
            them. Use an IP address, plain HTTP on the LAN, and a login method that needs no keyboard (see docs/home-assistant.md for Home
            Assistant).
          </p>
        </>
      )}

      {widget.type === 'text' && (
        <>
          <Field label="Text">
            <textarea rows={6} value={widget.content} onChange={(e) => setAny('content', e.target.value)} />
          </Field>
          <FontFields widget={widget} setAny={setAny} />
          <div className="grid2">
            <Field label="Horizontal">
              <select value={widget.align} onChange={(e) => setAny('align', e.target.value)}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </Field>
            <Field label="Vertical">
              <select value={widget.valign} onChange={(e) => setAny('valign', e.target.value)}>
                <option value="top">Top</option>
                <option value="middle">Middle</option>
                <option value="bottom">Bottom</option>
              </select>
            </Field>
          </div>
          <div className="row">
            <Check checked={widget.bold} onChange={(v) => setAny('bold', v)} label="Bold" />
            <Check checked={widget.italic} onChange={(v) => setAny('italic', v)} label="Italic" />
          </div>
          <Field label="Padding (% height)">
            <Num value={widget.padding} min={0} max={20} step={0.5} onChange={(v) => setAny('padding', v)} />
          </Field>
        </>
      )}

      {widget.type === 'clock' && (
        <>
          <div className="row">
            <Check checked={widget.showTime} onChange={(v) => setAny('showTime', v)} label="Time" />
            <Check checked={widget.showDate} onChange={(v) => setAny('showDate', v)} label="Date" />
            <Check checked={widget.showSeconds} onChange={(v) => setAny('showSeconds', v)} label="Seconds" />
            <Check checked={widget.hour12} onChange={(v) => setAny('hour12', v)} label="12-hour" />
          </div>
          <div className="grid2">
            <Field label="Date format">
              <select value={widget.dateFormat} onChange={(e) => setAny('dateFormat', e.target.value)}>
                <option value="long">Monday, January 5, 2026</option>
                <option value="short">Mon, Jan 5</option>
                <option value="numeric">01/05/2026</option>
              </select>
            </Field>
            <Field label="Align">
              <select value={widget.align} onChange={(e) => setAny('align', e.target.value)}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </Field>
          </div>
          <div className="grid2">
            <Field label="Time zone" hint="blank = settings default">
              <input value={widget.timezone ?? ''} placeholder="e.g. America/New_York" onChange={(e) => setAny('timezone', e.target.value || null)} />
            </Field>
            <Field label="Locale" hint="blank = settings default">
              <input value={widget.locale ?? ''} placeholder="e.g. en-US" onChange={(e) => setAny('locale', e.target.value || null)} />
            </Field>
          </div>
          <FontFields widget={widget} setAny={setAny} />
        </>
      )}
    </div>
  );
}

function FontFields({ widget, setAny }: { widget: Extract<Widget, { fontFamily: string }>; setAny: (k: string, v: unknown) => void }) {
  return (
    <div className="grid2">
      <Field label="Font">
        <select value={widget.fontFamily} onChange={(e) => setAny('fontFamily', e.target.value)}>
          {FONT_FAMILIES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
          {!FONT_FAMILIES.includes(widget.fontFamily as (typeof FONT_FAMILIES)[number]) && <option value={widget.fontFamily}>{widget.fontFamily}</option>}
        </select>
      </Field>
      <Field label="Size (% of height)">
        <Num value={widget.fontSize} min={0.5} max={50} step={0.5} onChange={(v) => setAny('fontSize', v)} />
      </Field>
      <Field label="Colour">
        <div className="row">
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(widget.color) ? widget.color : '#ffffff'} onChange={(e) => setAny('color', e.target.value)} />
          <input value={widget.color} onChange={(e) => setAny('color', e.target.value)} />
        </div>
      </Field>
    </div>
  );
}
