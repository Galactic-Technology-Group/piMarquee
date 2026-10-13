import type { FastifyInstance } from 'fastify';
import { Readable } from 'node:stream';
import type { AppContext } from '../context.js';
import { HttpError } from './util.js';

/** Response headers that would stop the page from rendering inside an iframe. */
const STRIP = new Set([
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'content-encoding', // fetch already decoded the body
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
  'strict-transport-security',
]);

/**
 * Best-effort "strip frame headers" reverse proxy for webpage widgets.
 * Only the origin stored on the widget is reachable through it (not an open proxy).
 * Pages that rely on cookies, strict CSP or absolute asset URLs will not work; documented limitation.
 */
export function registerProxyRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.all<{ Params: { widgetId: string; '*': string } }>('/proxy/:widgetId/*', async (req, reply) => {
    const widgetId = req.params.widgetId;
    let target: URL | null = null;
    for (const l of ctx.store.config.layouts) {
      const w = l.widgets.find((x) => x.id === widgetId);
      if (w && w.type === 'webpage') {
        if (!w.stripFrameHeaders) throw new HttpError(403, 'proxy not enabled for this widget');
        target = new URL(w.url);
        break;
      }
    }
    if (!target) throw new HttpError(404, 'widget not found');

    const rest = req.params['*'] ?? '';
    const qIndex = req.url.indexOf('?');
    const query = qIndex >= 0 ? req.url.slice(qIndex) : '';
    // Empty path -> the widget's own URL (with its own path/query); otherwise same origin + requested path.
    const upstream = rest === '' && query === '' ? target : new URL(`/${rest}${query}`, target.origin);

    const headers: Record<string, string> = {
      'user-agent': req.headers['user-agent'] ?? 'pimarquee',
      accept: req.headers.accept ?? '*/*',
      'accept-language': req.headers['accept-language'] ?? 'en',
    };

    let res: Response;
    try {
      res = await fetch(upstream, {
        method: req.method,
        headers,
        redirect: 'manual',
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : (req.body as RequestInit['body']),
        signal: AbortSignal.timeout(20000),
      });
    } catch (err) {
      throw new HttpError(502, `upstream fetch failed: ${(err as Error).message}`);
    }

    res.headers.forEach((v, k) => {
      if (STRIP.has(k.toLowerCase())) return;
      if (k.toLowerCase() === 'location') {
        // Keep redirects inside the proxy when they stay on the same origin.
        try {
          const loc = new URL(v, upstream);
          if (loc.origin === target!.origin) {
            reply.header('location', `/proxy/${widgetId}${loc.pathname}${loc.search}`);
            return;
          }
        } catch {
          /* fall through */
        }
      }
      reply.header(k, v);
    });
    reply.code(res.status);
    if (!res.body) return reply.send();
    return reply.send(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream));
  });
}
