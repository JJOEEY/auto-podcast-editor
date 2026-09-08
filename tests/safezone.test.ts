import { describe, expect, it } from 'vitest';
import { clampToSafezone, isInsideSafezone } from '../core/safezone.js';

const canvas = { w: 1080, h: 1920 };
const insets = { top: 160, bottom: 420, left: 48, right: 48 };

describe('safezone', () => {
  it('accepts rects inside the safe area', () => {
    expect(isInsideSafezone({ x: 100, y: 900, w: 880, h: 120 }, canvas, insets)).toBe(true);
  });

  it('rejects rects overlapping the TikTok action bar', () => {
    expect(isInsideSafezone({ x: 900, y: 1500, w: 150, h: 120 }, canvas, insets)).toBe(false);
  });

  it('clamps a rect back inside', () => {
    const out = clampToSafezone({ x: 0, y: 0, w: 200, h: 100 }, canvas, insets);
    expect(out.x).toBe(48);
    expect(out.y).toBe(160);
  });
});
