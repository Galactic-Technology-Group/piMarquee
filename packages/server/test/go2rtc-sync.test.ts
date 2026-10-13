import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { desiredStreams, renderGo2rtcYaml } from '../src/go2rtc/sync.js';

describe('go2rtc sync helpers', () => {
  it('only includes enabled cameras', () => {
    const s = desiredStreams([
      { id: 'a', name: 'A', rtspUrl: 'rtsp://a/1', enabled: true, go2rtcName: 'cam_a' },
      { id: 'b', name: 'B', rtspUrl: 'rtsp://b/1', enabled: false, go2rtcName: 'cam_b' },
    ]);
    expect(s).toEqual({ cam_a: 'rtsp://a/1' });
  });

  it('merges streams into the template', () => {
    const tpl = 'api:\n  listen: ":1984"\nwebrtc:\n  listen: ":8555"\nstreams: {}\n';
    const out = renderGo2rtcYaml(tpl, { cam_a: 'rtsp://user:pw@a/1' });
    const doc = YAML.parse(out);
    expect(doc.api.listen).toBe(':1984');
    expect(doc.streams.cam_a).toBe('rtsp://user:pw@a/1');
  });
});
