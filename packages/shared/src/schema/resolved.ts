import { z } from 'zod';
import {
  CameraWidgetSchema,
  ClockWidgetSchema,
  LayoutObjectSchema,
  StreamModeSchema,
  TextWidgetSchema,
  WebpageWidgetSchema,
  YoutubeWidgetSchema,
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

/** Live progress of a running download (from yt-dlp). */
export const MediaProgressSchema = z.object({
  /** 0..100 for the file currently being fetched (video and audio are fetched one after another). */
  percent: z.number(),
  downloadedBytes: z.number(),
  totalBytes: z.number().nullable(),
  speedBps: z.number().nullable(),
  etaSec: z.number().nullable(),
  /** 1-based index of the file being fetched (1 = video, 2 = audio when merged separately). */
  part: z.number().int(),
});
export type MediaProgress = z.infer<typeof MediaProgressSchema>;

/** Download state of a YouTube video on the server. */
export const MediaStatusSchema = z.object({
  videoId: z.string(),
  status: z.enum(['pending', 'downloading', 'ready', 'error', 'unavailable']),
  progress: MediaProgressSchema.nullable(),
  /** Browser-relative URL of the local file when status is ready. */
  src: z.string().nullable(),
  title: z.string().nullable(),
  bytes: z.number().nullable(),
  error: z.string().nullable(),
  updatedAt: z.string(),
});
export type MediaStatus = z.infer<typeof MediaStatusSchema>;

export const ResolvedYoutubeWidgetSchema = YoutubeWidgetSchema.extend({
  videoId: z.string().nullable(),
  media: MediaStatusSchema.nullable(),
});
export type ResolvedYoutubeWidget = z.infer<typeof ResolvedYoutubeWidgetSchema>;

export const ResolvedWidgetSchema = z.discriminatedUnion('type', [
  ResolvedCameraWidgetSchema,
  WebpageWidgetSchema,
  TextWidgetSchema,
  ClockWidgetSchema,
  ResolvedYoutubeWidgetSchema,
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
