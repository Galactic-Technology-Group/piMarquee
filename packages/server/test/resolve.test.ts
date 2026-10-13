import { describe, expect, it } from 'vitest';
import { ConfigSchema, defaultConfig, defaultWidget, resolvePiInfo, type Config } from '@pimarquee/shared';
import { buildResolvedLayout, effectiveMaxStreams } from '../src/config/resolve.js';

function configWithCameras(n: number, priorities: number[] = []): Config {
  const cfg = defaultConfig();
  const layout = cfg.layouts[0]!;
  layout.widgets = [];
  for (let i = 0; i < n; i++) {
    const id = `cam${i}`;
    cfg.cameras.push({ id, name: `Camera ${i}`, rtspUrl: `rtsp://cam${i}/stream`, enabled: true, go2rtcName: `cam_${id}` });
    layout.widgets.push(
      defaultWidget('camera', { x: i * 10, y: 0, w: 30, h: 30 }, { cameraId: id, priority: priorities[i] ?? 100, name: `W${i}` }),
    );
  }
  return ConfigSchema.parse(cfg);
}

const pi4 = resolvePiInfo('Raspberry Pi 4 Model B Rev 1.4', 'c03114');

describe('effectiveMaxStreams', () => {
  it('uses the detected default', () => {
    expect(effectiveMaxStreams(defaultConfig(), pi4)).toBe(2);
  });
  it('honours the override', () => {
    const cfg = defaultConfig();
    cfg.settings.maxStreamsOverride = 3;
    expect(effectiveMaxStreams(cfg, pi4)).toBe(3);
  });
});

describe('buildResolvedLayout', () => {
  it('returns a null layout when nothing is active', () => {
    const cfg = defaultConfig();
    cfg.display.activeLayoutId = null;
    const r = buildResolvedLayout(cfg, pi4, 1);
    expect(r.layout).toBeNull();
    expect(r.streamsUsed).toBe(0);
  });

  it('allows up to the limit and marks the rest', () => {
    const cfg = configWithCameras(3);
    const r = buildResolvedLayout(cfg, pi4, 1);
    const cams = r.layout!.widgets.filter((w) => w.type === 'camera');
    expect(cams.filter((w) => w.type === 'camera' && w.stream.allowed).length).toBe(2);
    expect(cams.find((w) => w.type === 'camera' && !w.stream.allowed && w.stream.reason === 'limit')).toBeTruthy();
    expect(r.streamsUsed).toBe(2);
    expect(r.maxStreams).toBe(2);
  });

  it('prefers lower priority values', () => {
    const cfg = configWithCameras(3, [100, 100, 1]);
    const r = buildResolvedLayout(cfg, pi4, 1);
    const w2 = r.layout!.widgets.find((w) => w.name === 'W2');
    expect(w2?.type === 'camera' && w2.stream.allowed).toBe(true);
  });

  it('marks disabled cameras and resolves auto mode', () => {
    const cfg = configWithCameras(1);
    cfg.cameras[0]!.enabled = false;
    cfg.settings.defaultStreamMode = 'mse';
    const r = buildResolvedLayout(cfg, pi4, 1);
    const w = r.layout!.widgets[0]!;
    expect(w.type === 'camera' && w.stream.reason).toBe('disabled');
    expect(w.type === 'camera' && w.stream.mode).toBe('mse');
  });

  it('skips hidden widgets', () => {
    const cfg = configWithCameras(3);
    cfg.layouts[0]!.widgets[0]!.visible = false;
    const r = buildResolvedLayout(cfg, pi4, 1);
    const allowed = r.layout!.widgets.filter((w) => w.type === 'camera' && w.stream.allowed).map((w) => w.name);
    expect(allowed).toEqual(['W1', 'W2']);
  });
});
