import { useEffect, useRef, useState } from 'react';
import type { Widget } from '@pimarquee/shared';
import { useEditor } from '../store';
import { WidgetBox } from './WidgetBox';

/**
 * The editing stage: an aspect-locked rectangle that represents the whole screen.
 * Widgets are positioned in percentages; react-rnd works in pixels, so we convert at the edges.
 */
export function EditorCanvas({ aspect, snap, grid }: { aspect: number; snap: boolean; grid: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 960, h: 540 });
  const layout = useEditor((s) => s.layout);
  const select = useEditor((s) => s.select);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const maxW = el.clientWidth;
      const maxH = el.clientHeight;
      let w = maxW;
      let h = w / aspect;
      if (h > maxH) {
        h = maxH;
        w = h * aspect;
      }
      setSize({ w: Math.floor(w), h: Math.floor(h) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);

  if (!layout) return null;
  const widgets: Widget[] = [...layout.widgets].sort((a, b) => a.z - b.z);

  return (
    <div className="stage-wrap" ref={wrapRef}>
      <div
        className="stage"
        style={{ width: size.w, height: size.h, background: layout.background }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) select(null);
        }}
      >
        {grid && <div className="stage-grid" />}
        {widgets.map((w) => (
          <WidgetBox key={w.id} widget={w} stage={size} snap={snap} grid={grid} />
        ))}
      </div>
    </div>
  );
}
