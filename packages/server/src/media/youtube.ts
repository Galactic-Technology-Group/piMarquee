import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { extractYoutubeId, type Config, type MediaStatus, type YoutubeWidget } from '@pimarquee/shared';

export interface MediaLogger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
}

interface Entry extends MediaStatus {
  maxHeight: number;
}

const META_SUFFIX = '.json';

/**
 * Downloads the YouTube videos referenced by "download" mode widgets with yt-dlp and keeps
 * `<mediaDir>/<videoId>.mp4` around for the display to play. One download at a time, so a
 * Pi never saturates its network or CPU; retries with backoff when YouTube or yt-dlp hiccup.
 */
export class MediaManager extends EventEmitter {
  private entries = new Map<string, Entry>();
  private queue: string[] = [];
  private running = false;
  private wanted = new Map<string, number>(); // videoId -> maxHeight
  private retryTimers = new Map<string, NodeJS.Timeout>();
  private failures = new Map<string, number>();
  private updateTimer: NodeJS.Timeout | null = null;
  /** Without ffmpeg yt-dlp cannot merge separate video+audio streams, so we fall back to pre-muxed files. */
  private hasFfmpeg = true;
  private cookiesFile: string | null = null;

  constructor(
    private readonly dir: string,
    private readonly bin: string,
    private readonly extraArgs: string[],
    private readonly log: MediaLogger,
  ) {
    super();
  }

  /** Scan the media directory so already-downloaded videos are "ready" immediately after boot. */
  async init(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const ff = await run('ffmpeg', ['-version'], 10000);
    this.hasFfmpeg = !ff.spawnError && ff.code === 0;
    if (!this.hasFfmpeg) this.log.warn({}, 'ffmpeg not found: YouTube downloads limited to pre-muxed formats (<=720p)');
    const files = await fs.readdir(this.dir);
    for (const f of files) {
      if (!f.endsWith('.mp4')) continue;
      const videoId = f.slice(0, -4);
      const stat = await fs.stat(path.join(this.dir, f)).catch(() => null);
      if (!stat) continue;
      let title: string | null = null;
      try {
        const meta = JSON.parse(await fs.readFile(path.join(this.dir, `${videoId}${META_SUFFIX}`), 'utf8')) as { title?: string };
        title = meta.title ?? null;
      } catch {
        /* no metadata */
      }
      this.entries.set(videoId, {
        videoId,
        status: 'ready',
        src: `/media/${f}`,
        title,
        bytes: stat.size,
        error: null,
        updatedAt: stat.mtime.toISOString(),
        maxHeight: 0,
      });
    }
    // Leftovers from an interrupted download.
    for (const f of files) if (f.includes('.part') || f.endsWith('.tmp.mp4') || f.endsWith('.ytdl')) await fs.rm(path.join(this.dir, f), { force: true });
  }

  status(videoId: string): MediaStatus | null {
    const e = this.entries.get(videoId);
    if (!e) return null;
    const { maxHeight: _mh, ...pub } = e;
    void _mh;
    return pub;
  }

  list(): MediaStatus[] {
    return [...this.entries.keys()].map((id) => this.status(id)!).sort((a, b) => a.videoId.localeCompare(b.videoId));
  }

  /** Reconcile with the config: download what is referenced, delete what no longer is. */
  async sync(config: Config): Promise<void> {
    const wanted = new Map<string, number>();
    for (const l of config.layouts) {
      for (const w of l.widgets) {
        if (w.type !== 'youtube' || w.mode !== 'download') continue;
        const id = extractYoutubeId(w.url);
        if (!id) continue;
        wanted.set(id, Math.max(wanted.get(id) ?? 0, (w as YoutubeWidget).maxHeight));
      }
    }
    this.wanted = wanted;

    for (const [id, maxHeight] of wanted) {
      const e = this.entries.get(id);
      if (!e || e.status === 'error' || e.status === 'unavailable') this.enqueue(id, maxHeight);
    }
    for (const id of [...this.entries.keys()]) {
      if (!wanted.has(id)) await this.remove(id);
    }
  }

