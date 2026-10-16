import { z } from 'zod';

// ---------------------------------------------------------------------------
// Geometry: everything is a percentage of the canvas (0..100) so a layout
// designed on a laptop maps to any physical display resolution.
// ---------------------------------------------------------------------------
export const RectSchema = z
  .object({
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    w: z.number().min(0.5).max(100),
    h: z.number().min(0.5).max(100),
  })
  .strict();
export type Rect = z.infer<typeof RectSchema>;

const cssColor = z.string().max(64);

const WidgetBaseSchema = z.object({
  id: z.string().min(1).max(32),
  name: z.string().max(80).default(''),
  rect: RectSchema,
  z: z.number().int().min(0).max(1000).default(0),
  opacity: z.number().min(0).max(1).default(1),
  visible: z.boolean().default(true),
  background: cssColor.default('transparent'),
  /** Percent of canvas height. */
  borderRadius: z.number().min(0).max(50).default(0),
});

export const StreamModeSchema = z.enum(['webrtc', 'mse', 'mjpeg']);
export type StreamMode = z.infer<typeof StreamModeSchema>;

export const CameraWidgetSchema = WidgetBaseSchema.extend({
  type: z.literal('camera'),
  cameraId: z.string().min(1),
  fit: z.enum(['cover', 'contain']).default('cover'),
  mode: z.enum(['auto', 'webrtc', 'mse', 'mjpeg']).default('auto'),
  /** Lower = more important when the stream limit forces widgets to be dropped. */
  priority: z.number().int().min(0).max(1000).default(100),
  showLabel: z.boolean().default(false),
  muted: z.boolean().default(true),
}).strict();
export type CameraWidget = z.infer<typeof CameraWidgetSchema>;

export const WebpageWidgetSchema = WidgetBaseSchema.extend({
  type: z.literal('webpage'),
  url: z.string().url().max(2048),
  refreshIntervalSec: z.number().int().min(5).max(86400).nullable().default(null),
  stripFrameHeaders: z.boolean().default(false),
  zoom: z.number().min(0.25).max(4).default(1),
  allowScripts: z.boolean().default(true),
}).strict();
export type WebpageWidget = z.infer<typeof WebpageWidgetSchema>;

export const FONT_FAMILIES = [
  'system-ui',
  'sans-serif',
  'serif',
  'monospace',
  'DejaVu Sans',
  'DejaVu Serif',
  'DejaVu Sans Mono',
  'Noto Sans',
] as const;

const fontFamily = z.string().max(80).default('system-ui');

export const TextWidgetSchema = WidgetBaseSchema.extend({
  type: z.literal('text'),
  content: z.string().max(10000).default(''),
  fontFamily,
  /** Percent of canvas height (4 = 4vh). */
  fontSize: z.number().min(0.5).max(50).default(4),
  color: cssColor.default('#ffffff'),
  align: z.enum(['left', 'center', 'right']).default('left'),
  valign: z.enum(['top', 'middle', 'bottom']).default('top'),
  bold: z.boolean().default(false),
  italic: z.boolean().default(false),
  /** Percent of canvas height. */
  padding: z.number().min(0).max(20).default(1),
}).strict();
export type TextWidget = z.infer<typeof TextWidgetSchema>;

export const ClockWidgetSchema = WidgetBaseSchema.extend({
  type: z.literal('clock'),
  showTime: z.boolean().default(true),
  showDate: z.boolean().default(true),
  showSeconds: z.boolean().default(false),
  hour12: z.boolean().default(true),
  dateFormat: z.enum(['long', 'short', 'numeric']).default('long'),
  timezone: z.string().max(64).nullable().default(null),
  locale: z.string().max(32).nullable().default(null),
  fontFamily,
  fontSize: z.number().min(0.5).max(50).default(8),
  color: cssColor.default('#ffffff'),
  align: z.enum(['left', 'center', 'right']).default('center'),
}).strict();
export type ClockWidget = z.infer<typeof ClockWidgetSchema>;

export const WidgetSchema = z.discriminatedUnion('type', [
  CameraWidgetSchema,
  WebpageWidgetSchema,
  TextWidgetSchema,
  ClockWidgetSchema,
]);
export type Widget = z.infer<typeof WidgetSchema>;
export type WidgetType = Widget['type'];
export const WIDGET_TYPES: WidgetType[] = ['camera', 'webpage', 'text', 'clock'];

