/** URL of the display page for a given layout preview. In dev the display app runs on its own Vite port. */
export function displayPreviewUrl(layoutId: string): string {
  const base = import.meta.env.DEV ? 'http://localhost:5174/display/' : '/display/';
  return `${base}?preview=${encodeURIComponent(layoutId)}`;
}
