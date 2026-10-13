import type { ResolvedLayout, ResolvedWidget } from '@pimarquee/shared';
import { WidgetFrame } from './widgets/WidgetFrame';
import { CameraWidget } from './widgets/CameraWidget';
import { WebpageWidget } from './widgets/WebpageWidget';
import { TextWidget } from './widgets/TextWidget';
import { ClockWidget } from './widgets/ClockWidget';

type Layout = NonNullable<ResolvedLayout['layout']>;

function renderWidget(w: ResolvedWidget, timezone: string, locale: string) {
  switch (w.type) {
    case 'camera':
      return <CameraWidget widget={w} />;
    case 'webpage':
      return <WebpageWidget widget={w} />;
    case 'text':
      return <TextWidget widget={w} />;
    case 'clock':
      return <ClockWidget widget={w} defaultTimezone={timezone} defaultLocale={locale} />;
  }
}

export function Canvas({ layout, timezone, locale }: { layout: Layout; timezone: string; locale: string }) {
  return (
    <div className="canvas" style={{ background: layout.background }}>
      {layout.widgets
        .filter((w) => w.visible)
        .map((w) => (
          <WidgetFrame key={w.id} widget={w}>
            {renderWidget(w, timezone, locale)}
          </WidgetFrame>
        ))}
    </div>
  );
}
