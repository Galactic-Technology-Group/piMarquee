import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Settings } from '@pimarquee/shared';
import { env } from '../env.js';

const execFileP = promisify(execFile);

export type PowerMethod = Settings['displayPowerMethod'];

export interface PowerResult {
  method: 'wlr-randr' | 'cec' | 'software';
  ok: boolean;
  error?: string;
}

/** Find the Wayland socket of the kiosk session (backend and kiosk share the `pimarquee` user). */
async function waylandEnv(): Promise<NodeJS.ProcessEnv | null> {
  const runtimeDir = process.env.XDG_RUNTIME_DIR ?? (typeof process.getuid === 'function' ? `/run/user/${process.getuid()}` : null);
  if (!runtimeDir) return null;
  try {
    const entries = await fs.readdir(runtimeDir);
    const sock = entries.find((e) => /^wayland-\d+$/.test(e));
    if (!sock) return null;
    return { ...process.env, XDG_RUNTIME_DIR: runtimeDir, WAYLAND_DISPLAY: sock };
  } catch {
    return null;
  }
}

async function wlrRandr(on: boolean): Promise<PowerResult> {
  const wenv = await waylandEnv();
  if (!wenv) return { method: 'wlr-randr', ok: false, error: 'no wayland socket found' };
  try {
    const { stdout } = await execFileP('wlr-randr', [], { env: wenv, timeout: 5000 });
    const outputs = stdout
      .split('\n')
      .filter((l) => /^\S/.test(l))
      .map((l) => l.split(/\s+/)[0])
      .filter((o): o is string => Boolean(o));
    if (outputs.length === 0) return { method: 'wlr-randr', ok: false, error: 'no outputs reported' };
    for (const o of outputs) {
      await execFileP('wlr-randr', ['--output', o, on ? '--on' : '--off'], { env: wenv, timeout: 5000 });
    }
    return { method: 'wlr-randr', ok: true };
  } catch (err) {
    return { method: 'wlr-randr', ok: false, error: (err as Error).message };
  }
}

async function cec(on: boolean): Promise<PowerResult> {
  try {
    // cec-ctl from v4l-utils / cec-utils. Needs the TV to honour CEC.
    const args = on ? ['--to', '0', '--image-view-on'] : ['--to', '0', '--standby'];
    await execFileP('cec-ctl', ['-s', ...args], { timeout: 5000 });
    return { method: 'cec', ok: true };
  } catch (err) {
    return { method: 'cec', ok: false, error: (err as Error).message };
  }
}

/**
 * Turn the physical display on/off. The software blackout on the display page is
 * always applied by the caller; this adds a real power-off where the hardware allows.
 */
export async function setDisplayPower(on: boolean, method: PowerMethod): Promise<PowerResult> {
  if (env.noSystem || method === 'software') return { method: 'software', ok: true };
  if (method === 'wlr-randr') return wlrRandr(on);
  if (method === 'cec') return cec(on);
  // auto: prefer compositor control, fall back to CEC, finally software.
  const r = await wlrRandr(on);
  if (r.ok) return r;
  const c = await cec(on);
  if (c.ok) return c;
  return { method: 'software', ok: true, error: `wlr-randr: ${r.error}; cec: ${c.error}` };
}

export const KIOSK_PROFILE_DIR = path.join(path.dirname(env.configPath), 'chromium');
