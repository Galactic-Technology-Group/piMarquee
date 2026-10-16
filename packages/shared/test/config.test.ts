import { describe, expect, it } from 'vitest';
import { ConfigSchema, defaultConfig, defaultWidget } from '../src/index.js';

describe('defaultWidget', () => {
  it.each(['camera', 'webpage', 'text', 'clock', 'youtube'] as const)('creates a valid default %s widget', (type) => {
    const w = defaultWidget(type, { x: 0, y: 0, w: 50, h: 50 }, type === 'camera' ? { cameraId: 'x' } : {});
    expect(w.type).toBe(type);
  });
});

describe('ConfigSchema', () => {
  it('accepts the default config', () => {
    const cfg = defaultConfig();
    expect(ConfigSchema.safeParse(cfg).success).toBe(true);
    expect(cfg.layouts[0]?.widgets.length).toBe(2);
    expect(cfg.display.activeLayoutId).toBe(cfg.layouts[0]?.id);
  });
  it('rejects a camera widget pointing at an unknown camera', () => {
    const cfg = defaultConfig();
    cfg.layouts[0]!.widgets.push(defaultWidget('camera', { x: 0, y: 0, w: 50, h: 50 }, { cameraId: 'nope' }));
    expect(ConfigSchema.safeParse(cfg).success).toBe(false);
  });
  it('rejects an unknown active layout', () => {
    const cfg = defaultConfig();
    cfg.display.activeLayoutId = 'missing';
    expect(ConfigSchema.safeParse(cfg).success).toBe(false);
  });
  it('rejects widget rects outside the canvas', () => {
    const cfg = defaultConfig();
    cfg.layouts[0]!.widgets[0]!.rect.x = 120;
    expect(ConfigSchema.safeParse(cfg).success).toBe(false);
  });
});
