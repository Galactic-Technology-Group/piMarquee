import mqtt, { type MqttClient } from 'mqtt';
import type { Config, Layout } from '@pimarquee/shared';
import type { AppContext } from '../context.js';
import { env } from '../env.js';

/**
 * Home Assistant integration via MQTT discovery.
 *
 * One HA device ("<displayName>") with:
 *   select  active layout            <base>/layout/state | /set        (options = layout names)
 *   switch  display power            <base>/power/state  | /set        (ON/OFF)
 *   button  reload display           <base>/reload/set
 *   text    one per text widget      <base>/text/<widgetId>/state | /set
 *   sensor  cpu temperature, active streams, uptime
 *   binary_sensor  go2rtc reachable
 * Availability: <base>/availability (online/offline, LWT).
 */
export class MqttPublisher {
  private client: MqttClient | null = null;
  private statusTimer: NodeJS.Timeout | null = null;
  private slug = 'pimarquee';
  private base = 'pimarquee';
  private prefix = 'homeassistant';
  private knownTextWidgets = new Set<string>();

  constructor(private readonly ctx: AppContext) {}

  /** (Re)start according to current settings. Safe to call on every settings change. */
  async reconfigure(): Promise<void> {
    await this.stop();
    const s = this.ctx.store.config.settings;
    if (!s.mqtt.enabled) return;

    this.slug = `pimarquee_${s.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'display'}`;
    this.base = `${s.mqtt.baseTopic.replace(/\/+$/, '')}/${this.slug}`;
    this.prefix = s.mqtt.discoveryPrefix.replace(/\/+$/, '');

    const client = mqtt.connect(s.mqtt.url, {
      username: s.mqtt.username || undefined,
      password: s.mqtt.password || undefined,
      clientId: `${this.slug}_${Math.random().toString(16).slice(2, 8)}`,
      reconnectPeriod: 5000,
      will: { topic: `${this.base}/availability`, payload: 'offline', qos: 1, retain: true },
    });
    this.client = client;

    client.on('connect', () => {
      this.ctx.mqttConnected = true;
      this.ctx.log.info({ url: s.mqtt.url }, 'mqtt connected');
      client.subscribe([`${this.base}/+/set`, `${this.base}/text/+/set`], (err) => {
        if (err) this.ctx.log.warn({ err }, 'mqtt subscribe failed');
      });
      this.publishDiscovery();
      this.publishState();
      client.publish(`${this.base}/availability`, 'online', { qos: 1, retain: true });
    });
    client.on('close', () => {
      this.ctx.mqttConnected = false;
    });
    client.on('error', (err) => this.ctx.log.warn({ err: err.message }, 'mqtt error'));
    client.on('message', (topic, payload) => {
      void this.handleCommand(topic, payload.toString()).catch((err) =>
        this.ctx.log.warn({ err: (err as Error).message, topic }, 'mqtt command failed'),
      );
    });

    this.statusTimer = setInterval(() => void this.publishSensors(), 30000);
  }

  async stop(): Promise<void> {
    if (this.statusTimer) clearInterval(this.statusTimer);
    this.statusTimer = null;
    if (this.client) {
      const c = this.client;
      this.client = null;
      this.ctx.mqttConnected = false;
      await new Promise<void>((resolve) => {
        c.publish(`${this.base}/availability`, 'offline', { qos: 1, retain: true }, () => c.end(false, {}, () => resolve()));
        setTimeout(resolve, 2000);
      });
    }
  }

  /** Called on every config change. */
  onConfigChanged(scope: string): void {
    if (!this.client) return;
    if (scope === 'layouts' || scope === 'all') this.publishDiscovery();
    this.publishState();
  }

  private device() {
    const s = this.ctx.store.config.settings;
    return {
      identifiers: [this.slug],
      name: s.displayName,
      manufacturer: 'piMarquee',
      model: this.ctx.pi.modelString,
      sw_version: env.version,
    };
  }

