import type { TextWidget as TextWidgetT } from '@pimarquee/shared';

const VALIGN: Record<TextWidgetT['valign'], string> = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };
const ALIGN: Record<TextWidgetT['align'], string> = { left: 'flex-start', center: 'center', right: 'flex-end' };

export function TextWidget({ widget }: { widget: TextWidgetT }) {
  return (
    <div
      className="text-inner"
      style={{
        fontFamily: widget.fontFamily,
        fontSize: `${widget.fontSize}vh`,
        color: widget.color,
        fontWeight: widget.bold ? 700 : 400,
        fontStyle: widget.italic ? 'italic' : 'normal',
        textAlign: widget.align,
        alignItems: VALIGN[widget.valign],
        justifyContent: ALIGN[widget.align],
        padding: `${widget.padding}vh`,
      }}
    >
      <div style={{ width: '100%' }}>{widget.content}</div>
    </div>
  );
}
