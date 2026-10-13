import { Bonjour, type Service } from 'bonjour-service';
import { env } from './env.js';

let instance: Bonjour | null = null;
let service: Service | null = null;

/** Advertise the server on the LAN so the Android app can find it without typing an IP. */
export function startMdns(name: string, port: number): void {
  try {
    instance = new Bonjour();
    service = instance.publish({
      name: `${name} (pimarquee)`,
      type: 'pimarquee',
      protocol: 'tcp',
      port,
      txt: { version: env.version, path: '/api/v1' },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[mdns] failed to advertise:', (err as Error).message);
  }
}

export async function stopMdns(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (!instance) return resolve();
    const inst = instance;
    instance = null;
    if (service) {
      service.stop?.(() => {
        inst.destroy();
        resolve();
      });
      setTimeout(resolve, 1000);
    } else {
      inst.destroy();
      resolve();
    }
  });
}