  private publishDiscovery(): void {
    const c = this.client;
    if (!c) return;
    const cfg = this.ctx.store.config;
    const dev = this.device();
    const avail = { availability_topic: `${this.base}/availability` };
    const pub = (component: string, object: string, payload: Record<string, unknown> | null) => {
      c.publish(`${this.prefix}/${component}/${this.slug}/${object}/config`, payload ? JSON.stringify(payload) : '', { retain: true, qos: 1 });
    };

    pub('select', 'layout', {
      name: 'Layout',
      unique_id: `${this.slug}_layout`,
      state_topic: `${this.base}/layout/state`,
      command_topic: `${this.base}/layout/set`,
      options: cfg.layouts.map((l) => l.name),
      icon: 'mdi:view-dashboard',
      device: dev,
      ...avail,
    });
    pub('switch', 'power', {
      name: 'Display power',
      unique_id: `${this.slug}_power`,
      state_topic: `${this.base}/power/state`,
      command_topic: `${this.base}/power/set`,
      payload_on: 'ON',
      payload_off: 'OFF',
      icon: 'mdi:monitor',
      device: dev,
      ...avail,
    });
    pub('button', 'reload', {
      name: 'Reload display',
      unique_id: `${this.slug}_reload`,
      command_topic: `${this.base}/reload/set`,
      payload_press: 'PRESS',
      icon: 'mdi:refresh',
      device: dev,
      ...avail,
    });
    pub('sensor', 'cpu_temp', {
      name: 'CPU temperature',
      unique_id: `${this.slug}_cpu_temp`,
      state_topic: `${this.base}/sensors/state`,
      value_template: '{{ value_json.cpuTempC }}',
      unit_of_measurement: '°C',
      device_class: 'temperature',
      state_class: 'measurement',
      device: dev,
      ...avail,
    });
    pub('sensor', 'streams', {
      name: 'Active streams',
      unique_id: `${this.slug}_streams`,
      state_topic: `${this.base}/sensors/state`,
      value_template: '{{ value_json.streamsUsed }}',
      icon: 'mdi:cctv',
      device: dev,
      ...avail,
    });
    pub('sensor', 'uptime', {
      name: 'Uptime',
      unique_id: `${this.slug}_uptime`,
      state_topic: `${this.base}/sensors/state`,
      value_template: '{{ value_json.uptimeSec }}',
      unit_of_measurement: 's',
      device_class: 'duration',
      entity_category: 'diagnostic',
      device: dev,
      ...avail,
    });
    pub('binary_sensor', 'go2rtc', {
      name: 'Stream server',
      unique_id: `${this.slug}_go2rtc`,
      state_topic: `${this.base}/sensors/state`,
      value_template: '{{ "ON" if value_json.go2rtcReachable else "OFF" }}',
      device_class: 'connectivity',
      entity_category: 'diagnostic',
      device: dev,
      ...avail,
    });

    // One text entity per text widget; remove entities for widgets that disappeared.
    const current = new Set<string>();
    for (const l of cfg.layouts) {
      for (const w of l.widgets) {
        if (w.type !== 'text') continue;
        current.add(w.id);
        pub('text', `text_${w.id}`, {
          name: `${l.name}: ${w.name || 'Text'}`,
          unique_id: `${this.slug}_text_${w.id}`,
          state_topic: `${this.base}/text/${w.id}/state`,
          command_topic: `${this.base}/text/${w.id}/set`,
          max: 255,
          icon: 'mdi:text',
          device: dev,
          ...avail,
        });
      }
    }
    for (const id of this.knownTextWidgets) if (!current.has(id)) pub('text', `text_${id}`, null);
    this.knownTextWidgets = current;
  }

  private publishState(): void {
    const c = this.client;
    if (!c) return;
    const cfg = this.ctx.store.config;
    const active = cfg.layouts.find((l) => l.id === cfg.display.activeLayoutId);
    c.publish(`${this.base}/layout/state`, active?.name ?? '', { retain: true });
    c.publish(`${this.base}/power/state`, cfg.display.power === 'on' ? 'ON' : 'OFF', { retain: true });
    for (const l of cfg.layouts) {
      for (const w of l.widgets) {
        if (w.type === 'text') c.publish(`${this.base}/text/${w.id}/state`, w.content.slice(0, 255), { retain: true });
      }
    }
    void this.publishSensors();
  }

  private async publishSensors(): Promise<void> {
    const c = this.client;
    if (!c) return;
    const s = await this.ctx.status();
    const resolved = this.ctx.resolved();
    c.publish(
      `${this.base}/sensors/state`,
      JSON.stringify({ cpuTempC: s.cpuTempC, streamsUsed: resolved.streamsUsed, uptimeSec: s.uptimeSec, go2rtcReachable: s.go2rtc.reachable }),
      { retain: false },
    );
  }

  private async handleCommand(topic: string, payload: string): Promise<void> {
    const rel = topic.startsWith(`${this.base}/`) ? topic.slice(this.base.length + 1) : null;
    if (!rel) return;
    const cfg: Config = this.ctx.store.config;
    if (rel === 'layout/set') {
      const layout: Layout | undefined = cfg.layouts.find((l) => l.name === payload || l.id === payload);
      if (layout) await this.ctx.setActiveLayout(layout.id);
      return;
    }
    if (rel === 'power/set') {
      await this.ctx.setPower(payload.toUpperCase() === 'ON');
      return;
    }
    if (rel === 'reload/set') {
      await this.ctx.reloadDisplay(false);
      return;
    }
    const m = /^text\/([a-z0-9]+)\/set$/.exec(rel);
    if (m) {
      const widgetId = m[1]!;
      await this.ctx.store.update('layouts', (d) => {
        for (const l of d.layouts) {
          const w = l.widgets.find((x) => x.id === widgetId);
          if (w && w.type === 'text') {
            w.content = payload;
            l.updatedAt = new Date().toISOString();
          }
        }
      });
    }
  }
}
