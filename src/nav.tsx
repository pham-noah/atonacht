import { ReactNode, createContext, useCallback, useContext, useState } from "react";
import { usePrefs } from "./prefs";

export type Route =
  | { name: "home" }
  | { name: "tasks" }
  | { name: "board"; path?: string }
  | { name: "notes"; folder?: string; query?: string }
  | { name: "calendar"; date?: string }
  | { name: "editor"; path: string }
  | { name: "settings" }
  | { name: "conflicts" }
  | { name: "weekly" }
  | { name: "library" }
  | { name: "trash" }
  | { name: "update" }
  | { name: "diagnostics" }
  | { name: "tags" };

interface Nav {
  route: Route;
  go: (r: Route) => void;
  back: () => void;
  replace: (r: Route) => void;
  canBack: boolean;
}
const Ctx = createContext<Nav>(null!);
export const useNav = () => useContext(Ctx);

const TOP = ["home", "tasks", "board", "notes", "calendar"];

export function NavProvider({ children }: { children: ReactNode }) {
  const { prefs } = usePrefs();
  const [stack, setStack] = useState<Route[]>([{ name: prefs.startScreen }]);
  const go = useCallback(
    (r: Route) =>
      setStack((s) => {
        // switching top-level tabs resets the history; opening a detail screen pushes onto it
        if (TOP.includes(r.name) && !(r.name === "notes" && r.folder)) return [r];
        return [...s, r];
      }),
    [],
  );
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const replace = useCallback((r: Route) => setStack((s) => [...s.slice(0, -1), r]), []);
  return <Ctx.Provider value={{ route: stack[stack.length - 1], go, back, replace, canBack: stack.length > 1 }}>{children}</Ctx.Provider>;
}
