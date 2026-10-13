import { useEffect, useRef } from 'react';
import type { ResolvedCameraWidget } from '@pimarquee/shared';
import { VideoRTC } from '../vendor/video-rtc.js';

/** go2rtc player tuned for signage: no controls, muted autoplay, object-fit from the widget. */
class PiMarqueeVideo extends VideoRTC {
  fit: 'cover' | 'contain' = 'cover';
  muted = true;

  override oninit(): void {
    super.oninit();
    this.video.controls = false;
    this.video.muted = this.muted;
    this.video.autoplay = true;
    this.video.style.objectFit = this.fit;
    this.video.style.background = '#000';
  }
}

if (!customElements.get('pimarquee-video')) customElements.define('pimarquee-video', PiMarqueeVideo);

const WATCHDOG_MS = 20000;

function streamUrl(widget: ResolvedCameraWidget): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.hostname}:${widget.stream.port}/api/ws?src=${encodeURIComponent(widget.stream.name)}`;
}

function modeList(mode: ResolvedCameraWidget['stream']['mode']): string {
  // Primary mode first, then graceful fallbacks the go2rtc player understands.
  switch (mode) {
    case 'webrtc':
      return 'webrtc,mse,mjpeg';
    case 'mse':
      return 'mse,mjpeg';
    case 'mjpeg':
      return 'mjpeg';
  }
}

export function CameraWidget({ widget }: { widget: ResolvedCameraWidget }) {
  const host = useRef<HTMLDivElement>(null);
  const { stream } = widget;

  useEffect(() => {
    if (!stream.allowed || !host.current) return;
    const container = host.current;
    let el: PiMarqueeVideo | null = null;
    let lastProgress = Date.now();
    let disposed = false;

    const create = () => {
      if (disposed) return;
      el = document.createElement('pimarquee-video') as PiMarqueeVideo;
      el.fit = widget.fit;
      el.muted = widget.muted;
      el.mode = modeList(stream.mode);
      el.media = widget.muted ? 'video' : 'video,audio';
      el.background = true; // keep running even if the browser thinks we're hidden
      el.visibilityCheck = false;
      el.pcConfig = { bundlePolicy: 'max-bundle', iceServers: [] }; // LAN only: host candidates are enough
      el.src = streamUrl(widget);
      container.replaceChildren(el);
      lastProgress = Date.now();
      el.video.addEventListener('timeupdate', () => {
        lastProgress = Date.now();
      });
      el.video.addEventListener('load', () => {
        lastProgress = Date.now(); // mjpeg mode
      });
    };

    create();

    // Watchdog: go2rtc's player reconnects its WebSocket, but a frozen decoder or a
    // stuck <video> keeps the socket open. If nothing has progressed, rebuild the element.
    const watchdog = window.setInterval(() => {
      if (!el) return;
      if (stream.mode === 'mjpeg') return;
      if (Date.now() - lastProgress > WATCHDOG_MS) {
        el.ondisconnect();
        create();
      }
    }, 5000);

    return () => {
      disposed = true;
      window.clearInterval(watchdog);
      el?.ondisconnect();
      container.replaceChildren();
    };
  }, [stream.allowed, stream.name, stream.mode, stream.port, widget.fit, widget.muted]);

  if (!stream.allowed) {
    const detail =
      stream.reason === 'limit'
        ? 'Concurrent stream limit reached. Raise it in Settings or remove a camera widget.'
        : stream.reason === 'disabled'
          ? 'Camera is disabled.'
          : 'Camera not found.';
    return (
      <div className="placeholder">
        <div className="title">{stream.cameraName}</div>
        <div className="detail">{detail}</div>
      </div>
    );
  }

  return (
    <>
      <div ref={host} style={{ width: '100%', height: '100%' }} />
      {widget.showLabel && <div className="label">{stream.cameraName}</div>}
    </>
  );
}
