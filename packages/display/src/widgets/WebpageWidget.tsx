import { useEffect, useState } from 'react';
import type { WebpageWidget as WebpageWidgetT } from '@pimarquee/shared';

export function WebpageWidget({ widget }: { widget: WebpageWidgetT }) {
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!widget.refreshIntervalSec) return;
    const id = window.setInterval(() => setNonce((n) => n + 1), widget.refreshIntervalSec * 1000);
    return () => window.clearInterval(id);
  }, [widget.refreshIntervalSec]);

  let src = widget.stripFrameHeaders ? `/proxy/${widget.id}/` : widget.url;
  if (nonce > 0) {
    // Cache-buster so a periodic refresh really reloads the page.
    src += (src.includes('?') ? '&' : '?') + `_r=${nonce}`;
  }

  const zoom = widget.zoom;
  const sandbox = widget.allowScripts ? 'allow-scripts allow-same-origin allow-forms allow-popups' : 'allow-same-origin allow-forms';

  return (
    <iframe
      key={`${src}`}
      title={widget.name || widget.url}
      src={src}
      sandbox={sandbox}
      referrerPolicy="no-referrer"
      allow="autoplay; fullscreen"
      style={{
        width: `${100 / zoom}%`,
        height: `${100 / zoom}%`,
        transform: zoom !== 1 ? `scale(${zoom})` : undefined,
        transformOrigin: '0 0',
      }}
    />
  );
}
