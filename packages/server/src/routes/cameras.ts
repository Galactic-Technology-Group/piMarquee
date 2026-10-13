import type { FastifyInstance } from 'fastify';
import { CameraInputSchema, newId, type Camera } from '@pimarquee/shared';
import type { AppContext } from '../context.js';
import { summariseProbe } from '../go2rtc/client.js';
import { HttpError, parseBody, redactCamera } from './util.js';

export function registerCameraRoutes(app: FastifyInstance, ctx: AppContext): void {
  const find = (id: string): Camera => {
    const c = ctx.store.config.cameras.find((x) => x.id === id);
    if (!c) throw new HttpError(404, 'camera not found');
    return c;
  };

  app.get('/api/v1/cameras', async () => ctx.store.config.cameras.map(redactCamera));

  app.post('/api/v1/cameras', async (req, reply) => {
    const input = parseBody(CameraInputSchema, req.body);
    const id = newId();
    const cam: Camera = { ...input, id, go2rtcName: `cam_${id}`, enabled: input.enabled ?? true };
    await ctx.store.update('cameras', (d) => {
      d.cameras.push(cam);
    });
    return reply.code(201).send(redactCamera(cam));
  });

  app.get<{ Params: { id: string } }>('/api/v1/cameras/:id', async (req) => redactCamera(find(req.params.id)));

  app.put<{ Params: { id: string } }>('/api/v1/cameras/:id', async (req) => {
    const existing = find(req.params.id);
    const input = parseBody(CameraInputSchema.partial(), req.body);
    // A redacted URL coming back from the UI means "unchanged".
    if (input.rtspUrl && /:\/\/\*\*\*(:\*\*\*)?@/.test(input.rtspUrl)) delete input.rtspUrl;
    const updated: Camera = { ...existing, ...input, id: existing.id, go2rtcName: existing.go2rtcName };
    await ctx.store.update('cameras', (d) => {
      const i = d.cameras.findIndex((c) => c.id === existing.id);
      d.cameras[i] = updated;
    });
    return redactCamera(updated);
  });

  app.delete<{ Params: { id: string } }>('/api/v1/cameras/:id', async (req, reply) => {
    const existing = find(req.params.id);
    await ctx.store.update('cameras', (d) => {
      d.cameras = d.cameras.filter((c) => c.id !== existing.id);
      // Remove widgets that referenced it so the config stays referentially valid.
      for (const l of d.layouts) l.widgets = l.widgets.filter((w) => !(w.type === 'camera' && w.cameraId === existing.id));
    });
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string } }>('/api/v1/cameras/:id/test', async (req) => {
    const cam = find(req.params.id);
    if (!(await ctx.go2rtc.isReachable())) throw new HttpError(503, 'go2rtc is not reachable');
    try {
      // Make sure go2rtc knows the stream even if it is disabled, then probe it.
      await ctx.go2rtc.putStream(cam.go2rtcName, cam.rtspUrl);
      const info = await ctx.go2rtc.probe(cam.go2rtcName);
      const s = summariseProbe(info);
      const warnings: string[] = [];
      if (s.hasH265 && !s.hasH264) warnings.push('Stream is H.265/HEVC: browsers cannot play it via WebRTC. Use the camera sub-stream or switch it to H.264.');
      if (!cam.enabled) await ctx.go2rtc.deleteStream(cam.go2rtcName).catch(() => undefined);
      return { ok: s.error === null, medias: s.medias, hasH264: s.hasH264, hasH265: s.hasH265, error: s.error, warnings };
    } catch (err) {
      return { ok: false, medias: [], hasH264: false, hasH265: false, error: (err as Error).message, warnings: [] };
    }
  });

  app.get<{ Params: { id: string } }>('/api/v1/cameras/:id/snapshot.jpg', async (req, reply) => {
    const cam = find(req.params.id);
    try {
      const f = await ctx.go2rtc.frame(cam.go2rtcName);
      return reply.header('content-type', f.contentType).header('cache-control', 'no-store').send(Buffer.from(f.body));
    } catch (err) {
      throw new HttpError(502, `snapshot failed: ${(err as Error).message}`);
    }
  });
}
