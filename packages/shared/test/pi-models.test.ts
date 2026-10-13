import { describe, expect, it } from 'vitest';
import { decodeRevision, familyFromModelString, resolvePiInfo } from '../src/pi-models.js';

describe('decodeRevision', () => {
  it('decodes a Pi 4B 4GB (c03114)', () => {
    expect(decodeRevision('c03114')).toEqual({ family: 'pi4', ramMB: 4096, type: 0x11 });
  });
  it('decodes a Pi 5 8GB (d04170)', () => {
    expect(decodeRevision('d04170')).toEqual({ family: 'pi5', ramMB: 8192, type: 0x17 });
  });
  it('decodes a Zero 2 W (902120)', () => {
    expect(decodeRevision('902120')).toEqual({ family: 'zero2', ramMB: 512, type: 0x12 });
  });
  it('treats legacy codes as pi1', () => {
    expect(decodeRevision('000e')?.family).toBe('pi1');
  });
  it('returns null on garbage', () => {
    expect(decodeRevision('zz')).toBeNull();
  });
});

describe('familyFromModelString', () => {
  it.each([
    ['Raspberry Pi 4 Model B Rev 1.4', 'pi4'],
    ['Raspberry Pi 400 Rev 1.0', 'pi4'],
    ['Raspberry Pi Compute Module 4 Rev 1.0', 'pi4'],
    ['Raspberry Pi 5 Model B Rev 1.0', 'pi5'],
    ['Raspberry Pi Zero 2 W Rev 1.0', 'zero2'],
    ['Raspberry Pi Zero W Rev 1.1', 'zero'],
    ['Raspberry Pi 3 Model B Plus Rev 1.3', 'pi3'],
    ['Some other board', 'unknown'],
  ])('%s -> %s', (model, family) => {
    expect(familyFromModelString(model)).toBe(family);
  });
});

describe('resolvePiInfo', () => {
  it('uses model string + revision RAM for a Pi 4', () => {
    const info = resolvePiInfo('Raspberry Pi 4 Model B Rev 1.4\u0000', 'c03114');
    expect(info.family).toBe('pi4');
    expect(info.ramMB).toBe(4096);
    expect(info.defaultMaxStreams).toBe(2);
    expect(info.source).toBe('device-tree');
  });
  it('drops a 1GB Pi 4 to one stream', () => {
    const info = resolvePiInfo('Raspberry Pi 4 Model B Rev 1.1', 'a03111');
    expect(info.ramMB).toBe(1024);
    expect(info.defaultMaxStreams).toBe(1);
  });
  it('falls back to cpuinfo when model string is absent', () => {
    const info = resolvePiInfo(null, 'd04170');
    expect(info.family).toBe('pi5');
    expect(info.defaultMaxStreams).toBe(4);
    expect(info.source).toBe('cpuinfo');
  });
  it('returns unknown with two streams on a dev laptop', () => {
    const info = resolvePiInfo(null, null);
    expect(info.family).toBe('unknown');
    expect(info.defaultMaxStreams).toBe(2);
    expect(info.source).toBe('fallback');
  });
});
