import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { env } from '../env.js';

const execFileP = promisify(execFile);

const UNITS = {
  go2rtc: 'go2rtc.service',
  kiosk: 'pimarquee-kiosk.service',
  server: 'pimarquee.service',
} as const;

export type ServiceName = keyof typeof UNITS;

/** Restart one of the allow-listed units via sudo (see systemd/pimarquee-sudoers). */
export async function restartService(name: ServiceName): Promise<void> {
  if (env.noSystem) throw new Error('service control is disabled on this host');
  await execFileP('sudo', ['-n', '/bin/systemctl', 'restart', UNITS[name]], { timeout: 15000 });
}

export async function rebootHost(): Promise<void> {
  if (env.noSystem) throw new Error('service control is disabled on this host');
  await execFileP('sudo', ['-n', '/sbin/reboot'], { timeout: 5000 });
}