  /** Force a fresh download (admin "Re-download"). */
  async refresh(videoId: string): Promise<void> {
    const maxHeight = this.wanted.get(videoId) ?? 720;
    this.failures.delete(videoId);
    await this.deleteFiles(videoId);
    this.entries.delete(videoId);
    this.enqueue(videoId, maxHeight);
  }

  private enqueue(videoId: string, maxHeight: number): void {
    if (this.queue.includes(videoId)) return;
    const existing = this.entries.get(videoId);
    if (existing?.status === 'downloading') return;
    this.set(videoId, { status: 'pending', src: null, title: existing?.title ?? null, bytes: null, error: null, maxHeight });
    this.queue.push(videoId);
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    const videoId = this.queue.shift();
    if (!videoId) return;
    this.running = true;
    try {
      await this.download(videoId);
    } finally {
      this.running = false;
      void this.pump();
    }
  }

  private async download(videoId: string): Promise<void> {
    const entry = this.entries.get(videoId);
    const maxHeight = entry?.maxHeight || 720;
    if (!this.wanted.has(videoId)) return; // removed while queued
    this.set(videoId, { status: 'downloading', error: null });

    const tmp = path.join(this.dir, `${videoId}.tmp.mp4`);
    const finalFile = path.join(this.dir, `${videoId}.mp4`);
    await this.deleteTemporaries(videoId);

    // Prefer H.264 + AAC at or below the requested height: that is what a Pi can decode.
    // With ffmpeg: best video + best audio merged into mp4. Without: best single pre-muxed file.
    const formatArgs = this.hasFfmpeg
      ? ['-f', 'bv*+ba/b', '-S', `res:${maxHeight},vcodec:h264,acodec:aac`, '--merge-output-format', 'mp4']
      : ['-f', 'b[ext=mp4]/b', '-S', `res:${maxHeight},vcodec:h264,acodec:aac`];
    // Optional Netscape-format cookies file: lets yt-dlp act as a signed-in browser when YouTube
    // challenges the Pi's IP. Created by the user; never written by us.
    const cookiesFile = path.join(path.dirname(this.dir), 'yt-cookies.txt');
    const cookieArgs = (await fs.stat(cookiesFile).catch(() => null)) ? ['--cookies', cookiesFile] : [];
    this.cookiesFile = cookiesFile;
    const args = [
      ...this.extraArgs,
      ...cookieArgs,
      '--no-playlist',
      '--no-progress',
      '--no-warnings',
      '--no-cache-dir',
      ...formatArgs,
      '--print',
      'after_move:%(title)s',
      '-o',
      tmp,
      `https://www.youtube.com/watch?v=${videoId}`,
    ];

    const result = await run(this.bin, args, 15 * 60 * 1000);
    if (result.code !== 0) {
      await this.deleteTemporaries(videoId);
      const stderr = result.stderr.trim().split('\n').filter(Boolean).slice(-3).join(' | ');
      const botCheck = /Sign in to confirm you.re not a bot/i.test(stderr);
      const msg = result.spawnError
        ? `yt-dlp not found (${this.bin}). Install it on the Pi or switch the widget to Embed mode.`
        : botCheck
          ? 'YouTube asked for a sign-in ("confirm you are not a bot") from this network. Retrying later; if it persists, export browser cookies to ' +
            `${this.cookiesFile ?? '<data dir>/yt-cookies.txt'} or use Embed mode.`
          : stderr.slice(0, 400) || `yt-dlp exited with code ${result.code}`;
      const permanent = /Video unavailable|Private video|This video is not available|has been removed|members-only|Sign in to confirm your age/i.test(stderr);
      this.set(videoId, { status: permanent ? 'unavailable' : 'error', error: msg });
      this.log.warn({ videoId, msg }, 'youtube download failed');
      if (!permanent && !result.spawnError) this.scheduleRetry(videoId, maxHeight);
      return;
    }

    const stat = await fs.stat(tmp).catch(() => null);
    if (!stat || stat.size < 1024) {
      await this.deleteTemporaries(videoId);
      this.set(videoId, { status: 'error', error: 'yt-dlp produced no merged output file (is ffmpeg installed?)' });
      this.scheduleRetry(videoId, maxHeight);
      return;
    }
    await fs.rename(tmp, finalFile);
    const title = result.stdout.trim().split('\n').pop() || null;
    await fs.writeFile(path.join(this.dir, `${videoId}${META_SUFFIX}`), JSON.stringify({ title, maxHeight, downloadedAt: new Date().toISOString() }), 'utf8');
    this.failures.delete(videoId);
    this.set(videoId, { status: 'ready', src: `/media/${videoId}.mp4`, title, bytes: stat.size, error: null });
    this.log.info({ videoId, title, bytes: stat.size }, 'youtube download complete');
  }

