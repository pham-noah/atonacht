import { useRef } from "react";
import { swipeDirection } from "./lib/swipe";

interface Opts {
  enabled: boolean; // phones only: on a desktop the tab bar is a sidebar
  tabs: string[]; // the tabs in bar order
  current: string; // the route showing now
  goTab: (id: string) => void;
}

/**
 * Swiping left or right across the page moves to the next or previous tab, the way the bottom bar reads.
 * A swipe that starts on something with its own horizontal behaviour (a board column, a task row, a text field,
 * the editor) is left alone, so this never fights the rest of the app.
 */
export function useTabSwipe({ enabled, tabs, current, goTab }: Opts) {
  const start = useRef<{ x: number; y: number; ok: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!enabled) return;
    const el = e.target as HTMLElement;
    const blocked = el.closest("input, textarea, select, .board, .kcol, .row, .cm-editor, .toolbar, .tabs, .fab, .scrim");
    start.current = { x: e.clientX, y: e.clientY, ok: !blocked };
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!enabled || !s?.ok || e.pointerType === "mouse") return;
    const dir = swipeDirection(e.clientX - s.x, e.clientY - s.y, 60);
    if (!dir) return;
    const i = tabs.indexOf(current);
    if (i < 0) return;
    const next = dir === "left" ? tabs[i + 1] : tabs[i - 1];
    if (next) goTab(next);
  };

  return { onPointerDown, onPointerUp, onPointerCancel: () => (start.current = null) };
}
