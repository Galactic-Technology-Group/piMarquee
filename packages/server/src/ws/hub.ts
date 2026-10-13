import type { WebSocket } from 'ws';
import { ClientMessageSchema, type ServerMessage, type WsRole } from '@pimarquee/shared';

export interface WsClient {
  socket: WebSocket;
  role: WsRole;
  resolution: { w: number; h: number } | null;
  userAgent: string | null;
  alive: boolean;
}

/** Connection registry with role-based broadcast. */
export class WsHub {
  private clients = new Set<WsClient>();
  private heartbeat: NodeJS.Timeout;

  constructor(private readonly onHello?: (client: WsClient) => void) {
    this.heartbeat = setInterval(() => {
      for (const c of this.clients) {
        if (!c.alive) {
          c.socket.terminate();
          this.clients.delete(c);
          continue;
        }
        c.alive = false;
        try {
          c.socket.ping();
        } catch {
          /* ignore */
        }
      }
    }, 30000);
  }

  add(socket: WebSocket, role: WsRole): WsClient {
    const client: WsClient = { socket, role, resolution: null, userAgent: null, alive: true };
    this.clients.add(client);
    socket.on('pong', () => {
      client.alive = true;
    });
    socket.on('close', () => this.clients.delete(client));
    socket.on('error', () => this.clients.delete(client));
    socket.on('message', (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const res = ClientMessageSchema.safeParse(parsed);
      if (!res.success) return;
      const msg = res.data;
      client.alive = true;
      if (msg.type === 'hello') {
        client.role = msg.role;
        client.resolution = msg.resolution ?? null;
        client.userAgent = msg.userAgent ?? null;
        this.onHello?.(client);
      } else if (msg.type === 'ping') {
        this.send(client, { type: 'pong' });
      }
    });
    return client;
  }

  send(client: WsClient, msg: ServerMessage): void {
    if (client.socket.readyState !== client.socket.OPEN) return;
    try {
      client.socket.send(JSON.stringify(msg));
    } catch {
      /* ignore */
    }
  }

  broadcast(msg: ServerMessage, role?: WsRole): void {
    for (const c of this.clients) {
      if (!role || c.role === role) this.send(c, msg);
    }
  }

  count(role?: WsRole): number {
    let n = 0;
    for (const c of this.clients) if (!role || c.role === role) n += 1;
    return n;
  }

  displayResolution(): { w: number; h: number } | null {
    for (const c of this.clients) if (c.role === 'display' && c.resolution) return c.resolution;
    return null;
  }

  close(): void {
    clearInterval(this.heartbeat);
    for (const c of this.clients) c.socket.close();
    this.clients.clear();
  }
}
