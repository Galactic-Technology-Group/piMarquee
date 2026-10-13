import type { FastifyInstance } from 'fastify';
import { CreateTokenBody, LoginBody, SetPasswordBody, newId } from '@pimarquee/shared';
import type { AppContext } from '../context.js';
import { SESSION_COOKIE, authEnabled, isAuthorized, isLoopback } from '../auth/plugin.js';
import { hashPassword, hashToken, newToken, verifyPassword } from '../auth/password.js';
import { HttpError, parseBody } from './util.js';

export function registerAuthRoutes(app: FastifyInstance, ctx: AppContext): void {
  const authCtx = { store: ctx.store, sessions: ctx.sessions };

  app.get('/api/v1/auth/status', async (req) => ({
    enabled: authEnabled(ctx.store),
    authenticated: isAuthorized(req, authCtx),
    loopback: isLoopback(req.ip),
  }));

  app.post('/api/v1/auth/login', async (req, reply) => {
    const body = parseBody(LoginBody, req.body);
    const hash = ctx.store.config.auth.passwordHash;
    if (hash === null) return { ok: true, enabled: false };
    // Small fixed delay blunts brute force on a LAN box without a lockout table.
    await new Promise((r) => setTimeout(r, 300));
    if (!(await verifyPassword(body.password, hash))) throw new HttpError(401, 'wrong password');
    const sid = ctx.sessions.create();
    reply.setCookie(SESSION_COOKIE, sid, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 });
    return { ok: true, enabled: true };
  });

  app.post('/api/v1/auth/logout', async (req, reply) => {
    ctx.sessions.revoke(req.cookies?.[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.put('/api/v1/auth/password', async (req, reply) => {
    const body = parseBody(SetPasswordBody, req.body);
    const hash = body.password ? await hashPassword(body.password) : null;
    await ctx.store.update('auth', (d) => {
      d.auth.passwordHash = hash;
    });
    ctx.sessions.clear();
    if (hash) {
      const sid = ctx.sessions.create();
      reply.setCookie(SESSION_COOKIE, sid, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 });
    }
    return { enabled: hash !== null };
  });

  app.get('/api/v1/auth/tokens', async () =>
    ctx.store.config.auth.tokens.map((t) => ({ id: t.id, name: t.name, createdAt: t.createdAt, lastUsedAt: t.lastUsedAt })),
  );

  app.post('/api/v1/auth/tokens', async (req, reply) => {
    const body = parseBody(CreateTokenBody, req.body);
    const token = newToken();
    const record = { id: newId(), name: body.name, tokenHash: hashToken(token), createdAt: new Date().toISOString(), lastUsedAt: null };
    await ctx.store.update('auth', (d) => {
      d.auth.tokens.push(record);
    });
    // The plaintext token is returned exactly once.
    return reply.code(201).send({ id: record.id, name: record.name, token });
  });

  app.delete<{ Params: { id: string } }>('/api/v1/auth/tokens/:id', async (req, reply) => {
    await ctx.store.update('auth', (d) => {
      d.auth.tokens = d.auth.tokens.filter((t) => t.id !== req.params.id);
    });
    return reply.code(204).send();
  });
}
