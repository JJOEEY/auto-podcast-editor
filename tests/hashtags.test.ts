import { describe, expect, it } from 'vitest';
import { buildHashtags } from '../core/hashtags.js';

describe('buildHashtags', () => {
  it('normalizes Vietnamese project names', () => {
    expect(buildHashtags('Tập Podcast Đầu Tiên')).toEqual(['#podcast', '#tappodcastdautien', '#video', '#xuhuong']);
  });

  it('always returns four unique tags', () => {
    const tags = buildHashtags('Video');
    expect(tags).toHaveLength(4);
    expect(new Set(tags).size).toBe(4);
  });

  it('uses a safe fallback for empty names', () => {
    expect(buildHashtags('')).toEqual(['#podcast', '#video', '#xuhuong', '#shorts']);
  });
});
