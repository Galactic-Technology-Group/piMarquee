import { useCallback, useEffect, useState } from 'react';
import { api, type PiView, type SettingsView } from '../api/client';
import { useConfigChange, useServerStatus } from '../api/ws';

export function SettingsPage() {
  const [s, setS] = useState<SettingsView | null>(null);
  const [pi, setPi] = useState<PiView | null>(null);
  const [auth, setAuth] = useState<{ enabled: boolean } | null>(null);
  const [tokens, setTokens] = useState<{ id: string; name: string; createdAt: string; lastUsedAt: string | null }[]>([]);
  const [newToken, setNewToken] = useState<{ name: string; token: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mqttPassword, setMqttPassword] = useState('');
  const [password, setPassword] = useState('');
  const [tokenName, setTokenName] = useState('');
  const { status } = useServerStatus();

  const refresh = useCallback(() => {
    Promise.all([api.settings.get(), api.settings.pi(), api.auth.status(), api.auth.tokens()])
      .then(([settings, p, a, t]) => {
        setS(settings);
        setPi(p);
        setAuth({ enabled: a.enabled });
        setTokens(t);
      })
      .catch((e) => setError((e as Error).message));
  }, []);
  useEffect(refresh, [refresh]);
  useConfigChange(['settings', 'auth'], refresh);

  if (!s || !pi) return <div className="page">Loading…</div>;

  const save = (patch: Record<string, unknown>, note = 'Saved') =>
    api.settings
      .update(patch)
      .then((n) => {
        setS(n);
        setMsg(note);
        setError(null);
        setTimeout(() => setMsg(null), 2000);
      })
      .catch((e) => setError((e as Error).message));

  const field = (label: string, input: React.ReactNode, hint?: string) => (
    <label className="field">
      <span className="field-label">{label}</span>
      {input}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );

  return (
    <div className="page">
      <div className="page-head">
        <h2>Settings</h2>
        {msg && <span className="badge ok">{msg}</span>}
      </div>
      {error && (
        <div className="error-bar" onClick={() => setError(null)}>
          {error}
        </div>
      )}

      <div className="card">
        <h3>Hardware</h3>
        <p>
          Detected: <b>{pi.modelString}</b>
          {pi.ramMB ? ` · ${Math.round(pi.ramMB / 1024)} GB RAM` : ''} · {pi.familyLabel} → default limit <b>{pi.defaultMaxStreams}</b> concurrent
          camera streams.
        </p>
        {status && (
          <p className="small muted">
            CPU {status.cpuTempC ?? '–'} °C · load {status.load1?.toFixed(2) ?? '–'} · memory {status.memUsedMB}/{status.memTotalMB} MB · go2rtc{' '}
            {status.go2rtc.reachable ? `OK (${status.go2rtc.streams} streams)` : 'unreachable'} · up {Math.round(status.uptimeSec / 60)} min
            {status.throttled && status.throttled !== '0x0' ? ` · throttled ${status.throttled}` : ''}
          </p>
        )}
        <div className="grid2">
          {field(
            'Max concurrent streams',
            <input
              type="number"
              min={0}
              max={16}
              value={s.maxStreamsOverride ?? ''}
              placeholder={`${pi.defaultMaxStreams} (detected)`}
              onChange={(e) => setS({ ...s, maxStreamsOverride: e.target.value === '' ? null : Number(e.target.value) })}
              onBlur={() => save({ maxStreamsOverride: s.maxStreamsOverride })}
            />,
            'Blank = use the detected default. Each camera widget on screen is one decode; watch the CPU temperature if you raise this.',
          )}
          {field(
            'Default stream mode',
            <select value={s.defaultStreamMode} onChange={(e) => save({ defaultStreamMode: e.target.value })}>
              <option value="webrtc">WebRTC (lowest latency)</option>
              <option value="mse">MSE (more tolerant)</option>
              <option value="mjpeg">MJPEG (lowest CPU, higher bandwidth)</option>
            </select>,
          )}
        </div>
      </div>

      <div className="card">
        <h3>Display</h3>
        <div className="grid2">
          {field('Display name', <input value={s.displayName} onChange={(e) => setS({ ...s, displayName: e.target.value })} onBlur={() => save({ displayName: s.displayName })} />, 'Shown in Home Assistant and on the network.')}
          {field(
            'Canvas aspect',
            <select
              value={s.canvas.aspect}
              onChange={(e) => {
                const aspect = e.target.value as SettingsView['canvas']['aspect'];
                const dims = { '16:9': [1920, 1080], '9:16': [1080, 1920], '4:3': [1600, 1200], '21:9': [2560, 1080], custom: [s.canvas.width, s.canvas.height] }[aspect]!;
                save({ canvas: { aspect, width: dims[0], height: dims[1] } });
              }}
            >
              <option value="16:9">16:9 landscape</option>
              <option value="9:16">9:16 portrait</option>
              <option value="4:3">4:3</option>
              <option value="21:9">21:9 ultrawide</option>
              <option value="custom">Custom</option>
            </select>,
            'Only affects the editor canvas shape; the display always fills its screen.',
          )}
          {s.canvas.aspect === 'custom' && (
            <>
              {field('Width', <input type="number" value={s.canvas.width} onChange={(e) => setS({ ...s, canvas: { ...s.canvas, width: Number(e.target.value) } })} onBlur={() => save({ canvas: s.canvas })} />)}
              {field('Height', <input type="number" value={s.canvas.height} onChange={(e) => setS({ ...s, canvas: { ...s.canvas, height: Number(e.target.value) } })} onBlur={() => save({ canvas: s.canvas })} />)}
            </>
          )}
          {field('Time zone', <input value={s.timezone} placeholder="America/New_York" onChange={(e) => setS({ ...s, timezone: e.target.value })} onBlur={() => save({ timezone: s.timezone })} />)}
          {field('Locale', <input value={s.locale} placeholder="en-US" onChange={(e) => setS({ ...s, locale: e.target.value })} onBlur={() => save({ locale: s.locale })} />)}
          {field(
            'Display power method',
            <select value={s.displayPowerMethod} onChange={(e) => save({ displayPowerMethod: e.target.value })}>
              <option value="auto">Auto (compositor, then CEC, then software)</option>
              <option value="wlr-randr">Compositor output off (wlr-randr)</option>
              <option value="cec">HDMI-CEC standby</option>
              <option value="software">Software blackout only</option>
            </select>,
          )}
          {field(
            'Auto-reload every (hours)',
            <input type="number" min={0} max={168} value={s.autoReloadHours} onChange={(e) => setS({ ...s, autoReloadHours: Number(e.target.value) })} onBlur={() => save({ autoReloadHours: s.autoReloadHours })} />,
            '0 = off. Reloads the kiosk page periodically to keep Chromium healthy on long runs.',
          )}
        </div>
        <label className="check">
          <input type="checkbox" checked={s.hideCursor} onChange={(e) => save({ hideCursor: e.target.checked })} /> Hide the mouse pointer on the display
        </label>
        <p className="small muted">
          Keeps the pointer hidden even over embedded web pages. Turn it off only if the display has a touchscreen or mouse that should interact with
          those pages.
        </p>
        <div className="row">
          <button onClick={() => api.display.reload(false)}>Reload page</button>
          <button disabled={!pi.systemControl} onClick={() => api.settings.restart('kiosk').catch((e) => setError((e as Error).message))}>
            Restart kiosk browser
          </button>
          <button disabled={!pi.systemControl} onClick={() => api.settings.restart('go2rtc').catch((e) => setError((e as Error).message))}>
            Restart go2rtc
          </button>
          <button
            disabled={!pi.systemControl}
            className="danger"
            onClick={() => {
              if (confirm('Reboot the Raspberry Pi?')) api.settings.reboot().catch((e) => setError((e as Error).message));
            }}
          >
            Reboot Pi
          </button>
          {!pi.systemControl && <span className="muted small">Service control is only available on the Pi.</span>}
        </div>
      </div>

      <div className="card">
        <h3>Home Assistant (MQTT)</h3>
        <p className="small muted">
          When enabled the display appears in Home Assistant as a device with a layout selector, power switch, reload button, one text entity per text
          widget, and health sensors (via MQTT discovery).
        </p>
        <label className="check">
          <input type="checkbox" checked={s.mqtt.enabled} onChange={(e) => save({ mqtt: { enabled: e.target.checked } })} /> Enable MQTT
        </label>
        <div className="grid2">
          {field('Broker URL', <input value={s.mqtt.url} placeholder="mqtt://homeassistant.local:1883" onChange={(e) => setS({ ...s, mqtt: { ...s.mqtt, url: e.target.value } })} onBlur={() => save({ mqtt: { url: s.mqtt.url } })} />)}
          {field('Username', <input value={s.mqtt.username} onChange={(e) => setS({ ...s, mqtt: { ...s.mqtt, username: e.target.value } })} onBlur={() => save({ mqtt: { username: s.mqtt.username } })} />)}
          {field(
            'Password',
            <input type="password" value={mqttPassword} placeholder={s.mqtt.hasPassword ? '(set — leave blank to keep)' : ''} onChange={(e) => setMqttPassword(e.target.value)} onBlur={() => mqttPassword && save({ mqtt: { password: mqttPassword } }).then(() => setMqttPassword(''))} />,
          )}
          {field('Base topic', <input value={s.mqtt.baseTopic} onChange={(e) => setS({ ...s, mqtt: { ...s.mqtt, baseTopic: e.target.value } })} onBlur={() => save({ mqtt: { baseTopic: s.mqtt.baseTopic } })} />)}
          {field('Discovery prefix', <input value={s.mqtt.discoveryPrefix} onChange={(e) => setS({ ...s, mqtt: { ...s.mqtt, discoveryPrefix: e.target.value } })} onBlur={() => save({ mqtt: { discoveryPrefix: s.mqtt.discoveryPrefix } })} />)}
        </div>
        {status && <p className="small muted">Status: {status.mqtt.enabled ? (status.mqtt.connected ? 'connected' : 'not connected') : 'disabled'}</p>}
      </div>

      <div className="card">
        <h3>Security</h3>
        <p className="small muted">
          Without a password anyone on your network can change the display. The kiosk itself always connects from localhost and never needs a
          password. API tokens are for the Android app and other integrations.
        </p>
        <div className="row">
          <input type="password" placeholder={auth?.enabled ? 'New admin password' : 'Set an admin password'} value={password} onChange={(e) => setPassword(e.target.value)} />
          <button
            className="primary"
            disabled={!password}
            onClick={() =>
              api.auth
                .setPassword(password)
                .then(() => {
                  setPassword('');
                  setMsg('Password set');
                  refresh();
                })
                .catch((e) => setError((e as Error).message))
            }
          >
            Set password
          </button>
          {auth?.enabled && (
            <button
              className="danger"
              onClick={() => {
                if (confirm('Disable the admin password?')) api.auth.setPassword(null).then(refresh);
              }}
            >
              Disable password
            </button>
          )}
        </div>
        <h4>API tokens</h4>
        <div className="row">
          <input placeholder="Token name (e.g. Android phone)" value={tokenName} onChange={(e) => setTokenName(e.target.value)} />
          <button
            disabled={!tokenName}
            onClick={() =>
              api.auth
                .createToken(tokenName)
                .then((t) => {
                  setNewToken({ name: t.name, token: t.token });
                  setTokenName('');
                  refresh();
                })
                .catch((e) => setError((e as Error).message))
            }
          >
            Create token
          </button>
        </div>
        {newToken && (
          <div className="token-box">
            <b>{newToken.name}</b> — copy this now, it will not be shown again:
            <code className="mono">{newToken.token}</code>
            <div className="small muted">Use it as <code>Authorization: Bearer &lt;token&gt;</code> or <code>?token=</code> on the WebSocket.</div>
            <button onClick={() => setNewToken(null)}>Dismiss</button>
          </div>
        )}
        <table className="table">
          <tbody>
            {tokens.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td className="small muted">created {new Date(t.createdAt).toLocaleDateString()}</td>
                <td className="small muted">{t.lastUsedAt ? `last used ${new Date(t.lastUsedAt).toLocaleString()}` : 'never used'}</td>
                <td className="right">
                  <button className="danger" onClick={() => api.auth.deleteToken(t.id).then(refresh)}>
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Backup</h3>
        <div className="row">
          <a className="btn" href="/api/v1/config" download="pimarquee-config.json">
            Export config
          </a>
          <label className="btn">
            Import config
            <input
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                f.text()
                  .then((txt) => api.put('/api/v1/config', JSON.parse(txt)))
                  .then(() => {
                    setMsg('Config imported');
                    refresh();
                  })
                  .catch((er) => setError(`Import failed: ${(er as Error).message}`));
              }}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
