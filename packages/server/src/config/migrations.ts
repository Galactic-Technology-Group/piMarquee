import { CONFIG_VERSION } from '@pimarquee/shared';

type Migration = (input: Record<string, unknown>) => Record<string, unknown>;

/** version N -> N+1 upgraders, keyed by the version they upgrade FROM. */
const migrations: Record<number, Migration> = {
  // 1: (cfg) => ({ ...cfg, version: 2, ... }),
};

export function migrate(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  let cfg = input as Record<string, unknown>;
  let version = typeof cfg.version === 'number' ? cfg.version : 1;
  while (version < CONFIG_VERSION) {
    const step = migrations[version];
    if (!step) throw new Error(`no migration from config version ${version}`);
    cfg = step(cfg);
    version = typeof cfg.version === 'number' ? cfg.version : version + 1;
  }
  return cfg;
}
