import { Bonjour, type Service } from 'bonjour-service';
import { env } from './env.js';

let instance: Bonjour | null = null;
let service: Service | null = null;

/** Advertise the server on the LAN so the Android app can find it without typing an IP. */
export function startMdns(name: string, port: number, warn: (msg: string) => void = console.warn): void {
  try {
    instance = new Bonjour();
    service = instance.publish({
      name: `${name} (pimarquee)`,
      type: 'pimarquee',
      protocol: 'tcp',
      port,
      txt: { version: env.version, path: '/api/v1' },
      // Skip the name-conflict probe: after a restart our own previous announcement is still cached
      // on the network for a couple of minutes and would make the probe fail with
      // "Service name is already in use". There is only ever one of us per host.
      probe: false,
    });
    service.on('error', (err: Error) => warn(`mdns: ${err.message}`));
  } catch (err) {
    warn(`mdns: failed to advertise: ${(err as Error).message}`);
  }
}

export async function stopMdns(): Promise<void> {
  const inst = instance;
  const svc = service;
  instance = null;
  service = null;
  if (!inst) return;
  await new Promise<void>((resolve) => {
    const done = () => {
      try {
        inst.destroy();
      } catch {
        /* ignore */
      }
      resolve();
    };
    const t = setTimeout(done, 1000);
    if (svc) {
      try {
        svc.stop(() => {
          clearTimeout(t);
          done();
        });
        return;
      } catch {
        /* fall through */
      }
    }
    clearTimeout(t);
    done();
  });
}
