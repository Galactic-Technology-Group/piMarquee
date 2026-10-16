import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import { extractYoutubeId } from '@pimarquee/shared';
import type { AppContext } from '../context.js';
import { env } from '../env.js';
import { HttpError } from './util.js';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export async function registerMediaRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  fs.mkdirSync(env.mediaDir, { recursive: true });

  // Downloaded videos. @fastify/static handles Range requests, which <video> needs for seeking/looping.
  await app.register(fastifyStatic, {
    root: env.mediaDir,
    prefix: '/media/',
    decorateReply: false,
    cacheControl: true,
    maxAge: '1d',
    index: false,
    list: false,
    acceptRanges: true,
  });

  /** Every known download plus which layouts use it and total disk usage. */
  app.get('/api/v1/media', async () => {
    const cfg = ctx.store.config;
    const usedBy = new Map<string, { layoutId: string; layoutName: string; widgetName: string }[]>();
    for (const l of cfg.layouts) {
      for (const w of l.widgets) {
        if (w.type !== 'youtube' || w.mode !== 'download') continue;
        const id = extractYoutubeId(w.url);
        if (!id) continue;
        const list = usedBy.get(id) ?? [];
        list.push({ layoutId: l.id, layoutName: l.name, widgetName: w.name || 'YouTube' });
        usedBy.set(id, list);
      }
    }
    return {
      items: ctx.media.list().map((m) => ({ ...m, usedBy: usedBy.get(m.videoId) ?? [] })),
      totalBytes: ctx.media.totalBytes(),
      keepUnusedMedia: cfg.settings.keepUnusedMedia,
    };
  });

  app.post<{ Params: { videoId: string } }>('/api/v1/media/:videoId/refresh', async (req) => {
    if (!VIDEO_ID.test(req.params.videoId)) throw new HttpError(400, 'invalid video id');
    await ctx.media.refresh(req.params.videoId);
    return ctx.media.status(req.params.videoId);
  });

  app.delete<{ Params: { videoId: string } }>('/api/v1/media/:videoId', async (req, reply) => {
    if (!VIDEO_ID.test(req.params.videoId)) throw new HttpError(400, 'invalid video id');
    await ctx.media.delete(req.params.videoId);
    // If a layout still uses it, the sync queues it again right away.
    await ctx.media.sync(ctx.store.config);
    return reply.code(204).send();
  });
}
