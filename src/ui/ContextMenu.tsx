import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface MenuItem {
  label?: string;
  run?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Draws a hairline above this item. */
  sep?: boolean;
}

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

const Ctx = createContext<{ open: (menu: MenuState) => void }>({ open: () => {} });

/** Right-click menus: one host at the shell, opened from anywhere with a list of items. */
export const useMenu = () => useContext(Ctx);

/** True on a mouse or trackpad. A long press on a phone must keep doing what it does instead of raising a menu. */
export const hasPointer = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches === true;

export function MenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const open = useCallback((next: MenuState) => setMenu(next), []);
  const close = useCallback(() => setMenu(null), []);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const items = [...(box.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? [])];
      if (!items.length) return;
      e.preventDefault();
      const at = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === "ArrowDown" ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
      items[next].focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    // focus the first item so the arrow keys and Enter work straight away
    const first = box.current?.querySelector<HTMLButtonElement>("button:not([disabled])");
    first?.focus();
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu, close]);

  // keep the panel inside the window: a menu opened near the right or bottom edge flips instead of hanging off
  const width = 232;
  const height = menu ? 14 + menu.items.reduce((sum, i) => sum + (i.label ? 40 : 0) + (i.sep ? 9 : 0), 0) : 0;
  const left = menu ? Math.min(menu.x, Math.max(8, window.innerWidth - width - 8)) : 0;
  const top = menu ? Math.min(menu.y, Math.max(8, window.innerHeight - height - 8)) : 0;

  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {menu &&
        createPortal(
          <div
            className="ctxmenu"
            role="menu"
            ref={box}
            style={{ left, top, width }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {menu.items.map((item, i) =>
              item.label ? (
                <button
                  key={i}
                  role="menuitem"
                  className={`ctxitem${item.danger ? " danger" : ""}${item.sep ? " sep" : ""}`}
                  disabled={item.disabled}
                  onClick={() => {
                    close();
                    item.run?.();
                  }}
                >
                  {item.label}
                </button>
              ) : null,
            )}
          </div>,
          document.querySelector(".app") ?? document.body,
        )}
    </Ctx.Provider>
  );
}
