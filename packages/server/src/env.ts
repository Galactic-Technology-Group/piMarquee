import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
/** Repo root when running from source (src/) or from the build (dist/). */
export const REPO_ROOT = path.resolve(here, '..', '..', '..');

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

export const env = {
  version: pkg.version,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  /** Overrides settings.port when set (used by the systemd EnvironmentFile). */
  port: process.env.PORT ? Number(process.env.PORT) : null,
  host: process.env.HOST ?? '0.0.0.0',
  configPath: process.env.CONFIG_PATH ?? path.join(REPO_ROOT, '.dev', 'config.json'),
  go2rtcUrl: process.env.GO2RTC_URL ?? 'http://127.0.0.1:1984',
  /** Where to write the generated go2rtc YAML. Empty = do not write (API-only reconcile). */
  go2rtcConfigPath: process.env.GO2RTC_CONFIG ?? '',
  go2rtcTemplatePath: process.env.GO2RTC_TEMPLATE ?? path.join(REPO_ROOT, 'go2rtc', 'go2rtc.template.yaml'),
  adminDist: process.env.ADMIN_DIST ?? path.join(REPO_ROOT, 'packages', 'admin', 'dist'),
  displayDist: process.env.DISPLAY_DIST ?? path.join(REPO_ROOT, 'packages', 'display', 'dist'),
  /** Set to "1" to disable the sudo/systemctl integration (dev machines). */
  noSystem: process.env.PIMARQUEE_NO_SYSTEM === '1' || process.platform !== 'linux',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  /** Where downloaded YouTube videos live; served at /media/. */
  mediaDir: process.env.MEDIA_DIR ?? path.join(path.dirname(process.env.CONFIG_PATH ?? path.join(REPO_ROOT, '.dev', 'config.json')), 'media'),
  /** yt-dlp executable (self-updating standalone binary on the Pi). */
  ytdlpBin: process.env.YTDLP_BIN ?? 'yt-dlp',
  /** Extra yt-dlp arguments, whitespace separated (e.g. a different JS runtime or a proxy). */
  ytdlpExtraArgs: (process.env.YTDLP_EXTRA_ARGS ?? '--js-runtimes node').split(/\s+/).filter(Boolean),
};
