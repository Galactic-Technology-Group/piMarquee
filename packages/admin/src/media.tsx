import type { MediaStatus } from '@pimarquee/shared';

export function formatBytes(n: number | null | undefined): string {
  if (!n) return '0 MB';
  if (n >= 1024 * 1024 * 1024) return `${(n / 1073741824).toFixed(2)} GB`;
  return `${Math.round(n / 1048576)} MB`;
}

export function formatSpeed(bps: number | null): string {
  if (!bps) return '';
  return bps >= 1048576 ? `${(bps / 1048576).toFixed(1)} MB/s` : `${Math.round(bps / 1024)} kB/s`;
}

export function mediaLabel(status: MediaStatus | null): { text: string; cls: string } {
  if (!status) return { text: 'Not downloaded yet (saves with the layout)', cls: 'muted' };
  const p = status.progress;
  switch (status.status) {
    case 'ready':
      return { text: `Ready${status.title ? `: ${status.title}` : ''} (${formatBytes(status.bytes)})`, cls: 'ok' };
    case 'downloading': {
      if (!p || !p.totalBytes) return { text: 'Downloading… (starting)', cls: 'muted' };
      const parts = [`${p.percent.toFixed(0)}%`, `${formatBytes(p.downloadedBytes)} of ${formatBytes(p.totalBytes)}`];
      const speed = formatSpeed(p.speedBps);
      if (speed) parts.push(speed);
      if (p.etaSec != null) parts.push(`${Math.round(p.etaSec)} s left`);
      return { text: `Downloading${p.part > 1 ? ` part ${p.part}` : ''}: ${parts.join(' · ')}`, cls: 'muted' };
    }
    case 'pending':
      return { text: 'Queued for download', cls: 'muted' };
    case 'unavailable':
      return { text: `Unavailable: ${status.error ?? ''}`, cls: 'bad' };
    default:
      return { text: `Failed (will retry): ${status.error ?? ''}`, cls: 'bad' };
  }
}

/** Thin progress bar for a download in progress. */
export function ProgressBar({ status }: { status: MediaStatus | null }) {
  if (!status || status.status !== 'downloading' || !status.progress?.totalBytes) return null;
  return (
    <div className="pbar" title={`${status.progress.percent}%`}>
      <div className="pbar-fill" style={{ width: `${status.progress.percent}%` }} />
    </div>
  );
}
