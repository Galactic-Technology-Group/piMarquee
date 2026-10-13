import type { Rect, Widget } from '@pimarquee/shared';

export const SNAP_THRESHOLD = 0.75; // percent of canvas

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function clampRect(r: Rect): Rect {
  const w = Math.max(0.5, Math.min(100, r.w));
  const h = Math.max(0.5, Math.min(100, r.h));
  return {
    x: round2(Math.max(0, Math.min(100 - w, r.x))),
    y: round2(Math.max(0, Math.min(100 - h, r.y))),
    w: round2(w),
    h: round2(h),
  };
}

/**
 * Snap a rect's edges/centre to the canvas edges/centre and to other widgets' edges.
 * Only the position moves (used after a drag); call with `resize=true` to snap the far edges instead.
 */
export function snapRect(r: Rect, others: Widget[], resize = false): Rect {
  const xs = new Set<number>([0, 50, 100]);
  const ys = new Set<number>([0, 50, 100]);
  for (const o of others) {
    xs.add(o.rect.x);
    xs.add(o.rect.x + o.rect.w);
    xs.add(o.rect.x + o.rect.w / 2);
    ys.add(o.rect.y);
    ys.add(o.rect.y + o.rect.h);
    ys.add(o.rect.y + o.rect.h / 2);
  }
  const near = (v: number, cands: Set<number>): number | null => {
    let best: number | null = null;
    let bestD = SNAP_THRESHOLD;
    for (const c of cands) {
      const d = Math.abs(v - c);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  };

  let { x, y, w, h } = r;
  if (resize) {
    const right = near(x + w, xs);
    if (right !== null) w = right - x;
    const bottom = near(y + h, ys);
    if (bottom !== null) h = bottom - y;
  } else {
    const left = near(x, xs);
    const right = near(x + w, xs);
    const cx = near(x + w / 2, xs);
    if (left !== null) x = left;
    else if (right !== null) x = right - w;
    else if (cx !== null) x = cx - w / 2;
    const top = near(y, ys);
    const bottom = near(y + h, ys);
    const cy = near(y + h / 2, ys);
    if (top !== null) y = top;
    else if (bottom !== null) y = bottom - h;
    else if (cy !== null) y = cy - h / 2;
  }
  return clampRect({ x, y, w, h });
}
