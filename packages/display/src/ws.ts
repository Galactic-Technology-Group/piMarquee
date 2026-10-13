import type { ClientMessage, ServerMessage } from '@pimarquee/shared';

export type WsStatus = 'connecting' | 'open' | 'closed';

/** Reconnecting WebSocket client with exponential backoff and a heartbeat. */
export class PiMarqueeSocket {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private timer: number | null = null;
  private heartbeat: number | null = null;
  private stopped = false;

  constructor(
    private readonly url: string,
    private readonly hello: () => ClientMessage,
    private readonly onMessage: (msg: ServerMessage) => void,
    private readonly onStatus: (s: WsStatus) => void,
  ) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) window.clearTimeout(this.timer);
    if (this.heartbeat) window.clearInterval(this.heartbeat);
    this.ws?.close();
    this.ws = null;
  }

  private connect(): void {
    if (this.stopped) return;
    this.onStatus('connecting');
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.onStatus('open');
      ws.send(JSON.stringify(this.hello()));
      this.heartbeat = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
      }, 20000);
    };
    ws.onmessage = (ev) => {
      try {
        this.onMessage(JSON.parse(ev.data as string) as ServerMessage);
      } catch {
        /* ignore malformed */
      }
    };
    ws.onclose = () => {
      if (this.heartbeat) window.clearInterval(this.heartbeat);
      this.heartbeat = null;
      this.ws = null;
      this.onStatus('closed');
      this.scheduleReconnect();
    };
    ws.onerror = () => ws.close();
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    const delay = Math.min(30000, 1000 * 2 ** Math.min(this.attempt, 5));
    this.attempt += 1;
    this.timer = window.setTimeout(() => this.connect(), delay);
  }
}

export function wsUrl(role: 'display' | 'admin'): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws?role=${role}`;
}
