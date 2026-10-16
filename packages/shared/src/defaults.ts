import type { Config, Layout, Widget, WidgetType, Rect } from './schema/config.js';
import { WidgetSchema, CONFIG_VERSION, ConfigSchema } from './schema/config.js';
import { newId } from './ids.js';

export function nowIso(): string {
  return new Date().toISOString();
}

/** Build a fully-defaulted widget of the given type at the given position. */
export function defaultWidget(type: WidgetType, rect: Rect, extra: Record<string, unknown> = {}): Widget {
  const base: Record<string, unknown> = { id: newId(), name: '', rect, ...extra };
  switch (type) {
    case 'camera':
      return WidgetSchema.parse({ ...base, type, cameraId: extra.cameraId ?? '', name: base.name || 'Camera' });
    case 'webpage':
      return WidgetSchema.parse({
        ...base,
        type,
        url: extra.url ?? 'https://example.com',
        name: base.name || 'Web page',
      });
    case 'text':
      return WidgetSchema.parse({ ...base, type, content: extra.content ?? 'New text', name: base.name || 'Text' });
    case 'clock':
      return WidgetSchema.parse({ ...base, type, name: base.name || 'Clock' });
    case 'youtube':
      return WidgetSchema.parse({ ...base, type, url: extra.url ?? '', name: base.name || 'YouTube' });
  }
}

export function defaultLayout(name: string, adminUrlHint = 'http://<pi-ip>:8080/'): Layout {
  const ts = nowIso();
  return {
    id: newId(),
    name,
    background: '#000000',
    createdAt: ts,
    updatedAt: ts,
    widgets: [
      defaultWidget('clock', { x: 5, y: 8, w: 90, h: 30 }, { name: 'Clock', fontSize: 14, showSeconds: true }),
      defaultWidget(
        'text',
        { x: 10, y: 48, w: 80, h: 40 },
        {
          name: 'Welcome',
          content: `Welcome to piMarquee\n\nOpen ${adminUrlHint} from another device to configure this display.`,
          fontSize: 4,
          align: 'center',
          valign: 'middle',
          color: '#cfd8dc',
        },
      ),
    ],
  };
}

export function defaultConfig(): Config {
  const layout = defaultLayout('Default');
  return ConfigSchema.parse({
    version: CONFIG_VERSION,
    settings: {},
    cameras: [],
    layouts: [layout],
    display: { activeLayoutId: layout.id, power: 'on' },
    auth: {},
  });
}
