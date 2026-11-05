import { useCallback, useEffect, useRef, useState } from "react";

export interface Spot { col: number; index: number }
export interface Source { col: number; card: number }

interface Options {
  /** True when position inside a column matters (project boards). False when columns are sorted automatically. */
  positional: boolean;
  onDrop: (from: Source, to: Spot) => void;
  /** Words for the screen-reader announcement, e.g. the column's title. */
  columnName: (col: number) => string;
  cardName: (from: Source) => string;
}

interface Session {
  from: Source;
  el: HTMLElement;
  x0: number;
  y0: number;
  x: number;
  y: number;
  offX: number;
  offY: number;
  touch: boolean;
  active: boolean;
  over: Spot | null;
  ghost?: HTMLElement; // the copy of the card that follows the pointer
  hold?: ReturnType<typeof setTimeout>;
  raf?: number;
}

const MOUSE_SLOP = 4; // pixels a mouse must travel before a press becomes a drag
const TOUCH_SLOP = 8; // a finger that moves this far before the hold finishes is scrolling, not dragging
const HOLD_MS = 250; // press-and-hold time on a touchscreen

/**
 * Drag and drop for board cards that works with mouse, finger, pen and keyboard.
 *  - mouse and pen: press and move
 *  - touch: press and hold, then move (moving earlier scrolls the board as usual)
 *  - keyboard: Space picks a card up, arrow keys choose where, Space drops it, Escape cancels
 * Markup it relies on: columns have data-col-drop="<index>", cards have data-card="<index>" inside their column.
 */
