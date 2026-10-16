import type { Camera, Layout, MediaStatus, ResolvedLayout, Settings } from '@pimarquee/shared';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  if (res.status === 401) {
    onUnauthorized?.();
    throw new ApiError(401, 'unauthorized');
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) {
    const err = data as { error?: string; details?: unknown } | undefined;
    throw new ApiError(res.status, err?.error ?? `HTTP ${res.status}`, err?.details);
  }
  return data as T;
}

export interface LayoutSummary {
  id: string;
  name: string;
  widgetCount: number;
  cameraWidgets: number;
  updatedAt: string;
  isActive: boolean;
}

export type CameraView = Camera & { hasCredentials: boolean };
export type SettingsView = Settings & { mqtt: Settings['mqtt'] & { hasPassword: boolean } };

export interface PiView {
  family: string;
  familyLabel: string;
  modelString: string;
  revisionHex: string | null;
  ramMB: number | null;
  defaultMaxStreams: number;
  effectiveMaxStreams: number;
  maxStreamsSource: 'override' | 'detected';
  source: string;
  systemControl: boolean;
}

export type MediaItem = MediaStatus & { usedBy: { layoutId: string; layoutName: string; widgetName: string }[] };
export interface MediaListResponse {
  items: MediaItem[];
  totalBytes: number;
  keepUnusedMedia: boolean;
}

export interface CameraTestResult {
  ok: boolean;
  medias: string[];
  hasH264: boolean;
  hasH265: boolean;
  error: string | null;
  warnings: string[];
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),

  layouts: {
    list: () => request<LayoutSummary[]>('GET', '/api/v1/layouts'),
    get: (id: string) => request<Layout>('GET', `/api/v1/layouts/${id}`),
    create: (name: string) => request<Layout>('POST', '/api/v1/layouts', { name }),
    save: (id: string, layout: Pick<Layout, 'name' | 'background' | 'widgets'>) => request<Layout>('PUT', `/api/v1/layouts/${id}`, layout),
    remove: (id: string) => request<void>('DELETE', `/api/v1/layouts/${id}`),
    duplicate: (id: string) => request<Layout>('POST', `/api/v1/layouts/${id}/duplicate`),
    activate: (id: string) => request<{ activeLayoutId: string }>('POST', `/api/v1/layouts/${id}/activate`),
  },
  cameras: {
    list: () => request<CameraView[]>('GET', '/api/v1/cameras'),
    create: (c: { name: string; rtspUrl: string; enabled: boolean; notes?: string }) => request<CameraView>('POST', '/api/v1/cameras', c),
    update: (id: string, c: Partial<{ name: string; rtspUrl: string; enabled: boolean; notes?: string }>) =>
      request<CameraView>('PUT', `/api/v1/cameras/${id}`, c),
    remove: (id: string) => request<void>('DELETE', `/api/v1/cameras/${id}`),
    test: (id: string) => request<CameraTestResult>('POST', `/api/v1/cameras/${id}/test`),
  },
  display: {
    get: () => request<{ activeLayoutId: string | null; power: 'on' | 'off'; connectedClients: number; resolution: { w: number; h: number } | null }>('GET', '/api/v1/display'),
    power: (on: boolean) => request<{ power: string }>('PUT', '/api/v1/display/power', { on }),
    reload: (hard = false) => request<{ ok: boolean }>('POST', '/api/v1/display/reload', { hard }),
    resolved: (layoutId?: string) => request<ResolvedLayout>('GET', `/api/v1/display/resolved${layoutId ? `?layoutId=${layoutId}` : ''}`),
  },
  media: {
    list: () => request<MediaListResponse>('GET', '/api/v1/media'),
    refresh: (videoId: string) => request<MediaStatus>('POST', `/api/v1/media/${videoId}/refresh`),
    remove: (videoId: string) => request<void>('DELETE', `/api/v1/media/${videoId}`),
  },
  settings: {
    get: () => request<SettingsView>('GET', '/api/v1/settings'),
    update: (patch: Record<string, unknown>) => request<SettingsView>('PUT', '/api/v1/settings', patch),
    pi: () => request<PiView>('GET', '/api/v1/system/pi'),
    restart: (service: 'go2rtc' | 'kiosk' | 'server') => request<{ ok: boolean }>('POST', '/api/v1/system/restart', { service }),
    reboot: () => request<{ ok: boolean }>('POST', '/api/v1/system/reboot'),
  },
  auth: {
    status: () => request<{ enabled: boolean; authenticated: boolean; loopback: boolean }>('GET', '/api/v1/auth/status'),
    login: (password: string) => request<{ ok: boolean }>('POST', '/api/v1/auth/login', { password }),
    logout: () => request<{ ok: boolean }>('POST', '/api/v1/auth/logout'),
    setPassword: (password: string | null) => request<{ enabled: boolean }>('PUT', '/api/v1/auth/password', { password }),
    tokens: () => request<{ id: string; name: string; createdAt: string; lastUsedAt: string | null }[]>('GET', '/api/v1/auth/tokens'),
    createToken: (name: string) => request<{ id: string; name: string; token: string }>('POST', '/api/v1/auth/tokens', { name }),
    deleteToken: (id: string) => request<void>('DELETE', `/api/v1/auth/tokens/${id}`),
  },
};
