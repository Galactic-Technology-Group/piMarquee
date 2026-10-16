import { useEffect, useRef, useState } from 'react';
import type { ResolvedLayout, ServerMessage } from '@pimarquee/shared';
import { PiMarqueeSocket, wsUrl, type WsStatus } from './ws';
import { Canvas } from './Canvas';

const params = new URLSearchParams(location.search);
/** Admin preview: ?preview=<layoutId> renders that layout instead of the active one. */
const previewLayoutId = params.get('preview');
const isPreview = previewLayoutId !== null;

async function fetchResolved(): Promise<ResolvedLayout> {
  const q = isPreview ? `?layoutId=${encodeURIComponent(previewLayoutId)}` : '';
  const r = await fetch(`/api/v1/display/resolved${q}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as ResolvedLayout;
}

export function App() {
  const [resolved, setResolved] = useState<ResolvedLayout | null>(null);
  const [status, setStatus] = useState<WsStatus>('connecting');
  const [blackout, setBlackout] = useState(false);
  const loadedAt = useRef(Date.now());

  // Initial load + WebSocket live updates.
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchResolved()
        .then((r) => {
          if (cancelled) return;
          setResolved(r);
          setBlackout(r.power === 'off');
        })
        .catch(() => undefined);
    void load();

    const onMessage = (msg: ServerMessage) => {
      switch (msg.type) {
        case 'display.resolved':
          if (isPreview) {
            void load();
          } else {
            setResolved(msg.resolved);
            setBlackout(msg.resolved.power === 'off');
          }
          break;
        case 'config.changed':
          void load();
          break;
        case 'display.power':
          setBlackout(!msg.on);
          break;
        case 'display.reload':
          location.reload();
          break;
        default:
          break;
      }
    };

    const sock = new PiMarqueeSocket(
      wsUrl(isPreview ? 'admin' : 'display'),
      () => ({
        type: 'hello',
        role: isPreview ? 'admin' : 'display',
        resolution: { w: window.screen.width, h: window.screen.height },
        userAgent: navigator.userAgent,
      }),
      onMessage,
      (s) => {
        setStatus(s);
        if (s === 'open') void load(); // refetch after a reconnect
      },
    );
    sock.start();
    return () => {
      cancelled = true;
      sock.stop();
    };
  }, []);

  // Optional periodic reload to purge Chromium leaks on long-running kiosks.
  useEffect(() => {
    if (!resolved || isPreview) return;
    const hours = resolved.autoReloadHours;
    if (!hours) return;
    const id = window.setInterval(() => {
      if (Date.now() - loadedAt.current > hours * 3600 * 1000) location.reload();
    }, 60000);
    return () => window.clearInterval(id);
  }, [resolved?.autoReloadHours]);

  // Keep the screen awake where the browser supports it.
  useEffect(() => {
    if (isPreview) return;
    let lock: { release: () => Promise<void> } | null = null;
    const request = async () => {
      try {
        lock = await (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null;
      } catch {
        /* unsupported or denied */
      }
    };
    void request();
    const onVis = () => {
      if (document.visibilityState === 'visible') void request();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release();
    };
  }, []);

  return (
    <>
      {resolved?.layout ? (
        <Canvas layout={resolved.layout} timezone={resolved.timezone} locale={resolved.locale} />
      ) : (
        <div className="empty">{resolved ? 'No active layout' : 'Connecting…'}</div>
      )}
      {resolved?.hideCursor && !isPreview && <div className="cursor-shield" aria-hidden="true" />}
      {blackout && !isPreview && <div className="blackout" />}
      {status !== 'open' && <div className="offline-badge" title="Disconnected from server" />}
    </>
  );
}
