import type {
  Config,
  PiInfo,
  ResolvedLayout,
  ResolvedWidget,
  ResolvedCameraWidget,
  CameraWidget,
  StreamMode,
} from '@pimarquee/shared';

export function effectiveMaxStreams(config: Config, pi: PiInfo): number {
  return config.settings.maxStreamsOverride ?? pi.defaultMaxStreams;
}

/**
 * Build what the display should render for a layout: every camera widget is
 * annotated with its go2rtc stream and whether it is allowed under the
 * concurrent-stream limit. Each visible camera *widget* counts as one decode.
 */
export function buildResolvedLayout(
  config: Config,
  pi: PiInfo,
  rev: number,
  layoutId: string | null = config.display.activeLayoutId,
): ResolvedLayout {
  const maxStreams = effectiveMaxStreams(config, pi);
  const layout = layoutId ? (config.layouts.find((l) => l.id === layoutId) ?? null) : null;
  const base = {
    power: config.display.power,
    maxStreams,
    timezone: config.settings.timezone,
    locale: config.settings.locale,
    autoReloadHours: config.settings.autoReloadHours,
    hideCursor: config.settings.hideCursor,
    generatedAt: new Date().toISOString(),
    rev,
  };
  if (!layout) {
    return { ...base, layout: null, streamsUsed: 0 };
  }

  const cameras = new Map(config.cameras.map((c) => [c.id, c]));
  const cameraWidgets = layout.widgets.filter((w): w is CameraWidget => w.type === 'camera' && w.visible);

  // Rank: explicit priority first, then topmost (z), then largest on screen.
  const ranked = [...cameraWidgets].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.z !== b.z) return b.z - a.z;
    return b.rect.w * b.rect.h - a.rect.w * a.rect.h;
  });

  const allowedIds = new Set<string>();
  for (const w of ranked) {
    const cam = cameras.get(w.cameraId);
    if (!cam || !cam.enabled) continue;
    if (allowedIds.size >= maxStreams) break;
    allowedIds.add(w.id);
  }

  const widgets: ResolvedWidget[] = layout.widgets.map((w) => {
    if (w.type !== 'camera') return w;
    const cam = cameras.get(w.cameraId);
    const mode: StreamMode = w.mode === 'auto' ? config.settings.defaultStreamMode : w.mode;
    const resolved: ResolvedCameraWidget = {
      ...w,
      stream: {
        name: cam?.go2rtcName ?? '',
        cameraName: cam?.name ?? 'Unknown camera',
        mode,
        port: config.settings.go2rtc.externalPort,
        allowed: allowedIds.has(w.id),
        reason: !cam ? 'missing' : !cam.enabled ? 'disabled' : allowedIds.has(w.id) ? undefined : 'limit',
      },
    };
    return resolved;
  });

  return {
    ...base,
    layout: { ...layout, widgets },
    streamsUsed: allowedIds.size,
  };
}
