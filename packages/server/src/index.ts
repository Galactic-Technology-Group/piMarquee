import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import { env } from './env.js';
import { ConfigStore, type ConfigChange } from './config/store.js';
import { detectPi } from './system/pi-model.js';
import { Go2rtcClient } from './go2rtc/client.js';
import { Go2rtcSync } from './go2rtc/sync.js';
import { SessionStore, registerAuthHook } from './auth/plugin.js';
import { WsHub } from './ws/hub.js';
import { AppContext } from './context.js';
import { registerLayoutRoutes } from './routes/layouts.js';
import { registerCameraRoutes } from './routes/cameras.js';
import { registerDisplayRoutes } from './routes/display.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerProxyRoutes } from './routes/proxy.js';
import { registerMediaRoutes } from './routes/media.js';
import { MediaManager } from './media/youtube.js';
import { registerStaticRoutes } from './routes/static.js';
import { HttpError } from './routes/util.js';
import { MqttPublisher } from './mqtt/publisher.js';
import { startMdns, stopMdns } from './mdns.js';

async function main(): Promise<void> {
  const app = Fastify({
    logger: { level: env.logLevel, transport: env.nodeEnv === 'development' ? { target: 'pino-pretty' } : undefined },
    trustProxy: false,
    bodyLimit: 5 * 1024 * 1024,
    disableRequestLogging: true,
    // Do not wait for idle keep-alive/WebSocket connections on close; systemd gives us 10 s.
    forceCloseConnections: true,
  });

  const store = await ConfigStore.load(env.configPath);
  const pi = await detectPi();
  app.log.info({ pi }, 'detected hardware');

  const go2rtc = new Go2rtcClient(env.go2rtcUrl);
  const go2rtcSync = new Go2rtcSync(go2rtc, env.go2rtcTemplatePath, env.go2rtcConfigPath, {
    info: (m) => app.log.info(m),
    warn: (m) => app.log.warn(m),
  });
  const sessions = new SessionStore();
  const hub = new WsHub((client) => {
    if (client.role === 'display') ctx.pushResolved();
  });
  const media = new MediaManager(env.mediaDir, env.ytdlpBin, env.ytdlpExtraArgs, app.log);
  await media.init();
  const ctx = new AppContext(store, pi, hub, go2rtc, go2rtcSync, sessions, media, app.log);
  const mqttPub = new MqttPublisher(ctx);

  await app.register(cookie);
  await app.register(websocket);

  registerAuthHook(app, { store, sessions });

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.status).send({ error: err.message, details: err.details });
    }
    const status = err.statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    return reply.code(status).send({ error: err.message });
  });

  app.get('/health', async () => ({ ok: true, version: env.version }));

  registerLayoutRoutes(app, ctx);
  registerCameraRoutes(app, ctx);
  registerDisplayRoutes(app, ctx);
  registerSettingsRoutes(app, ctx);
  registerAuthRoutes(app, ctx);
  registerProxyRoutes(app, ctx);
  await registerMediaRoutes(app, ctx);

  app.get<{ Querystring: { role?: string } }>('/ws', { websocket: true }, (socket, req) => {
    const role = req.query.role === 'display' ? 'display' : 'admin';
    const client = hub.add(socket, role);
    hub.send(client, { type: 'welcome', serverVersion: env.version, rev: store.rev });
    if (role === 'display') hub.send(client, { type: 'display.resolved', resolved: ctx.resolved() });
  });

  await registerStaticRoutes(app);

  // --- react to config changes -------------------------------------------------
  store.on('change', (change: ConfigChange) => {
    hub.broadcast({ type: 'config.changed', rev: change.rev, scope: change.scope }, 'admin');
    if (change.scope !== 'auth') ctx.pushResolved();
    if (change.scope === 'cameras' || change.scope === 'all') {
      void go2rtcSync.apply(change.config.cameras).catch((err) => app.log.warn({ err }, 'go2rtc sync failed'));
    }
    if (change.scope === 'layouts' || change.scope === 'settings' || change.scope === 'all') {
      void media.sync(change.config).catch((err) => app.log.warn({ err }, 'media sync failed'));
    }
    if (change.scope === 'settings' || change.scope === 'all') {
      void mqttPub.reconfigure().catch((err) => app.log.warn({ err }, 'mqtt reconfigure failed'));
    } else {
      mqttPub.onConfigChanged(change.scope);
    }
  });

  // A download finishing (or failing) changes what the display should show.
  media.on('change', () => {
    ctx.pushResolved();
    hub.broadcast({ type: 'config.changed', rev: store.rev, scope: 'media' }, 'admin');
  });
  // Throttled (1/s) by the manager; lets the display placeholder and the admin show live progress.
  media.on('progress', () => {
    ctx.pushResolved();
    hub.broadcast({ type: 'config.changed', rev: store.rev, scope: 'media' }, 'admin');
  });

  // --- periodic status to admins ----------------------------------------------
  const statusTimer = setInterval(async () => {
    await ctx.refreshGo2rtc();
    if (hub.count('admin') > 0) hub.broadcast({ type: 'status', status: await ctx.status() }, 'admin');
  }, 10000);

  const port = env.port ?? store.config.settings.port;
  await app.listen({ port, host: env.host });
  app.log.info(`piMarquee ${env.version} listening on http://${env.host}:${port}  (config: ${env.configPath})`);

  await ctx.refreshGo2rtc();
  void go2rtcSync.apply(store.config.cameras).catch((err) => app.log.warn({ err }, 'initial go2rtc sync failed'));
  void mqttPub.reconfigure().catch((err) => app.log.warn({ err }, 'mqtt start failed'));
  void media.sync(store.config).catch((err) => app.log.warn({ err }, 'initial media sync failed'));
  if (!env.noSystem) media.startSelfUpdate();
  startMdns(store.config.settings.displayName, port, (m) => app.log.warn(m));

  // Restore the persisted power state on boot (e.g. display was off before a reboot).
  if (store.config.display.power === 'off') void ctx.setPower(false).catch(() => undefined);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'shutting down');
    // Whatever happens below, be gone well before systemd's 10 s TimeoutStopSec.
    setTimeout(() => process.exit(0), 3000).unref();
    clearInterval(statusTimer);
    go2rtcSync.stop();
    media.stop();
    hub.close();
    await Promise.allSettled([mqttPub.stop(), stopMdns(), app.close()]);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
