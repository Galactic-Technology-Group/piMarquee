import type { FastifyInstance } from 'fastify';
import { SettingsInputSchema, SettingsSchema, PI_FAMILY_LABEL, RestartBody } from '@pimarquee/shared';
import type { AppContext } from '../context.js';
import { effectiveMaxStreams } from '../config/resolve.js';
import { describeThrottled } from '../system/metrics.js';
import { rebootHost, restartService } from '../system/services.js';
import { env } from '../env.js';
import { HttpError, parseBody, redactConfig, redactSettings } from './util.js';

function deepMerge<T extends Record<string, unknown>>(base: T, patch: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const cur = out[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object' && !Array.isArray(cur)) {
      out[k] = deepMerge(cur as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

export function registerSettingsRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/v1/settings', async () => redactSettings(ctx.store.config.settings));

  app.put('/api/v1/settings', async (req) => {
    // Empty MQTT password from the UI means "keep the existing one".
    const raw = (req.body ?? {}) as Record<string, unknown>;
    const rawMqtt = raw.mqtt as Record<string, unknown> | undefined;
    if (rawMqtt && rawMqtt.password === '') {
      const { password: _omit, ...rest } = rawMqtt;
      void _omit;
      raw.mqtt = rest;
    }
    const patch = parseBody(SettingsInputSchema, raw);
    const merged = SettingsSchema.parse(deepMerge(ctx.store.config.settings as unknown as Record<string, unknown>, patch as Record<string, unknown>));
    await ctx.store.update('settings', (d) => {
      d.settings = merged;
    });
    return redactSettings(merged);
  });

  app.get('/api/v1/system/pi', async () => {
    const cfg = ctx.store.config;
    return {
      ...ctx.pi,
      familyLabel: PI_FAMILY_LABEL[ctx.pi.family],
      effectiveMaxStreams: effectiveMaxStreams(cfg, ctx.pi),
      maxStreamsSource: cfg.settings.maxStreamsOverride !== null ? 'override' : 'detected',
      systemControl: !env.noSystem,
    };
  });

  app.get('/api/v1/status', async () => {
    const s = await ctx.status();
    return { ...s, pi: { family: ctx.pi.family, model: ctx.pi.modelString, ramMB: ctx.pi.ramMB }, throttledFlags: describeThrottled(s.throttled) };
  });

  app.post('/api/v1/system/restart', async (req) => {
    const body = parseBody(RestartBody, req.body);
    try {
      await restartService(body.service);
    } catch (err) {
      throw new HttpError(503, (err as Error).message);
    }
    return { ok: true };
  });

  app.post('/api/v1/system/reboot', async () => {
    try {
      await rebootHost();
    } catch (err) {
      throw new HttpError(503, (err as Error).message);
    }
    return { ok: true };
  });

  app.get('/api/v1/config', async () => redactConfig(ctx.store.config));

  app.put('/api/v1/config', async (req) => {
    const body = req.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== 'object') throw new HttpError(400, 'invalid body');
    // Imports never carry secrets; keep the current auth block and MQTT password.
    const current = ctx.store.config;
    const merged = {
      ...body,
      auth: current.auth,
      settings: {
        ...(body.settings as Record<string, unknown> | undefined),
        mqtt: { ...((body.settings as Record<string, unknown> | undefined)?.mqtt as Record<string, unknown> | undefined), password: current.settings.mqtt.password },
      },
    };
    try {
      await ctx.store.replace(merged);
    } catch (err) {
      throw new HttpError(400, 'invalid config', (err as Error).message);
    }
    return redactConfig(ctx.store.config);
  });
}
