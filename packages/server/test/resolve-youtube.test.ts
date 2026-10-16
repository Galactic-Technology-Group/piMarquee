import { describe, expect, it } from 'vitest';
import { ConfigSchema, defaultConfig, defaultWidget, resolvePiInfo, type MediaStatus } from '@pimarquee/shared';
import { buildResolvedLayout } from '../src/config/resolve.js';

const pi = resolvePiInfo('Raspberry Pi 4 Model B Rev 1.4', 'c03114');

function withYoutube(url: string, mode: 'download' | 'embed') {
  const cfg = defaultConfig();
  cfg.layouts[0]!.widgets = [defaultWidget('youtube', { x: 0, y: 0, w: 50, h: 50 }, { url, mode, name: 'yt' })];
  return ConfigSchema.parse(cfg);
}

describe('buildResolvedLayout: youtube widgets', () => {
  it('extracts the video id and attaches media status in download mode', () => {
    const cfg = withYoutube('https://youtu.be/dQw4w9WgXcQ', 'download');
    const ready: MediaStatus = {
      videoId: 'dQw4w9WgXcQ',
      status: 'ready',
      progress: null,
      src: '/media/dQw4w9WgXcQ.mp4',
      title: 'Test',
      bytes: 1234,
      error: null,
      updatedAt: new Date().toISOString(),
    };
    const r = buildResolvedLayout(cfg, pi, 1, undefined, (id) => (id === 'dQw4w9WgXcQ' ? ready : null));
    const w = r.layout!.widgets[0]!;
    expect(w.type).toBe('youtube');
    if (w.type !== 'youtube') return;
    expect(w.videoId).toBe('dQw4w9WgXcQ');
    expect(w.media?.status).toBe('ready');
    expect(w.media?.src).toBe('/media/dQw4w9WgXcQ.mp4');
  });

  it('leaves media null in embed mode and for unparseable links', () => {
    const embed = buildResolvedLayout(withYoutube('https://youtu.be/dQw4w9WgXcQ', 'embed'), pi, 1);
    const w1 = embed.layout!.widgets[0]!;
    expect(w1.type === 'youtube' && w1.media).toBeNull();
    expect(w1.type === 'youtube' && w1.videoId).toBe('dQw4w9WgXcQ');

    const bad = buildResolvedLayout(withYoutube('https://example.com/nope', 'download'), pi, 1);
    const w2 = bad.layout!.widgets[0]!;
    expect(w2.type === 'youtube' && w2.videoId).toBeNull();
  });

  it('does not count youtube widgets against the camera stream limit', () => {
    const r = buildResolvedLayout(withYoutube('dQw4w9WgXcQ', 'download'), pi, 1);
    expect(r.streamsUsed).toBe(0);
  });
});
