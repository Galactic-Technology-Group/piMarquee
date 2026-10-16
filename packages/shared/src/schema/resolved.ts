import { z } from 'zod';
import {
  CameraWidgetSchema,
  ClockWidgetSchema,
  LayoutObjectSchema,
  StreamModeSchema,
  TextWidgetSchema,
  WebpageWidgetSchema,
} from './config.js';

/** What the display page actually renders. Built by the server, never persisted. */
export const ResolvedStreamSchema = z.object({
  name: z.string(),
  allowed: z.boolean(),
  reason: z.enum(['limit', 'disabled', 'missing']).optional(),
  mode: StreamModeSchema,
  /** go2rtc port as seen from the browser; host is derived from window.location. */
  port: z.number().int(),
  cameraName: z.string(),
});
export type ResolvedStream = z.infer<typeof ResolvedStreamSchema>;

export const ResolvedCameraWidgetSchema = CameraWidgetSchema.extend({ stream: ResolvedStreamSchema });
export type ResolvedCameraWidget = z.infer<typeof ResolvedCameraWidgetSchema>;

export const ResolvedWidgetSchema = z.discriminatedUnion('type', [
  ResolvedCameraWidgetSchema,
  WebpageWidgetSchema,
  TextWidgetSchema,
  ClockWidgetSchema,
]);
export type ResolvedWidget = z.infer<typeof ResolvedWidgetSchema>;

export const ResolvedLayoutSchema = z.object({
  layout: LayoutObjectSchema.omit({ widgets: true })
    .extend({ widgets: z.array(ResolvedWidgetSchema) })
    .nullable(),
  power: z.enum(['on', 'off']),
  maxStreams: z.number().int(),
  streamsUsed: z.number().int(),
  timezone: z.string(),
  locale: z.string(),
  autoReloadHours: z.number().int(),
  hideCursor: z.boolean(),
  generatedAt: z.string(),
  rev: z.number().int(),
});
export type ResolvedLayout = z.infer<typeof ResolvedLayoutSchema>;
