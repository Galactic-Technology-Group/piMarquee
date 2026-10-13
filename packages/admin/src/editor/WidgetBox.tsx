import { Rnd } from 'react-rnd';
import type { Widget } from '@pimarquee/shared';
import { useEditor } from '../store';
import { clampRect, snapRect } from './snap';

const ICON: Record<Widget['type'], string> = { camera: '📷', webpage: '🌐', text: '🅣', clock: '🕒' };

function preview(w: Widget): string {
  switch (w.type) {
    case 'camera':
      return w.name || 'Camera';
    case 'webpage':
      return w.url.replace(/^https?:\/\//, '').slice(0, 40);
    case 'text':
      return w.content.slice(0, 60) || 'Text';
    case 'clock':
      return '12:34';
  }
}

export function WidgetBox({ widget, stage, snap, grid }: { widget: Widget; stage: { w: number; h: number }; snap: boolean; grid: boolean }) {
  const selected = useEditor((s) => s.selectedId === widget.id);
  const select = useEditor((s) => s.select);
  const updateWidget = useEditor((s) => s.updateWidget);
  const allWidgets = useEditor((s) => s.layout?.widgets);
  const others = (allWidgets ?? []).filter((o) => o.id !== widget.id);

  const px = (pct: number, total: number) => (pct / 100) * total;
  const pct = (pxv: number, total: number) => (pxv / total) * 100;
  const gridPx: [number, number] = grid ? [stage.w / 100, stage.h / 100] : [1, 1];

  const commit = (rect: { x: number; y: number; w: number; h: number }, resize: boolean) => {
    const r = snap && !shiftHeld ? snapRect(rect, others, resize) : clampRect(rect);
    updateWidget(widget.id, { rect: r });
  };

  let shiftHeld = false;

  return (
    <Rnd
      bounds="parent"
      size={{ width: px(widget.rect.w, stage.w), height: px(widget.rect.h, stage.h) }}
      position={{ x: px(widget.rect.x, stage.w), y: px(widget.rect.y, stage.h) }}
      dragGrid={gridPx}
      resizeGrid={gridPx}
      minWidth={stage.w * 0.005}
      minHeight={stage.h * 0.005}
      style={{ zIndex: widget.z }}
      className={`wbox wbox-${widget.type} ${selected ? 'selected' : ''} ${widget.visible ? '' : 'hidden-widget'}`}
      onMouseDown={(e: MouseEvent) => {
        shiftHeld = e.shiftKey;
        select(widget.id);
      }}
      onDragStop={(_e, d) => {
        commit({ x: pct(d.x, stage.w), y: pct(d.y, stage.h), w: widget.rect.w, h: widget.rect.h }, false);
      }}
      onResizeStop={(_e, _dir, ref, _delta, pos) => {
        commit(
          { x: pct(pos.x, stage.w), y: pct(pos.y, stage.h), w: pct(ref.offsetWidth, stage.w), h: pct(ref.offsetHeight, stage.h) },
          true,
        );
      }}
      enableResizing={selected}
      resizeHandleClasses={{
        bottomRight: 'rh rh-br',
        bottomLeft: 'rh rh-bl',
        topRight: 'rh rh-tr',
        topLeft: 'rh rh-tl',
        top: 'rh rh-t',
        bottom: 'rh rh-b',
        left: 'rh rh-l',
        right: 'rh rh-r',
      }}
    >
      <div className="wbox-inner" style={{ opacity: widget.opacity, background: widget.background === 'transparent' ? undefined : widget.background }}>
        <div className="wbox-label">
          <span>{ICON[widget.type]}</span> {widget.name || widget.type}
        </div>
        <div className="wbox-preview">{preview(widget)}</div>
      </div>
    </Rnd>
  );
}