  private scheduleRetry(videoId: string, maxHeight: number): void {
    const n = (this.failures.get(videoId) ?? 0) + 1;
    this.failures.set(videoId, n);
    const delay = Math.min(60 * 60 * 1000, 30 * 1000 * 2 ** Math.min(n, 7)); // 1 min .. 1 h
    const t = setTimeout(() => {
      this.retryTimers.delete(videoId);
      if (this.wanted.has(videoId)) this.enqueue(videoId, maxHeight);
    }, delay);
    this.retryTimers.set(videoId, t);
  }

  private async remove(videoId: string): Promise<void> {
    const t = this.retryTimers.get(videoId);
    if (t) clearTimeout(t);
    this.retryTimers.delete(videoId);
    this.queue = this.queue.filter((q) => q !== videoId);
    this.entries.delete(videoId);
    await this.deleteFiles(videoId);
    this.emit('change', videoId);
  }

  private async deleteFiles(videoId: string): Promise<void> {
    const files = await fs.readdir(this.dir).catch(() => [] as string[]);
    for (const f of files) {
      // final file, metadata, and any yt-dlp temporaries (<id>.tmp.f137.mp4, .part, .ytdl ...)
      if (f === `${videoId}.mp4` || f === `${videoId}${META_SUFFIX}` || f.startsWith(`${videoId}.tmp`)) {
        await fs.rm(path.join(this.dir, f), { force: true }).catch(() => undefined);
      }
    }
  }

  private async deleteTemporaries(videoId: string): Promise<void> {
    const files = await fs.readdir(this.dir).catch(() => [] as string[]);
    for (const f of files) {
      if (f.startsWith(`${videoId}.tmp`)) await fs.rm(path.join(this.dir, f), { force: true }).catch(() => undefined);
    }
  }

  private set(videoId: string, patch: Partial<Entry>): void {
    const prev = this.entries.get(videoId);
    const next: Entry = {
      videoId,
      status: 'pending',
      src: null,
      title: null,
      bytes: null,
      error: null,
      maxHeight: 720,
      ...prev,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.entries.set(videoId, next);
    this.emit('change', videoId);
  }

  /** `yt-dlp -U` keeps up with YouTube changes; the standalone binary updates itself in place. */
  startSelfUpdate(intervalMs = 24 * 60 * 60 * 1000): void {
    const update = async () => {
      const r = await run(this.bin, ['-U'], 5 * 60 * 1000);
      if (r.spawnError) return;
      const line = (r.stdout + r.stderr).trim().split('\n').pop() ?? '';
      this.log.info({ line }, 'yt-dlp self-update');
    };
    void update();
    this.updateTimer = setInterval(() => void update(), intervalMs);
  }

  stop(): void {
    if (this.updateTimer) clearInterval(this.updateTimer);
    for (const t of this.retryTimers.values()) clearTimeout(t);
  }
}

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  spawnError: boolean;
}

function run(bin: string, args: string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let spawnError = false;
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      spawnError = true;
      stderr += err.message;
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: spawnError ? 127 : code, stdout, stderr, spawnError });
    });
  });
}
