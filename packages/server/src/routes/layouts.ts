import type { FastifyInstance } from 'fastify';
import {
  CreateLayoutBody,
  LayoutInputSchema,
  WidgetPatchSchema,
  WidgetSchema,
  newId,
  nowIso,
  type Layout,
} from '@pimarquee/shared';
import type { AppContext } from '../context.js';
import { HttpError, parseBody } from './util.js';

function summary(l: Layout, activeId: string | null) {
  return {
    id: l.id,
    name: l.name,
    widgetCount: l.widgets.length,
    cameraWidgets: l.widgets.filter((w) => w.type === 'camera').length,
    updatedAt: l.updatedAt,
    isActive: l.id === activeId,
  };
}

export function registerLayoutRoutes(app: FastifyInstance, ctx: AppContext): void {
  const find = (id: string): Layout => {
    const l = ctx.store.config.layouts.find((x) => x.id === id);
    if (!l) throw new HttpError(404, 'layout not found');
    return l;
  };

  app.get('/api/v1/layouts', async () => {
    const cfg = ctx.store.config;
    return cfg.layouts.map((l) => summary(l, cfg.display.activeLayoutId));
  });

  app.post('/api/v1/layouts', async (req, reply) => {
    const body = parseBody(CreateLayoutBody, req.body);
    const ts = nowIso();
    const layout: Layout = { id: newId(), name: body.name, background: '#000000', widgets: [], createdAt: ts, updatedAt: ts };
    await ctx.store.update('layouts', (d) => {
      d.layouts.push(layout);
    });
    return reply.code(201).send(layout);
  });

  app.get<{ Params: { id: string } }>('/api/v1/layouts/:id', async (req) => find(req.params.id));

  app.put<{ Params: { id: string } }>('/api/v1/layouts/:id', async (req) => {
    const existing = find(req.params.id);
    const input = parseBody(LayoutInputSchema, req.body);
    const updated: Layout = { ...existing, ...input, id: existing.id, createdAt: existing.createdAt, updatedAt: nowIso() };
    await ctx.store.update('layouts', (d) => {
      const i = d.layouts.findIndex((l) => l.id === existing.id);
      d.layouts[i] = updated;
    });
    return updated;
  });

  app.delete<{ Params: { id: string } }>('/api/v1/layouts/:id', async (req, reply) => {
    const existing = find(req.params.id);
    await ctx.store.update('layouts', (d) => {
      d.layouts = d.layouts.filter((l) => l.id !== existing.id);
      if (d.display.activeLayoutId === existing.id) d.display.activeLayoutId = d.layouts[0]?.id ?? null;
    });
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string } }>('/api/v1/layouts/:id/duplicate', async (req, reply) => {
    const existing = find(req.params.id);
    const ts = nowIso();
    const copy: Layout = {
      ...structuredClone(existing),
      id: newId(),
      name: `${existing.name} (copy)`,
      createdAt: ts,
      updatedAt: ts,
      widgets: existing.widgets.map((w) => ({ ...structuredClone(w), id: newId() })),
    };
    await ctx.store.update('layouts', (d) => {
      d.layouts.push(copy);
    });
    return reply.code(201).send(copy);
  });

  app.post<{ Params: { id: string } }>('/api/v1/layouts/:id/activate', async (req) => {
    const l = find(req.params.id);
    await ctx.setActiveLayout(l.id);
    return { activeLayoutId: l.id };
  });

  /** Partial widget update: the path HA/Android use to change text, visibility, URL, etc. */
  app.patch<{ Params: { id: string; wid: string } }>('/api/v1/layouts/:id/widgets/:wid', async (req) => {
    const layout = find(req.params.id);
    const widget = layout.widgets.find((w) => w.id === req.params.wid);
    if (!widget) throw new HttpError(404, 'widget not found');
    const patch = parseBody(WidgetPatchSchema, req.body);
    delete patch.id;
    delete patch.type;
    const merged = WidgetSchema.safeParse({ ...widget, ...patch });
    if (!merged.success) throw new HttpError(400, 'invalid widget patch', merged.error.issues);
    await ctx.store.update('layouts', (d) => {
      const l = d.layouts.find((x) => x.id === layout.id)!;
      const i = l.widgets.findIndex((w) => w.id === widget.id);
      l.widgets[i] = merged.data;
      l.updatedAt = nowIso();
    });
    return merged.data;
  });

  /** Every text widget across all layouts (lets integrations enumerate editable texts). */
  app.get('/api/v1/widgets/text', async () => {
    const out: { layoutId: string; layoutName: string; widgetId: string; name: string; content: string }[] = [];
    for (const l of ctx.store.config.layouts) {
      for (const w of l.widgets) {
        if (w.type === 'text') out.push({ layoutId: l.id, layoutName: l.name, widgetId: w.id, name: w.name, content: w.content });
      }
    }
    return out;
  });
}
