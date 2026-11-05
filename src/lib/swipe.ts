export type SwipeDir = "left" | "right" | null;

/** A swipe is mostly horizontal and long enough. Taps and vertical scrolls are ignored. */
export function swipeDirection(dx: number, dy: number, threshold = 72): SwipeDir {
  if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.6) return null;
  return dx > 0 ? "right" : "left";
}
