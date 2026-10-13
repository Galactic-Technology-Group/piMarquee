import type { FastifyInstance } from 'fastify';
import { ActiveLayoutBody, PowerBody, ReloadBody } from '@pimarquee/shared';
import type { AppContext } from '../context.js';
import { HttpError, parseBody } from './util.js';

export function registerDisplayRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/v1/display', async () => {
    const cfg = ctx.store.config;
    return {
      activeLayoutId: cfg.display.activeLayoutId,
      power: cfg.display.power,
      connectedClients: ctx.hub.count('display'),
      resolution: ctx.hub.displayResolution(),
    };
  });

  app.put('/api/v1/display/active-layout', async (req) => {
    const body = parseBody(ActiveLayoutBody, req.body);
    if (body.layoutId !== null && !ctx.store.config.layouts.some((l) => l.id === body.layoutId)) {
      throw new HttpError(404, 'layout not found');
    }
    await ctx.setActiveLayout(body.layoutId);
    return { activeLayoutId: body.layoutId };
  });

  app.put('/api/v1/display/power', async (req) => {
    const body = parseBody(PowerBody, req.body);
    await ctx.setPower(body.on);
    return { power: body.on ? 'on' : 'off' };
  });

  app.post('/api/v1/display/reload', async (req) => {
    const body = parseBody(ReloadBody, req.body ?? {});
    await ctx.reloadDisplay(body.hard);
    return { ok: true };
  });

  app.get<{ Querystring: { layoutId?: string } }>('/api/v1/display/resolved', async (req) => {
    const id = req.query.layoutId;
    return ctx.resolved(id === undefined ? undefined : id);
  });
}
