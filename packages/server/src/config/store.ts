import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ConfigSchema, defaultConfig, type Config, type ConfigScope } from '@pimarquee/shared';
import { migrate } from './migrations.js';

export interface ConfigChange {
  scope: ConfigScope;
  rev: number;
  config: Config;
}

/**
 * Single source of truth for configuration. Holds the validated in-memory copy,
 * persists atomically (tmp + rename) and emits 'change' events with a scope hint.
 */
export class ConfigStore extends EventEmitter {
  private _config: Config;
  private _rev = 1;
  private writing: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    initial: Config,
  ) {
    super();
    this._config = initial;
  }

  static async load(filePath: string): Promise<ConfigStore> {
    let config: Config;
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed = migrate(JSON.parse(raw));
      config = ConfigSchema.parse(parsed);
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'ENOENT') {
        config = defaultConfig();
        const store = new ConfigStore(filePath, config);
        await store.persist();
        return store;
      }
      // Corrupt or invalid file: keep it for inspection and start fresh.
      const backup = `${filePath}.corrupt-${Date.now()}`;
      await fs.copyFile(filePath, backup).catch(() => undefined);
      // eslint-disable-next-line no-console
      console.error(`[config] failed to load ${filePath} (${(e as Error).message}); backup at ${backup}`);
      config = defaultConfig();
    }
    return new ConfigStore(filePath, config);
  }

  get config(): Config {
    return this._config;
  }

  get rev(): number {
    return this._rev;
  }

  /**
   * Apply a mutation. The mutator receives a deep clone; the result is validated
   * before it replaces the current config, so a bad write never corrupts state.
   */
  async update(scope: ConfigScope, mutator: (draft: Config) => void | Config): Promise<Config> {
    const draft = structuredClone(this._config);
    const returned = mutator(draft);
    const candidate = returned ?? draft;
    const next = ConfigSchema.parse(candidate);
    this._config = next;
    this._rev += 1;
    await this.persist();
    const change: ConfigChange = { scope, rev: this._rev, config: next };
    this.emit('change', change);
    return next;
  }

  /** Replace the whole config (import). */
  async replace(config: unknown): Promise<Config> {
    return this.update('all', () => ConfigSchema.parse(migrate(config)));
  }

  private persist(): Promise<void> {
    const snapshot = JSON.stringify(this._config, null, 2);
    this.writing = this.writing.then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      await fs.writeFile(tmp, snapshot, 'utf8');
      await fs.rename(tmp, this.filePath);
    });
    return this.writing;
  }
}
