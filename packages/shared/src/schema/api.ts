import { z } from 'zod';
import { CameraSchema, LayoutObjectSchema, SettingsObjectSchema, WidgetSchema } from './config.js';
import { ResolvedLayoutSchema } from './resolved.js';

// ---------------------------------------------------------------------------
// REST request bodies
// ---------------------------------------------------------------------------
export const CreateLayoutBody = z.object({ name: z.string().min(1).max(80) }).strict();

/** Body for PUT /layouts/:id — id/timestamps are server-owned. */
export const LayoutInputSchema = LayoutObjectSchema.omit({ id: true, createdAt: true, updatedAt: true });
export type LayoutInput = z.infer<typeof LayoutInputSchema>;

export const CameraInputSchema = CameraSchema.omit({ id: true, go2rtcName: true });
export type CameraInput = z.infer<typeof CameraInputSchema>;

export const SettingsInputSchema = SettingsObjectSchema.deepPartial();
export type SettingsInput = z.infer<typeof SettingsInputSchema>;

export const WidgetPatchSchema = z.record(z.string(), z.unknown());
export const ActiveLayoutBody = z.object({ layoutId: z.string().nullable() }).strict();
export const PowerBody = z.object({ on: z.boolean() }).strict();
export const ReloadBody = z.object({ hard: z.boolean().default(false) }).strict();
export const LoginBody = z.object({ password: z.string().min(1).max(256) }).strict();
export const SetPasswordBody = z.object({ password: z.string().max(256).nullable() }).strict();
export const CreateTokenBody = z.object({ name: z.string().min(1).max(80) }).strict();
export const RestartBody = z.object({ service: z.enum(['go2rtc', 'kiosk', 'server']) }).strict();

export { WidgetSchema };

// ---------------------------------------------------------------------------
// WebSocket protocol
// ---------------------------------------------------------------------------
export const WsRoleSchema = z.enum(['display', 'admin']);
export type WsRole = z.infer<typeof WsRoleSchema>;

export const ConfigScopeSchema = z.enum(['layouts', 'cameras', 'settings', 'display', 'auth', 'media', 'all']);
export type ConfigScope = z.infer<typeof ConfigScopeSchema>;

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hello'),
    role: WsRoleSchema,
    resolution: z.object({ w: z.number(), h: z.number() }).optional(),
    userAgent: z.string().optional(),
  }),
  z.object({ type: z.literal('ping') }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export const StatusSnapshotSchema = z.object({
  version: z.string(),
  uptimeSec: z.number(),
  cpuTempC: z.number().nullable(),
  load1: z.number().nullable(),
  memUsedMB: z.number().nullable(),
  memTotalMB: z.number().nullable(),
  throttled: z.string().nullable(),
  go2rtc: z.object({ reachable: z.boolean(), streams: z.number() }),
  display: z.object({
    connected: z.number(),
    resolution: z.object({ w: z.number(), h: z.number() }).nullable(),
    activeLayoutId: z.string().nullable(),
    power: z.enum(['on', 'off']),
  }),
  mqtt: z.object({ enabled: z.boolean(), connected: z.boolean() }),
});
export type StatusSnapshot = z.infer<typeof StatusSnapshotSchema>;

export const ServerMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('welcome'), serverVersion: z.string(), rev: z.number() }),
  z.object({ type: z.literal('config.changed'), rev: z.number(), scope: ConfigScopeSchema }),
  z.object({ type: z.literal('display.resolved'), resolved: ResolvedLayoutSchema }),
  z.object({ type: z.literal('display.power'), on: z.boolean() }),
  z.object({ type: z.literal('display.reload'), hard: z.boolean() }),
  z.object({ type: z.literal('status'), status: StatusSnapshotSchema }),
  z.object({ type: z.literal('pong') }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
