/** Minimal typed client for go2rtc's HTTP API (default http://127.0.0.1:1984). */

export interface Go2rtcMedia {
  codec?: string;
  channels?: number;
  rate?: number;
  width?: number;
  height?: number;
  [k: string]: unknown;
}

export interface Go2rtcProducer {
  url?: string;
  medias?: string[];
  receivers?: unknown[];
  [k: string]: unknown;
}

export interface Go2rtcStreamInfo {
  producers?: Go2rtcProducer[];
  consumers?: unknown[];
}

export type Go2rtcStreams = Record<string, Go2rtcStreamInfo | null>;

export class Go2rtcClient {
  constructor(private readonly baseUrl: string) {}

  private async req(path: string, init?: RequestInit, timeoutMs = 8000): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetch(`${this.baseUrl}${path}`, { ...init, signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  }

  async isReachable(): Promise<boolean> {
    try {
      const r = await this.req('/api', undefined, 2000);
      return r.ok;
    } catch {
      return false;
    }
  }

  async listStreams(): Promise<Go2rtcStreams> {
    const r = await this.req('/api/streams');
    if (!r.ok) throw new Error(`go2rtc list streams: HTTP ${r.status}`);
    return (await r.json()) as Go2rtcStreams;
  }

  async putStream(name: string, src: string): Promise<void> {
    const q = new URLSearchParams({ name, src });
    const r = await this.req(`/api/streams?${q.toString()}`, { method: 'PUT' });
    if (!r.ok) throw new Error(`go2rtc put stream ${name}: HTTP ${r.status}`);
  }

  async deleteStream(name: string): Promise<void> {
    const q = new URLSearchParams({ src: name });
    const r = await this.req(`/api/streams?${q.toString()}`, { method: 'DELETE' });
    if (!r.ok && r.status !== 404) throw new Error(`go2rtc delete stream ${name}: HTTP ${r.status}`);
  }

  /** Ask go2rtc to open the source and report its codecs/medias. */
  async probe(name: string): Promise<Go2rtcStreamInfo> {
    const q = new URLSearchParams({ src: name });
    const r = await this.req(`/api/streams?${q.toString()}`, undefined, 15000);
    if (!r.ok) throw new Error(`go2rtc probe ${name}: HTTP ${r.status}`);
    return (await r.json()) as Go2rtcStreamInfo;
  }

  /** Fetch one JPEG frame (used for thumbnails). */
  async frame(name: string): Promise<{ body: ArrayBuffer; contentType: string }> {
    const q = new URLSearchParams({ src: name });
    const r = await this.req(`/api/frame.jpeg?${q.toString()}`, undefined, 15000);
    if (!r.ok) throw new Error(`go2rtc frame ${name}: HTTP ${r.status}`);
    return { body: await r.arrayBuffer(), contentType: r.headers.get('content-type') ?? 'image/jpeg' };
  }
}

/** Summarise producer medias from a probe into something the admin UI can show. */
export function summariseProbe(info: Go2rtcStreamInfo): { medias: string[]; hasH264: boolean; hasH265: boolean; error: string | null } {
  const medias: string[] = [];
  for (const p of info.producers ?? []) {
    for (const m of p.medias ?? []) medias.push(m);
  }
  const joined = medias.join(' ').toUpperCase();
  const hasH264 = joined.includes('H264');
  const hasH265 = joined.includes('H265') || joined.includes('HEVC');
  const error = medias.length === 0 ? 'no media found (check URL, credentials and that the camera is reachable)' : null;
  return { medias, hasH264, hasH265, error };
}
