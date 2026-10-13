import fs from 'node:fs/promises';
import { resolvePiInfo, type PiInfo } from '@pimarquee/shared';

async function readModelString(): Promise<string | null> {
  try {
    const buf = await fs.readFile('/proc/device-tree/model');
    return buf.toString('utf8').replace(/\0+$/, '');
  } catch {
    return null;
  }
}

async function readRevision(): Promise<string | null> {
  try {
    const txt = await fs.readFile('/proc/cpuinfo', 'utf8');
    const m = /^Revision\s*:\s*([0-9a-fA-F]+)/m.exec(txt);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Detect the host Raspberry Pi. Safe on any OS: returns an "unknown" PiInfo when not on a Pi. */
export async function detectPi(): Promise<PiInfo> {
  if (process.platform !== 'linux') return resolvePiInfo(null, null);
  const [model, revision] = await Promise.all([readModelString(), readRevision()]);
  return resolvePiInfo(model, revision);
}
