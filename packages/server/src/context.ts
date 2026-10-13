import type { FastifyBaseLogger } from 'fastify';
import type { PiInfo, ResolvedLayout, StatusSnapshot } from '@pimarquee/shared';
import type { ConfigStore } from './config/store.js';
import { buildResolvedLayout } from './config/resolve.js';
import type { Go2rtcClient } from './go2rtc/client.js';
import type { Go2rtcSync } from './go2rtc/sync.js';
import type { SessionStore } from './auth/plugin.js';
import type { WsHub } from './ws/hub.js';
import { collectMetrics } from './system/metrics.js';
import { setDisplayPower } from './system/display-power.js';
import { restartService } from './system/services.js';
import { env } from './env.js';

/** Everything the routes, WS handlers and MQTT publisher need. One instance per process. */
export class AppContext {
  mqttConnected = false;
  private go2rtcStreamCount = 0;
  private go2rtcReachable = false;

  constructor(
    public readonly store: ConfigStore,
    public readonly pi: PiInfo,
    public readonly hub: WsHub,
    public readonly go2rtc: Go2rtcClient,
    public readonly go2rtcSync: Go2rtcSync,
    public readonly sessions: SessionStore,
    public readonly log: FastifyBaseLogger,
  ) {}

  resolved(layoutId?: string | null): ResolvedLayout {
    return buildResolvedLayout(this.store.config, this.pi, this.store.rev, layoutId === undefined ? undefined : layoutId);
  }

  /** Push the current active layout to every connected display. */
  pushResolved(): void {
    this.hub.broadcast({ type: 'display.resolved', resolved: this.resolved() }, 'display');
  }

  async setActiveLayout(layoutId: string | null): Promise<void> {
    await this.store.update('display', (d) => {
      d.display.activeLayoutId = layoutId;
    });
  }

  async setPower(on: boolean): Promise<void> {
    await this.store.update('display', (d) => {
      d.display.power = on ? 'on' : 'off';
    });
    this.hub.broadcast({ type: 'display.power', on }, 'display');
    const r = await setDisplayPower(on, this.store.config.settings.displayPowerMethod);
    if (!r.ok || r.error) this.log.warn({ r }, 'display power: hardware control unavailable, using software blackout');
  }

  async reloadDisplay(hard: boolean): Promise<void> {
    this.hub.broadcast({ type: 'display.reload', hard }, 'display');
    if (hard && !env.noSystem) {
      await restartService('kiosk');
    }
  }

  async refreshGo2rtc(): Promise<void> {
    try {
      const streams = await this.go2rtc.listStreams();
      this.go2rtcReachable = true;
      this.go2rtcStreamCount = Object.keys(streams).length;
    } catch {
      this.go2rtcReachable = false;
      this.go2rtcStreamCount = 0;
    }
  }

  async status(): Promise<StatusSnapshot> {
    const m = await collectMetrics();
    const cfg = this.store.config;
    return {
      version: env.version,
      uptimeSec: m.uptimeSec,
      cpuTempC: m.cpuTempC,
      load1: m.load1,
      memUsedMB: m.memUsedMB,
      memTotalMB: m.memTotalMB,
      throttled: m.throttled,
      go2rtc: { reachable: this.go2rtcReachable, streams: this.go2rtcStreamCount },
      display: {
        connected: this.hub.count('display'),
        resolution: this.hub.displayResolution(),
        activeLayoutId: cfg.display.activeLayoutId,
        power: cfg.display.power,
      },
      mqtt: { enabled: cfg.settings.mqtt.enabled, connected: this.mqttConnected },
    };
  }
}
