import { useEffect, useMemo, useState } from 'react';
import type { ClockWidget as ClockWidgetT } from '@pimarquee/shared';

const DATE_PRESETS: Record<ClockWidgetT['dateFormat'], Intl.DateTimeFormatOptions> = {
  long: { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' },
  short: { weekday: 'short', month: 'short', day: 'numeric' },
  numeric: { year: 'numeric', month: '2-digit', day: '2-digit' },
};

function safeFormatter(locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(locale, opts);
  } catch {
    // Bad timezone/locale from config: fall back rather than crash the kiosk.
    const { timeZone: _tz, ...rest } = opts;
    void _tz;
    return new Intl.DateTimeFormat('en-US', rest);
  }
}

export function ClockWidget({
  widget,
  defaultTimezone,
  defaultLocale,
}: {
  widget: ClockWidgetT;
  defaultTimezone: string;
  defaultLocale: string;
}) {
  const [now, setNow] = useState(() => new Date());
  const timeZone = widget.timezone ?? defaultTimezone;
  const locale = widget.locale ?? defaultLocale;

  const timeFmt = useMemo(
    () =>
      safeFormatter(locale, {
        timeZone,
        hour: 'numeric',
        minute: '2-digit',
        second: widget.showSeconds ? '2-digit' : undefined,
        hour12: widget.hour12,
      }),
    [locale, timeZone, widget.showSeconds, widget.hour12],
  );
  const dateFmt = useMemo(() => safeFormatter(locale, { timeZone, ...DATE_PRESETS[widget.dateFormat] }), [locale, timeZone, widget.dateFormat]);

  // Tick aligned to the second boundary so the display never looks "late".
  useEffect(() => {
    let timeout: number;
    const tick = () => {
      const d = new Date();
      setNow(d);
      timeout = window.setTimeout(tick, 1000 - d.getMilliseconds());
    };
    tick();
    return () => window.clearTimeout(timeout);
  }, []);

  const ALIGN: Record<ClockWidgetT['align'], string> = { left: 'flex-start', center: 'center', right: 'flex-end' };

  return (
    <div
      className="clock-inner"
      style={{
        fontFamily: widget.fontFamily,
        fontSize: `${widget.fontSize}vh`,
        color: widget.color,
        alignItems: ALIGN[widget.align],
        textAlign: widget.align,
      }}
    >
      {widget.showTime && <div className="time">{timeFmt.format(now)}</div>}
      {widget.showDate && <div className="date">{dateFmt.format(now)}</div>}
    </div>
  );
}
