import fs from 'node:fs/promises';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export interface SystemMetrics {
  cpuTempC: number | null;
  load1: number | null;
  memUsedMB: number | null;
  memTotalMB: number | null;
  /** Raw hex from `vcgencmd get_throttled`, e.g. "0x50000". null when unavailable. */
  throttled: string | null;
  uptimeSec: number;
}

export async function readCpuTemp(): Promise<number | null> {
  try {
    const raw = await fs.readFile('/sys/class/thermal/thermal_zone0/temp', 'utf8');
    const milli = Number(raw.trim());
    return Number.isFinite(milli) ? Math.round(milli / 100) / 10 : null;
  } catch {
    return null;
  }
}

let throttledSupported = process.platform === 'linux';

export async function readThrottled(): Promise<string | null> {
  if (!throttledSupported) return null;
  try {
    const { stdout } = await execFileP('vcgencmd', ['get_throttled'], { timeout: 2000 });
    const m = /throttled=(0x[0-9a-fA-F]+)/.exec(stdout);
    return m?.[1] ?? null;
  } catch {
    throttledSupported = false;
    return null;
  }
}

export async function collectMetrics(): Promise<SystemMetrics> {
  const [cpuTempC, throttled] = await Promise.all([readCpuTemp(), readThrottled()]);
  const total = os.totalmem();
  const free = os.freemem();
  return {
    cpuTempC,
    load1: os.loadavg()[0] ?? null,
    memUsedMB: Math.round((total - free) / 1048576),
    memTotalMB: Math.round(total / 1048576),
    throttled,
    uptimeSec: Math.round(process.uptime()),
  };
}

/** Human readable decode of the vcgencmd throttled bitmask. */
export function describeThrottled(hex: string | null): string[] {
  if (!hex) return [];
  const v = parseInt(hex, 16);
  const flags: [number, string][] = [
    [0, 'under-voltage now'],
    [1, 'arm frequency capped now'],
    [2, 'currently throttled'],
    [3, 'soft temperature limit active'],
    [16, 'under-voltage has occurred'],
    [17, 'arm frequency capping has occurred'],
    [18, 'throttling has occurred'],
    [19, 'soft temperature limit has occurred'],
  ];
  return flags.filter(([bit]) => v & (1 << bit)).map(([, label]) => label);
}