export function useBoardDnd(opts: Options) {
  const o = useRef(opts);
  o.current = opts;
  const [drag, setDrag] = useState<Source | null>(null);
  const [over, setOver] = useState<Spot | null>(null);
  const [say, setSay] = useState("");
  const session = useRef<Session | null>(null);
  const grabbed = useRef<{ from: Source; over: Spot } | null>(null);
  const cleanups = useRef<(() => void)[]>([]);

  const locate = useCallback((x: number, y: number): Spot | null => {
    const hit = document.elementFromPoint(x, y) as HTMLElement | null;
    const colEl = hit?.closest<HTMLElement>("[data-col-drop]");
    if (!colEl) return null;
    let index = 0;
    if (o.current.positional) {
      const cards = [...colEl.querySelectorAll<HTMLElement>("[data-card]")];
      index = cards.length;
      for (let i = 0; i < cards.length; i++) {
        const r = cards[i].getBoundingClientRect();
        if (y < r.top + r.height / 2) {
          index = i;
          break;
        }
      }
    }
    return { col: Number(colEl.dataset.colDrop), index };
  }, []);

  const finish = useCallback(() => {
    const s = session.current;
    if (s) {
      clearTimeout(s.hold);
      if (s.raf) cancelAnimationFrame(s.raf);
      s.ghost?.remove();
    }
    session.current = null;
    cleanups.current.forEach((f) => f());
    cleanups.current = [];
    setDrag(null);
    setOver(null);
  }, []);

  /** Moves the board sideways, and the page up or down, when the pointer is near an edge. */
  const autoScroll = useCallback(() => {
    const s = session.current;
    if (!s?.active) return;
    // The closer to the edge, the faster it goes (up to about 10 pixels a frame), so you can stop where you want.
    const push = (pos: number, lo: number, hi: number, zone: number) => (pos < lo + zone ? -(lo + zone - pos) / zone : pos > hi - zone ? (pos - (hi - zone)) / zone : 0);
    const board = document.querySelector<HTMLElement>(".board");
    if (board) {
      const r = board.getBoundingClientRect();
      board.scrollLeft += push(s.x, r.left, r.right, 64) * 10;
    }
    const page = document.querySelector<HTMLElement>(".main");
    if (page) page.scrollTop += push(s.y, 0, window.innerHeight, 90) * 10;
    const next = locate(s.x, s.y);
    if (next && (!s.over || next.col !== s.over.col || next.index !== s.over.index)) {
      s.over = next;
      setOver(next);
    }
    s.raf = requestAnimationFrame(autoScroll);
  }, [locate]);

  const activate = useCallback((s: Session) => {
    s.active = true;
    const r = s.el.getBoundingClientRect();
    s.offX = s.x0 - r.left;
    s.offY = s.y0 - r.top;
    const ghost = s.el.cloneNode(true) as HTMLElement;
    ghost.classList.add("kghost");
    ghost.removeAttribute("data-card");
    ghost.style.width = `${r.width}px`;
    (s.el.closest(".app") ?? document.body).appendChild(ghost); // inside the themed container, so it gets the theme's colours
    s.ghost = ghost;
    const block = (e: TouchEvent) => e.preventDefault(); // while a card is carried, the finger must not scroll the page
    window.addEventListener("touchmove", block, { passive: false });
    cleanups.current.push(() => window.removeEventListener("touchmove", block));
    setDrag(s.from);
    setSay(`Picked up ${o.current.cardName(s.from)}. Move it, then let go to drop it.`);
    s.raf = requestAnimationFrame(autoScroll);
  }, [autoScroll]);

  const pointerDown = useCallback((e: React.PointerEvent<HTMLElement>, col: number, card: number) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if ((e.target as HTMLElement).closest("input,select,textarea")) return;
    finish();
    const el = e.currentTarget;
    const s: Session = { from: { col, card }, el, x0: e.clientX, y0: e.clientY, touch: e.pointerType === "touch", active: false, offX: 0, offY: 0, x: e.clientX, y: e.clientY, over: null };
    session.current = s;
    if (s.touch) s.hold = setTimeout(() => { if (session.current === s) activate(s); }, HOLD_MS);

    const move = (ev: PointerEvent) => {
      s.x = ev.clientX;
      s.y = ev.clientY;
      if (!s.active) {
        const dist = Math.hypot(ev.clientX - s.x0, ev.clientY - s.y0);
        if (s.touch) {
          if (dist > TOUCH_SLOP) finish(); // the finger is scrolling
          return;
        }
        if (dist < MOUSE_SLOP) return;
        activate(s);
      }
      if (s.ghost) s.ghost.style.transform = `translate(${s.x - s.offX}px, ${s.y - s.offY}px) rotate(2deg)`;
      const next = locate(s.x, s.y);
      if (next && (!s.over || next.col !== s.over.col || next.index !== s.over.index)) {
        s.over = next;
        setOver(next);
      }
    };
    const up = () => {
      const wasActive = s.active;
      const target = s.over;
      finish();
      if (wasActive) {
        // The click that follows a drag must not open the card.
        const stop = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); };
        window.addEventListener("click", stop, { capture: true, once: true });
        setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 0); // the browser fires that click right after pointerup, before any timer
        if (target) {
          o.current.onDrop(s.from, target);
          setSay(`Dropped in ${o.current.columnName(target.col)}.`);
        }
      }
    };
    const key = (ev: KeyboardEvent) => { if (ev.key === "Escape") finish(); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("keydown", key);
    cleanups.current.push(() => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("keydown", key);
    });
  }, [activate, finish, locate]);

  /** Keyboard: Space picks up, arrows choose a place, Space drops, Escape cancels. */
  const keyDown = useCallback((e: React.KeyboardEvent<HTMLElement>, col: number, card: number) => {
    if (!grabbed.current && e.target !== e.currentTarget) return; // Space on the card's own buttons must still press them
    if ((e.target as HTMLElement).closest("input,select,textarea")) return;
    const count = (c: number) => document.querySelectorAll(`[data-col-drop="${c}"] [data-card]`).length;
    const cols = document.querySelectorAll("[data-col-drop]").length;
    const g = grabbed.current;
    if (!g) {
      if (e.key === " " || (e.key === "Enter" && e.target === e.currentTarget)) {
        e.preventDefault();
        grabbed.current = { from: { col, card }, over: { col, index: card } };
        setDrag({ col, card });
        setOver({ col, index: card });
        setSay(`Picked up ${o.current.cardName({ col, card })}. Use the arrow keys to choose a place, Space to drop, Escape to cancel.`);
      }
      return;
    }
    e.preventDefault();
    const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n));
    let next = g.over;
    if (e.key === "ArrowRight") next = { col: clamp(g.over.col + 1, cols - 1), index: o.current.positional ? clamp(g.over.index, count(clamp(g.over.col + 1, cols - 1))) : 0 };
    else if (e.key === "ArrowLeft") next = { col: clamp(g.over.col - 1, cols - 1), index: o.current.positional ? clamp(g.over.index, count(clamp(g.over.col - 1, cols - 1))) : 0 };
    else if (e.key === "ArrowDown" && o.current.positional) {
      let i = g.over.index + 1;
      if (g.over.col === g.from.col && i === g.from.card + 1) i++; // the slot right below the card is where it already is
      next = { ...g.over, index: clamp(i, count(g.over.col)) };
    } else if (e.key === "ArrowUp" && o.current.positional) {
      let i = g.over.index - 1;
      if (g.over.col === g.from.col && i === g.from.card + 1) i = g.from.card;
      next = { ...g.over, index: clamp(i, count(g.over.col)) };
    }
    else if (e.key === " " || e.key === "Enter") {
      grabbed.current = null;
      setDrag(null);
      setOver(null);
      o.current.onDrop(g.from, g.over);
      setSay(`Dropped in ${o.current.columnName(g.over.col)}.`);
      return;
    } else if (e.key === "Escape") {
      grabbed.current = null;
      setDrag(null);
      setOver(null);
      setSay("Cancelled.");
      return;
    } else return;
    g.over = next;
    setOver(next);
    setSay(`${o.current.columnName(next.col)}${o.current.positional ? `, position ${next.index + 1}` : ""}.`);
  }, []);

  useEffect(() => () => finish(), [finish]);

  return { drag, over, say, pointerDown, keyDown, grabbed: !!grabbed.current };
}
