import { useEffect, useMemo, useRef, useState } from "react";
import { today } from "../lib/dates";
import { noteTitle } from "../lib/markdown";
import { PaletteItem, rankItems } from "../lib/palette";
import { useNav } from "../nav";
import { useStore } from "../store";

/** Ctrl/Cmd+K: jump to a note or run an action. */
export function Palette({ onClose, onCapture }: { onClose: () => void; onCapture: () => void }) {
  const { notes, openDaily } = useStore();
  const { go } = useNav();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const run: Record<string, () => void | Promise<void>> = useMemo(() => ({
    "a:home": () => go({ name: "home" }),
    "a:tasks": () => go({ name: "tasks" }),
    "a:board": () => go({ name: "board" }),
    "a:calendar": () => go({ name: "calendar" }),
    "a:notes": () => go({ name: "notes" }),
    "a:library": () => go({ name: "library" }),
    "a:weekly": () => go({ name: "weekly" }),
    "a:trash": () => go({ name: "trash" }),
    "a:settings": () => go({ name: "settings" }),
    "a:capture": onCapture,
    "a:today": async () => go({ name: "editor", path: await openDaily(today()) }),
  }), [go, onCapture, openDaily]);

  const items = useMemo<PaletteItem[]>(() => [
    { id: "a:today", label: "Open today’s note", kind: "action" },
    { id: "a:capture", label: "Quick capture a task", kind: "action" },
    { id: "a:home", label: "Go to Home", kind: "action" },
    { id: "a:tasks", label: "Go to All tasks", kind: "action" },
    { id: "a:board", label: "Go to Board", kind: "action" },
    { id: "a:calendar", label: "Go to Calendar", kind: "action" },
    { id: "a:notes", label: "Go to Notes", kind: "action" },
    { id: "a:library", label: "Go to Library", kind: "action" },
    { id: "a:weekly", label: "Start weekly review", kind: "action" },
    { id: "a:trash", label: "Go to Trash", kind: "action" },
    { id: "a:settings", label: "Open Settings", kind: "action" },
    ...Object.entries(notes).map(([p, c]): PaletteItem => ({ id: `n:${p}`, label: noteTitle(p, c), hint: p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : undefined, kind: "note" })),
  ], [notes]);
  const results = rankItems(items, q, 8);

  const choose = (it: PaletteItem | undefined) => {
    if (!it) return;
    onClose();
    if (it.id.startsWith("n:")) go({ name: "editor", path: it.id.slice(2) });
    else void run[it.id]?.();
  };
  return (
    <div className="scrim top" onClick={onClose}>
      <div className="sheet palette" role="dialog" aria-label="Command palette" onClick={(e) => e.stopPropagation()}>
        <input ref={input} className="in" placeholder="Type a note name or a command" aria-label="Command palette search" value={q}
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            else if (e.key === "Enter") choose(results[sel]);
            else if (e.key === "Escape") onClose();
          }} />
        <div role="listbox" aria-label="Results">
          {results.map((r, i) => (
            <button key={r.id} role="option" aria-selected={i === sel} className={`navitem${i === sel ? " on" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => choose(r)}>
              <span className="grow">{r.label}</span>{r.hint && <span className="muted small">{r.hint}</span>}{r.kind === "action" && <span className="chip">Action</span>}
            </button>
          ))}
          {results.length === 0 && <p className="muted">Nothing matches.</p>}
        </div>
      </div>
    </div>
  );
}
