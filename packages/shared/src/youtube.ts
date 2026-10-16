/** YouTube helpers shared by server, display and admin. */

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Extract the 11-character video id from any common YouTube URL form, or null. */
export function extractYoutubeId(input: string): string | null {
  const s = input.trim();
  if (ID_RE.test(s)) return s;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\.|^music\./, '');
  if (host === 'youtu.be') {
    const id = u.pathname.split('/')[1] ?? '';
    return ID_RE.test(id) ? id : null;
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const v = u.searchParams.get('v');
    if (v && ID_RE.test(v)) return v;
    const m = /^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/.exec(u.pathname);
    if (m?.[1]) return m[1];
  }
  return null;
}

export interface EmbedOptions {
  autoplay: boolean;
  muted: boolean;
  loop: boolean;
  startSec: number;
}

/** Privacy-enhanced embed URL (no cookies/login prompt). Looping needs the playlist trick. */
export function youtubeEmbedUrl(videoId: string, o: EmbedOptions): string {
  const q = new URLSearchParams({
    autoplay: o.autoplay ? '1' : '0',
    mute: o.muted ? '1' : '0',
    controls: '0',
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    iv_load_policy: '3',
    disablekb: '1',
    fs: '0',
  });
  if (o.loop) {
    q.set('loop', '1');
    q.set('playlist', videoId);
  }
  if (o.startSec > 0) q.set('start', String(o.startSec));
  return `https://www.youtube-nocookie.com/embed/${videoId}?${q.toString()}`;
}
