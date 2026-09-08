export interface Rect { x: number; y: number; w: number; h: number; }
export interface Insets { top: number; bottom: number; left: number; right: number; }

export const VERTICAL_INSETS: Insets = { top: 160, bottom: 420, left: 48, right: 48 };

export function safeArea(canvas: { w: number; h: number }, insets: Insets): Rect {
  return { x: insets.left, y: insets.top, w: Math.max(0, canvas.w - insets.left - insets.right), h: Math.max(0, canvas.h - insets.top - insets.bottom) };
}

/** Edges inclusive: a rect exactly filling the safe area counts as inside. */
export function isInsideSafezone(rect: Rect, canvas: { w: number; h: number }, insets: Insets): boolean {
  const area = safeArea(canvas, insets);
  return rect.x >= area.x && rect.y >= area.y && rect.x + rect.w <= area.x + area.w && rect.y + rect.h <= area.y + area.h;
}

/** Shrinks rects larger than the safe area, then pins to the safe-area origin (top-left). */
export function clampToSafezone(rect: Rect, canvas: { w: number; h: number }, insets: Insets): Rect {
  const area = safeArea(canvas, insets);
  const w = Math.min(rect.w, area.w);
  const h = Math.min(rect.h, area.h);
  return {
    x: Math.min(Math.max(rect.x, area.x), area.x + area.w - w),
    y: Math.min(Math.max(rect.y, area.y), area.y + area.h - h),
    w,
    h,
  };
}
