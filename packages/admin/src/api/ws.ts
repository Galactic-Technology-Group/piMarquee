import { useEffect, useRef, useState } from 'react';
import type { ConfigScope, ServerMessage, StatusSnapshot } from '@pimarquee/shared';

type Listener = (scope: ConfigScope) => void;
const listeners = new Set<Listener>();

/** Subscribe to config change notifications (fired for every scope). */
export function onConfigChanged(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let socket: WebSocket | null = null;
let statusListeners = new Set<(s: StatusSnapshot) => void>();
let connListeners = new Set<(open: boolean) => void>();
let lastStatus: StatusSnapshot | null = null;
let connected = false;

function ensureSocket(): void {
  if (socket) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws?role=admin`);
  socket = ws;
  ws.onopen = () => {
    connected = true;
    connListeners.forEach((l) => l(true));
    ws.send(JSON.stringify({ type: 'hello', role: 'admin', userAgent: navigator.userAgent }));
  };
  ws.onmessage = (ev) => {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(ev.data as string) as ServerMessage;
    } catch {
      return;
    }
    if (msg.type === 'config.changed') listeners.forEach((l) => l(msg.scope));
    if (msg.type === 'status') {
      lastStatus = msg.status;
      statusListeners.forEach((l) => l(msg.status));
    }
  };
  ws.onclose = () => {
    socket = null;
    connected = false;
    connListeners.forEach((l) => l(false));
    setTimeout(ensureSocket, 3000);
  };
  ws.onerror = () => ws.close();
}

export function useServerStatus(): { status: StatusSnapshot | null; connected: boolean } {
  const [status, setStatus] = useState<StatusSnapshot | null>(lastStatus);
  const [conn, setConn] = useState(connected);
  useEffect(() => {
    ensureSocket();
    statusListeners.add(setStatus);
    connListeners.add(setConn);
    return () => {
      statusListeners.delete(setStatus);
      connListeners.delete(setConn);
    };
  }, []);
  return { status, connected: conn };
}

/** Re-run `fn` whenever any of the given scopes change on the server. */
export function useConfigChange(scopes: ConfigScope[], fn: () => void): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    ensureSocket();
    return onConfigChanged((scope) => {
      if (scope === 'all' || scopes.includes(scope)) ref.current();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopes.join(',')]);
}