export const LayoutObjectSchema = z
  .object({
    id: z.string().min(1).max(32),
    name: z.string().min(1).max(80),
    background: cssColor.default('#000000'),
    widgets: z.array(WidgetSchema).max(200).default([]),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const LayoutSchema = LayoutObjectSchema.superRefine((layout, ctx) => {
  const seen = new Set<string>();
  layout.widgets.forEach((w, i) => {
    if (seen.has(w.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['widgets', i, 'id'],
        message: `duplicate widget id ${w.id}`,
      });
    }
    seen.add(w.id);
  });
});
export type Layout = z.infer<typeof LayoutSchema>;

export const CameraSchema = z
  .object({
    id: z.string().min(1).max(32),
    name: z.string().min(1).max(80),
    rtspUrl: z
      .string()
      .min(1)
      .max(2048)
      .refine(
        (u) => /^[a-z][a-z0-9+.-]*:/i.test(u),
        'must be an rtsp:// URL (or another go2rtc source URL)',
      ),
    enabled: z.boolean().default(true),
    /** Stream name inside go2rtc; derived from id and kept stable. */
    go2rtcName: z.string().regex(/^[a-z0-9_]+$/),
    notes: z.string().max(500).optional(),
  })
  .strict();
export type Camera = z.infer<typeof CameraSchema>;

export const CanvasAspectSchema = z.enum(['16:9', '9:16', '4:3', '21:9', 'custom']);

export const MqttSettingsSchema = z
  .object({
    enabled: z.boolean().default(false),
    url: z.string().max(256).default('mqtt://homeassistant.local:1883'),
    username: z.string().max(128).default(''),
    /** Stored in config; never returned by the API (write-only). */
    password: z.string().max(256).default(''),
    baseTopic: z.string().max(128).default('pimarquee'),
    discoveryPrefix: z.string().max(64).default('homeassistant'),
  })
  .strict();
export type MqttSettings = z.infer<typeof MqttSettingsSchema>;

export const SettingsObjectSchema = z
  .object({
    port: z.number().int().min(1).max(65535).default(8080),
    displayName: z.string().min(1).max(80).default('Pi Display'),
    canvas: z
      .object({
        aspect: CanvasAspectSchema.default('16:9'),
        width: z.number().int().min(1).default(1920),
        height: z.number().int().min(1).default(1080),
      })
      .strict()
      .default({ aspect: '16:9', width: 1920, height: 1080 }),
    timezone: z.string().max(64).default('UTC'),
    locale: z.string().max(32).default('en-US'),
    /** null = use the detected Pi model default. */
    maxStreamsOverride: z.number().int().min(0).max(16).nullable().default(null),
    defaultStreamMode: StreamModeSchema.default('webrtc'),
    displayPowerMethod: z.enum(['auto', 'wlr-randr', 'cec', 'software']).default('auto'),
    go2rtc: z
      .object({
        /** Port the display/admin browsers reach go2rtc on (host = same as the server). */
        externalPort: z.number().int().min(1).max(65535).default(1984),
      })
      .strict()
      .default({ externalPort: 1984 }),
    /** 0 = disabled. Periodic reload of the kiosk page to purge browser leaks. */
    autoReloadHours: z.number().int().min(0).max(168).default(0),
    /**
     * Cover the display with a transparent layer that hides the mouse pointer everywhere,
     * including over embedded web pages. Also blocks mouse/touch interaction with those pages.
     */
    hideCursor: z.boolean().default(true),
    mqtt: MqttSettingsSchema.default({}),
  })
  .strict();
export const SettingsSchema = SettingsObjectSchema;
export type Settings = z.infer<typeof SettingsSchema>;

export const DisplayStateSchema = z
  .object({
    activeLayoutId: z.string().nullable().default(null),
    power: z.enum(['on', 'off']).default('on'),
  })
  .strict();
export type DisplayState = z.infer<typeof DisplayStateSchema>;

export const ApiTokenSchema = z
  .object({
    id: z.string().min(1).max(32),
    name: z.string().min(1).max(80),
    tokenHash: z.string().min(1),
    createdAt: z.string().datetime(),
    lastUsedAt: z.string().datetime().nullable().default(null),
  })
  .strict();
export type ApiToken = z.infer<typeof ApiTokenSchema>;

export const AuthConfigSchema = z
  .object({
    /** null = authentication disabled. */
    passwordHash: z.string().nullable().default(null),
    tokens: z.array(ApiTokenSchema).default([]),
  })
  .strict();
export type AuthConfig = z.infer<typeof AuthConfigSchema>;

export const CONFIG_VERSION = 1 as const;

export const ConfigSchema = z
  .object({
    version: z.literal(CONFIG_VERSION),
    settings: SettingsSchema.default({}),
    cameras: z.array(CameraSchema).default([]),
    layouts: z.array(LayoutSchema).default([]),
    display: DisplayStateSchema.default({}),
    auth: AuthConfigSchema.default({}),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    const cameraIds = new Set(cfg.cameras.map((c) => c.id));
    const layoutIds = new Set<string>();
    cfg.layouts.forEach((l, li) => {
      if (layoutIds.has(l.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['layouts', li, 'id'],
          message: `duplicate layout id ${l.id}`,
        });
      }
      layoutIds.add(l.id);
      l.widgets.forEach((w, wi) => {
        if (w.type === 'camera' && !cameraIds.has(w.cameraId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['layouts', li, 'widgets', wi, 'cameraId'],
            message: `unknown camera ${w.cameraId}`,
          });
        }
      });
    });
    if (cfg.display.activeLayoutId !== null && !layoutIds.has(cfg.display.activeLayoutId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['display', 'activeLayoutId'],
        message: 'unknown layout',
      });
    }
  });
export type Config = z.infer<typeof ConfigSchema>;
