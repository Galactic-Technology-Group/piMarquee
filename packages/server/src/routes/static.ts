import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../env.js';

/**
 * Serves the two built SPAs: admin at "/" and display at "/display".
 * During `npm run dev` Vite serves them instead and proxies /api and /ws here.
 */
export async function registerStaticRoutes(app: FastifyInstance): Promise<void> {
  const haveAdmin = fs.existsSync(path.join(env.adminDist, 'index.html'));
  const haveDisplay = fs.existsSync(path.join(env.displayDist, 'index.html'));

  // Vite emits content-hashed assets, so those can be cached for a long time, but the HTML shell must
  // always be revalidated or the kiosk and admin keep running an old build after an update.
  app.addHook('onSend', (_req, reply, payload, done) => {
    const type = String(reply.getHeader('content-type') ?? '');
    if (type.includes('text/html')) reply.header('cache-control', 'no-cache');
    done(null, payload);
  });

  if (haveDisplay) {
    await app.register(fastifyStatic, {
      root: env.displayDist,
      prefix: '/display/',
      decorateReply: false,
      cacheControl: true,
      maxAge: '7d',
      immutable: true,
      index: ['index.html'],
    });
    app.get('/display', (_req, reply) => reply.redirect('/display/'));
  } else {
    app.get('/display', async () => devHint('display', 5174));
    app.get('/display/', async () => devHint('display', 5174));
  }

  if (haveAdmin) {
    await app.register(fastifyStatic, {
      root: env.adminDist,
      prefix: '/',
      decorateReply: true,
      cacheControl: true,
      maxAge: '7d',
      immutable: true,
      index: ['index.html'],
    });
  }

  app.setNotFoundHandler((req, reply) => {
    const url = req.url.split('?')[0] ?? '';
    if (req.method === 'GET' && !url.startsWith('/api/') && !url.startsWith('/proxy/')) {
      if (url.startsWith('/display/') && haveDisplay) {
        return reply.type('text/html').header('cache-control', 'no-cache').send(fs.createReadStream(path.join(env.displayDist, 'index.html')));
      }
      if (haveAdmin) {
        return reply.type('text/html').header('cache-control', 'no-cache').send(fs.createReadStream(path.join(env.adminDist, 'index.html')));
      }
      return reply.type('text/html').send(devHint('admin', 5173));
    }
    return reply.code(404).send({ error: 'not found' });
  });
}

function devHint(name: string, port: number): string {
  return `<!doctype html><title>piMarquee</title><body style="font-family:system-ui;padding:2rem;background:#111;color:#eee">
<h1>piMarquee server</h1><p>The ${name} UI is not built. In development open <a style="color:#8cf" href="http://localhost:${port}/">http://localhost:${port}/</a> (Vite), or run <code>npm run build</code>.</p></body>`;
}
