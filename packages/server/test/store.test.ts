import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ConfigStore } from '../src/config/store.js';

async function tmpPath(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pimarquee-'));
  return path.join(dir, 'config.json');
}

describe('ConfigStore', () => {
  it('creates a default config when the file is missing', async () => {
    const p = await tmpPath();
    const store = await ConfigStore.load(p);
    expect(store.config.layouts.length).toBe(1);
    const onDisk = JSON.parse(await fs.readFile(p, 'utf8'));
    expect(onDisk.version).toBe(1);
  });

  it('persists updates atomically and bumps the revision', async () => {
    const p = await tmpPath();
    const store = await ConfigStore.load(p);
    const rev = store.rev;
    await store.update('settings', (d) => {
      d.settings.displayName = 'Kitchen';
    });
    expect(store.rev).toBe(rev + 1);
    const again = await ConfigStore.load(p);
    expect(again.config.settings.displayName).toBe('Kitchen');
    await expect(fs.stat(`${p}.tmp`)).rejects.toThrow();
  });

  it('rejects invalid mutations without changing state', async () => {
    const p = await tmpPath();
    const store = await ConfigStore.load(p);
    await expect(
      store.update('display', (d) => {
        d.display.activeLayoutId = 'nope';
      }),
    ).rejects.toThrow();
    expect(store.config.display.activeLayoutId).toBe(store.config.layouts[0]!.id);
  });

  it('emits change events with scope', async () => {
    const p = await tmpPath();
    const store = await ConfigStore.load(p);
    const seen: string[] = [];
    store.on('change', (c: { scope: string }) => seen.push(c.scope));
    await store.update('cameras', () => undefined);
    expect(seen).toEqual(['cameras']);
  });
});
