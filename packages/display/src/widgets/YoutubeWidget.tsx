import { useEffect, useRef } from 'react';
import { youtubeEmbedUrl, type ResolvedYoutubeWidget } from '@pimarquee/shared';

/**
 * Download mode plays the server's local MP4 in a plain <video> (no ads, no login, seamless loop).
 * Embed mode falls back to YouTube's privacy-enhanced iframe player.
 */
export function YoutubeWidget({ widget }: { widget: ResolvedYoutubeWidget }) {
  if (!widget.videoId) {
    return (
      <div className="placeholder">
        <div className="title">YouTube</div>
        <div className="detail">Not a recognised YouTube link.</div>
      </div>
    );
  }

  if (widget.mode === 'embed') {
    const src = youtubeEmbedUrl(widget.videoId, { autoplay: true, muted: widget.muted, loop: widget.loop, startSec: widget.startSec });
    return (
      <iframe
        key={src}
        title={widget.name || 'YouTube'}
        src={src}
        allow="autoplay; encrypted-media"
        referrerPolicy="strict-origin-when-cross-origin"
        style={{ width: '100%', height: '100%', border: 0, display: 'block', background: '#000' }}
      />
    );
  }

  const media = widget.media;
  if (!media || media.status !== 'ready' || !media.src) {
    const detail =
      !media || media.status === 'pending'
        ? 'Queued for download…'
        : media.status === 'downloading'
          ? 'Downloading video…'
          : media.status === 'unavailable'
            ? `Video unavailable: ${media.error ?? ''}`
            : `Download failed, retrying. ${media.error ?? ''}`;
    return (
      <div className="placeholder">
        <div className="title">{media?.title ?? widget.name ?? 'YouTube'}</div>
        <div className="detail">{detail}</div>
      </div>
    );
  }

  return <LocalVideo src={media.src} loop={widget.loop} muted={widget.muted} fit={widget.fit} startSec={widget.startSec} />;
}

function LocalVideo({ src, loop, muted, fit, startSec }: { src: string; loop: boolean; muted: boolean; fit: 'cover' | 'contain'; startSec: number }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const onMeta = () => {
      if (startSec > 0 && startSec < (v.duration || Infinity)) v.currentTime = startSec;
      void v.play().catch(() => undefined);
    };
    // Looping from the chosen start point rather than from 0.
    const onEnded = () => {
      if (!loop) return;
      v.currentTime = startSec > 0 ? startSec : 0;
      void v.play().catch(() => undefined);
    };
    // If playback stalls (e.g. the file was replaced), reload after a short wait.
    let stallTimer: number | null = null;
    const onStalled = () => {
      if (stallTimer) return;
      stallTimer = window.setTimeout(() => {
        stallTimer = null;
        v.load();
      }, 10000);
    };
    const onPlaying = () => {
      if (stallTimer) {
        window.clearTimeout(stallTimer);
        stallTimer = null;
      }
    };
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('ended', onEnded);
    v.addEventListener('stalled', onStalled);
    v.addEventListener('error', onStalled);
    v.addEventListener('playing', onPlaying);
    return () => {
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('ended', onEnded);
      v.removeEventListener('stalled', onStalled);
      v.removeEventListener('error', onStalled);
      v.removeEventListener('playing', onPlaying);
      if (stallTimer) window.clearTimeout(stallTimer);
    };
  }, [src, loop, startSec]);

  return (
    <video
      ref={ref}
      key={src}
      src={src}
      autoPlay
      muted={muted}
      playsInline
      preload="auto"
      disablePictureInPicture
      style={{ width: '100%', height: '100%', display: 'block', objectFit: fit, background: '#000' }}
    />
  );
}
