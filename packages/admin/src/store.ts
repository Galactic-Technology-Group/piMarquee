import { create } from 'zustand';
import type { Layout, Widget } from '@pimarquee/shared';

const MAX_HISTORY = 100;

interface EditorState {
  layout: Layout | null;
  selectedId: string | null;
  past: Layout[];
  future: Layout[];
  dirty: boolean;
  savedAt: number | null;

  load(layout: Layout): void;
  select(id: string | null): void;
  /** Apply a change to the layout. `record=false` for transient drags (recorded on release). */
  mutate(fn: (draft: Layout) => void, record?: boolean): void;
  updateWidget(id: string, patch: Partial<Widget>): void;
  addWidget(widget: Widget): void;
  removeWidget(id: string): void;
  duplicateWidget(id: string, newId: string): void;
  bringForward(id: string): void;
  sendBackward(id: string): void;
  undo(): void;
  redo(): void;
  markSaved(): void;
}

export const useEditor = create<EditorState>((set, get) => ({
  layout: null,
  selectedId: null,
  past: [],
  future: [],
  dirty: false,
  savedAt: null,

  load: (layout) => set({ layout, selectedId: null, past: [], future: [], dirty: false }),
  select: (id) => set({ selectedId: id }),

  mutate: (fn, record = true) => {
    const { layout, past } = get();
    if (!layout) return;
    const draft = structuredClone(layout);
    fn(draft);
    set({
      layout: draft,
      dirty: true,
      past: record ? [...past.slice(-MAX_HISTORY + 1), layout] : past,
      future: record ? [] : get().future,
    });
  },

  updateWidget: (id, patch) =>
    get().mutate((d) => {
      const i = d.widgets.findIndex((w) => w.id === id);
      if (i >= 0) d.widgets[i] = { ...d.widgets[i], ...patch } as Widget;
    }),

  addWidget: (widget) => {
    get().mutate((d) => {
      const maxZ = d.widgets.reduce((m, w) => Math.max(m, w.z), -1);
      d.widgets.push({ ...widget, z: maxZ + 1 });
    });
    set({ selectedId: widget.id });
  },

  removeWidget: (id) => {
    get().mutate((d) => {
      d.widgets = d.widgets.filter((w) => w.id !== id);
    });
    if (get().selectedId === id) set({ selectedId: null });
  },

  duplicateWidget: (id, newId) => {
    const src = get().layout?.widgets.find((w) => w.id === id);
    if (!src) return;
    const copy = structuredClone(src) as Widget;
    copy.id = newId;
    copy.rect = { ...copy.rect, x: Math.min(100 - copy.rect.w, copy.rect.x + 2), y: Math.min(100 - copy.rect.h, copy.rect.y + 2) };
    get().addWidget(copy);
  },

  bringForward: (id) =>
    get().mutate((d) => {
      const sorted = [...d.widgets].sort((a, b) => a.z - b.z);
      const i = sorted.findIndex((w) => w.id === id);
      if (i < 0 || i === sorted.length - 1) return;
      [sorted[i], sorted[i + 1]] = [sorted[i + 1]!, sorted[i]!];
      sorted.forEach((w, z) => {
        w.z = z;
      });
    }),

  sendBackward: (id) =>
    get().mutate((d) => {
      const sorted = [...d.widgets].sort((a, b) => a.z - b.z);
      const i = sorted.findIndex((w) => w.id === id);
      if (i <= 0) return;
      [sorted[i], sorted[i - 1]] = [sorted[i - 1]!, sorted[i]!];
      sorted.forEach((w, z) => {
        w.z = z;
      });
    }),

  undo: () => {
    const { past, layout, future } = get();
    const prev = past[past.length - 1];
    if (!prev || !layout) return;
    set({ layout: prev, past: past.slice(0, -1), future: [layout, ...future], dirty: true });
  },

  redo: () => {
    const { past, layout, future } = get();
    const next = future[0];
    if (!next || !layout) return;
    set({ layout: next, past: [...past, layout], future: future.slice(1), dirty: true });
  },

  markSaved: () => set({ dirty: false, savedAt: Date.now() }),
}));
