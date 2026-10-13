import type { FastifyReply } from 'fastify';
import type { ZodTypeAny, ZodError, z } from 'zod';
import type { Camera, Config, Settings } from '@pimarquee/shared';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function parseBody<S extends ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const res = schema.safeParse(body);
  if (!res.success) throw new HttpError(400, 'invalid body', formatZod(res.error));
  return res.data;
}

export function formatZod(err: ZodError): { path: string; message: string }[] {
  return err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

export function notFound(reply: FastifyReply, what: string): never {
  void reply;
  throw new HttpError(404, `${what} not found`);
}

/** Hide RTSP credentials in API responses. */
export function redactCamera(c: Camera): Camera & { hasCredentials: boolean } {
  let redacted = c.rtspUrl;
  let hasCredentials = false;
  try {
    const u = new URL(c.rtspUrl);
    if (u.username || u.password) {
      hasCredentials = true;
      u.username = u.username ? '***' : '';
      u.password = u.password ? '***' : '';
      redacted = u.toString();
    }
  } catch {
    /* non-URL source; leave as-is */
  }
  return { ...c, rtspUrl: redacted, hasCredentials };
}

export function redactSettings(s: Settings): Settings & { mqtt: Settings['mqtt'] & { hasPassword: boolean } } {
  return { ...s, mqtt: { ...s.mqtt, password: '', hasPassword: s.mqtt.password.length > 0 } };
}

export function redactConfig(c: Config): Config {
  return {
    ...c,
    settings: { ...c.settings, mqtt: { ...c.settings.mqtt, password: c.settings.mqtt.password ? '***' : '' } },
    auth: { passwordHash: c.auth.passwordHash ? '***' : null, tokens: c.auth.tokens.map((t) => ({ ...t, tokenHash: '***' })) },
  };
}
