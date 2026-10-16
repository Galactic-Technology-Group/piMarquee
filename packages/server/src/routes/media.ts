import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import type { AppContext } from '../context.js';
import { env } from '../env.js';
import { HttpError } from './util.js';

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

  app.get('/api/v1/media', async () => ctx.media.list());

  app.post<{ Params: { videoId: string } }>('/api/v1/media/:videoId/refresh', async (req) => {
    if (!/^[A-Za-z0-9_-]{11}$/.test(req.params.videoId)) throw new HttpError(400, 'invalid video id');
    await ctx.media.refresh(req.params.videoId);
    return ctx.media.status(req.params.videoId);
  });
}
