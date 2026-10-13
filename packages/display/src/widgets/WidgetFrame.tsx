import type { ReactNode } from 'react';
import type { ResolvedWidget } from '@pimarquee/shared';

/** Maps percentage geometry onto the real screen; the browser does the scaling. */
export function WidgetFrame({ widget, children }: { widget: ResolvedWidget; children: ReactNode }) {
  const { rect } = widget;
  return (
    <div
      className={`widget widget-${widget.type}`}
      data-widget-id={widget.id}
      style={{
        left: `${rect.x}%`,
        top: `${rect.y}%`,
        width: `${rect.w}%`,
        height: `${rect.h}%`,
        zIndex: widget.z,
        opacity: widget.opacity,
        background: widget.background,
        borderRadius: widget.borderRadius ? `${widget.borderRadius}vh` : undefined,
      }}
    >
      {children}
    </div>
  );
}
