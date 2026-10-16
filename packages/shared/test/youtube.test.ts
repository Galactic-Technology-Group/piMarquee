import { describe, expect, it } from 'vitest';
import { extractYoutubeId, youtubeEmbedUrl } from '../src/youtube.js';

describe('extractYoutubeId', () => {
  it.each([
    ['dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL123', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://example.com/watch?v=dQw4w9WgXcQ', null],
    ['not a url', null],
    ['https://www.youtube.com/watch?v=short', null],
  ])('%s -> %s', (input, expected) => {
    expect(extractYoutubeId(input)).toBe(expected);
  });
});

describe('youtubeEmbedUrl', () => {
  it('uses the nocookie host and the playlist trick for looping', () => {
    const u = new URL(youtubeEmbedUrl('dQw4w9WgXcQ', { autoplay: true, muted: true, loop: true, startSec: 10 }));
    expect(u.hostname).toBe('www.youtube-nocookie.com');
    expect(u.pathname).toBe('/embed/dQw4w9WgXcQ');
    expect(u.searchParams.get('loop')).toBe('1');
    expect(u.searchParams.get('playlist')).toBe('dQw4w9WgXcQ');
    expect(u.searchParams.get('start')).toBe('10');
    expect(u.searchParams.get('mute')).toBe('1');
  });
  it('omits loop params when not looping', () => {
    const u = new URL(youtubeEmbedUrl('dQw4w9WgXcQ', { autoplay: true, muted: false, loop: false, startSec: 0 }));
    expect(u.searchParams.get('loop')).toBeNull();
    expect(u.searchParams.get('start')).toBeNull();
  });
});
