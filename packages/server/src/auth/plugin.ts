import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import type { ConfigStore } from '../config/store.js';
import { hashToken } from './password.js';

const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;
export const SESSION_COOKIE = 'sid';

export class SessionStore {
  private sessions = new Map<string, number>();

  create(): string {
    const sid = randomBytes(24).toString('base64url');
    this.sessions.set(sid, Date.now() + SESSION_TTL_MS);
    return sid;
  }

  valid(sid: string | undefined): boolean {
    if (!sid) return false;
    const exp = this.sessions.get(sid);
    if (!exp) return false;
    if (exp < Date.now()) {
      this.sessions.delete(sid);
      return false;
    }
    return true;
  }

  revoke(sid: string | undefined): void {
    if (sid) this.sessions.delete(sid);
  }

  clear(): void {
    this.sessions.clear();
  }
}

export function isLoopback(ip: string): boolean {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

/** Paths that never require auth (health, the kiosk page and its assets are also covered by loopback bypass). */
const PUBLIC_PREFIXES = ['/health', '/api/v1/auth/login', '/api/v1/auth/status'];

export interface AuthContext {
  store: ConfigStore;
  sessions: SessionStore;
}

export function authEnabled(store: ConfigStore): boolean {
  return store.config.auth.passwordHash !== null;
}

export function isAuthorized(req: FastifyRequest, ctx: AuthContext): boolean {
  if (!authEnabled(ctx.store)) return true;
  if (isLoopback(req.ip)) return true;

  const header = req.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  const queryToken = (req.query as Record<string, unknown> | undefined)?.token;
  const token = bearer ?? (typeof queryToken === 'string' ? queryToken : undefined);
  if (token) {
    const h = hashToken(token);
    const match = ctx.store.config.auth.tokens.find((t) => t.tokenHash === h);
    if (match) {
      // Best-effort lastUsedAt bookkeeping, throttled to once a minute per token.
      const last = match.lastUsedAt ? Date.parse(match.lastUsedAt) : 0;
      if (Date.now() - last > 60000) {
        void ctx.store
          .update('auth', (d) => {
            const t = d.auth.tokens.find((x) => x.id === match.id);
            if (t) t.lastUsedAt = new Date().toISOString();
          })
          .catch(() => undefined);
      }
      return true;
    }
  }

  const sid = req.cookies?.[SESSION_COOKIE];
  return ctx.sessions.valid(sid);
}

export function registerAuthHook(app: FastifyInstance, ctx: AuthContext): void {
  app.addHook('onRequest', async (req, reply) => {
    const url = req.url.split('?')[0] ?? req.url;
    const protectedPath = url.startsWith('/api/') || url.startsWith('/proxy/') || url === '/ws';
    if (!protectedPath) return; // static SPA shells + assets are public; the API is what matters
    if (PUBLIC_PREFIXES.some((p) => url.startsWith(p))) return;
    if (isAuthorized(req, ctx)) return;
    await reply.code(401).send({ error: 'unauthorized' });
  });
}
