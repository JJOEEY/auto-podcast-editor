import { describe, expect, it } from 'vitest';
import { clampToSafezone, isInsideSafezone, safeArea, VERTICAL_INSETS } from '../core/safezone.js';

const canvas = { w: 1080, h: 1920 };

describe('safezone', () => {
  it('accepts rects inside the safe area', () => {
    expect(isInsideSafezone({ x: 100, y: 900, w: 880, h: 120 }, canvas, VERTICAL_INSETS)).toBe(true);
  });

  it('rejects rects overlapping the TikTok action bar', () => {
    expect(isInsideSafezone({ x: 900, y: 1500, w: 150, h: 120 }, canvas, VERTICAL_INSETS)).toBe(false);
  });

  it('clamps a rect back inside', () => {
    const out = clampToSafezone({ x: 0, y: 0, w: 200, h: 100 }, canvas, VERTICAL_INSETS);
    expect(out.x).toBe(48);
    expect(out.y).toBe(160);
  });
});

describe('safeArea', () => {
  it('computes the 1080x1920 safe rect', () => {
    expect(safeArea({ w: 1080, h: 1920 }, VERTICAL_INSETS)).toEqual({ x: 48, y: 160, w: 984, h: 1340 });
  });

  it('never returns negative size for insets larger than canvas', () => {
    const area = safeArea({ w: 100, h: 100 }, VERTICAL_INSETS);
    expect(area.w).toBeGreaterThanOrEqual(0);
    expect(area.h).toBeGreaterThanOrEqual(0);
  });
});

describe('clamp edge cases', () => {
  it('shrinks oversized rects and pins them inside', () => {
    const canvas = { w: 1080, h: 1920 };
    const out = clampToSafezone({ x: 0, y: 0, w: 2000, h: 3000 }, canvas, VERTICAL_INSETS);
    expect(isInsideSafezone(out, canvas, VERTICAL_INSETS)).toBe(true);
    expect(out.w).toBe(984);
  });

  it('treats exact edges as inside (inclusive)', () => {
    const canvas = { w: 1080, h: 1920 };
    expect(isInsideSafezone({ x: 48, y: 160, w: 984, h: 1340 }, canvas, VERTICAL_INSETS)).toBe(true);
  });
});
