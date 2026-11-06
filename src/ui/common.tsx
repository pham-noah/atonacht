import { ReactNode, memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { pushBack } from "../lib/back";
import { hasPointer, useMenu } from "./ContextMenu";
import { addDays, shortDate, today } from "../lib/dates";
import { Priority, Task } from "../lib/tasks";
import { dateOfDaily, isDailyPath } from "../lib/daily";
import { columnsFor } from "../lib/kanban";
import { swipeDirection } from "../lib/swipe";
import { useNav } from "../nav";
import { usePrefs } from "../prefs";
import { useActions, useStore } from "../store";

const PATHS: Record<string, string> = {
  back: "M15 5l-7 7 7 7",
  fwd: "M9 5l7 7-7 7",
  plus: "M12 5v14M5 12h14",
  x: "M6 6l12 12M18 6L6 18",
  home: "M4 11.5 12 4l8 7.5M6 10v9h5v-6h2v6h5v-9",
  tasks: "M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3zM8.5 12l2.5 2.5 4.5-5",
  notes: "M6 3h8l4 4v14H6zM9 12h6M9 16h6",
  board: "M4 5h5v14H4zM10 5h4v9h-4zM15 5h5v11h-5z",
  calendar: "M4 8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3zM4 10h16M9 3v4M15 3v4",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  alert: "M12 3l10 18H2zM12 10v4M12 17.5v.01",
  pin: "M12 17v5M8 3h8l-1 7 3 3H6l3-3z",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  link: "M9 15l6-6M10.5 6.5l1.8-1.8a4 4 0 0 1 5.6 5.6l-1.8 1.8M13.5 17.5l-1.8 1.8a4 4 0 0 1-5.6-5.6l1.8-1.8",
  clock: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2",
};
export const Icon = ({ name, size = 22 }: { name: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={PATHS[name]} />
  </svg>
);

export const Logo = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Atonacht">
    <rect width="64" height="64" rx="18" fill="#1B1E2E" />
    <circle cx="28" cy="34" r="20" fill="#D9D4F0" />
    <circle cx="37" cy="27" r="17" fill="#1B1E2E" />
    <circle cx="40" cy="24" r="9" fill="#5B9DFF" />
  </svg>
);

/**
 * A sheet over the page. It takes the keyboard while it is open: focus moves into it, Tab stays inside, Escape closes
 * it, and the focus goes back to whatever opened it. Same behaviour on desktop and on the phone.
 */
export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const sheet = useRef<HTMLDivElement>(null);
  // where the focus was before the sheet opened - read during render, because autoFocus moves it before effects run
  const back = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => pushBack(() => { close.current(); return true; }), []);

  useEffect(() => {
    const el = sheet.current;
    if (!el) return;
    const items = () => [...el.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")];
    if (!el.contains(document.activeElement)) (items()[0] ?? el).focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
        return;
      }
      if (e.key !== "Tab") return;
      const list = items();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
      else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
    };
    // With the keyboard up the sheet shrinks; pull the field you are typing in back into view.
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !el.contains(t) || typeof t.scrollIntoView !== "function") return;
      setTimeout(() => t.scrollIntoView({ block: "nearest" }), 80);
    };
    el.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKey);
      if (back.current?.isConnected) back.current.focus();
    };
  }, []);
  // A portal, not a child of the screen: a sheet opened from inside .content could be painted under the tab bar
  // and the + button, and on a phone that meant the bottom of the dialog was unreachable.
  return createPortal(
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={sheet} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h2 className="h2">{title}</h2>
        <div className="sheetbody">{children}</div>
        {footer && <div className="sheetfoot">{footer}</div>}
      </div>
    </div>,
    // into the app, not the body: the theme's CSS variables live on .app, and this keeps the sheet above the
    // tab bar while still inheriting the current theme
    document.querySelector(".app") ?? document.body,
  );
}

export const PageHead = ({ sub, title, right }: { sub?: string; title: string; right?: ReactNode }) => (
  <div className="pagehead">
    <div>
      {sub && <div className="muted">{sub}</div>}
      <h1 className="ttl">{title}</h1>
    </div>
    {right && <div className="pagehead-r">{right}</div>}
  </div>
);

export const BackBar = ({ label, sub, right, onBack }: { label?: string; sub?: string; right?: ReactNode; onBack?: () => void }) => {
  const nav = useNav();
  const back = onBack ?? nav.back;
  return (
    <div className="bar">
      <button className="ib" onClick={back} aria-label="Back"><Icon name="back" /></button>
      <span className="barlabel grow">
        <span className="bartitle">{label}</span>
        {sub && <span className="barsub">{sub}</span>}
      </span>
      {right}
    </div>
  );
};

/** Counts redraws so tests can prove unchanged rows are left alone. */
export const perf = { taskRowRenders: 0 };

export const TaskRow = memo(function TaskRow({ task, source = true }: { task: Task; source?: boolean }) {
  perf.taskRowRenders++;
  const { toggle, updateTask, deleteTask } = useActions();
  const { go } = useNav();
  const { prefs } = usePrefs();
  const menu = useMenu();
  const [edit, setEdit] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const start = useRef<{ x: number; y: number } | null>(null);
  // A tap renames the task, a long press opens everything else (due, priority, repeat, column).
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const swiped = useRef(false);
  // live drag: the row slides and a panel is revealed behind it
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const stopPress = () => {
    if (press.current) clearTimeout(press.current);
    press.current = null;
  };
  const CAP = 140; // how far the row travels
  const COMMIT = 70; // let go past this and the action happens
  const track = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s || e.pointerType === "mouse" || held.current) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    // a finger that is moving is dragging, not holding: cancelling here stops a slow swipe from opening the editor
    if (Math.abs(mx) > 6 || Math.abs(my) > 6) stopPress();
    if (!dragging) {
      // wait until the gesture is clearly sideways, so a vertical scroll never nudges the row
      if (Math.abs(mx) < 8 || Math.abs(mx) < Math.abs(my) * 1.2) return;
      setDragging(true);
    }
    const usable = mx > 0 ? prefs.swipeRight !== "none" : prefs.swipeLeft !== "none";
    setDx(usable ? Math.max(-CAP, Math.min(CAP, mx)) : Math.max(-24, Math.min(24, mx)) * 0.35);
  };
  const onSwipe = (e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    setDragging(false);
    setDx(0);
    if (!s || e.pointerType === "mouse") return;
    const dir = swipeDirection(e.clientX - s.x, e.clientY - s.y, 56); // 70+ pixels was a long drag for one thumb
    if (!dir) return;
    swiped.current = true; // the click that follows must not start an inline rename
    if (dir === "right" && prefs.swipeRight === "complete") void toggle(task);
    if (dir === "left" && prefs.swipeLeft === "tomorrow" && !task.done) void updateTask(task, { due: addDays(today(), 1) });
    if (dir === "left" && prefs.swipeLeft === "delete") void deleteTask(task);
    setTimeout(() => (swiped.current = false), 400); // a click arrives right after the pointerup
  };
  const commitRename = () => {
    const next = draft.trim();
    setRenaming(false);
    if (!next || next === task.title) return;
    void updateTask(task, { title: next });
  };
  const overdue = !task.done && task.due && task.due < today();
  return (
    <div
      className={`row${dragging ? " swiping" : ""}`}
      data-armed={Math.abs(dx) >= COMMIT ? "yes" : undefined}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, y: e.clientY };
        held.current = false;
        if (e.pointerType !== "mouse") press.current = setTimeout(() => { held.current = true; setEdit(true); }, 450);
      }}
      onPointerMove={track}
      onPointerUp={(e) => { stopPress(); if (held.current) { start.current = null; return; } onSwipe(e); }}
      onPointerCancel={() => { stopPress(); start.current = null; setDragging(false); setDx(0); }}
      onPointerLeave={stopPress}
      onContextMenu={(e) => {
        if (!hasPointer()) return; // a long press on a phone already opens the editor
        e.preventDefault();
        menu.open({
          x: e.clientX,
          y: e.clientY,
          items: [
            { label: task.done ? "Reopen" : "Complete", run: () => void toggle(task) },
            { label: "Rename", run: () => { setDraft(task.title); setRenaming(true); } },
            { label: "", sep: true },
            { label: "Due today", disabled: task.due === today(), run: () => void updateTask(task, { due: today() }) },
            { label: "Due tomorrow", run: () => void updateTask(task, { due: addDays(today(), 1) }) },
            { label: "No date", disabled: !task.due, run: () => void updateTask(task, { due: null }) },
            { label: "", sep: true },
            { label: task.priority === "high" ? "Normal priority" : "High priority", run: () => void updateTask(task, { priority: task.priority === "high" ? null : "high" }) },
            { label: "Change date, repeat, column…", run: () => setEdit(true) },
            { label: "", sep: true },
            { label: "Open its note", run: () => go({ name: "editor", path: task.path }) },
            { label: "Copy text", run: () => void navigator.clipboard?.writeText(`- [ ] ${task.title}`).catch(() => {}) },
            { label: "Delete task", danger: true, sep: true, run: () => void deleteTask(task) },
          ],
        });
      }}
    >
      <SwipePanel dx={dx} commit={COMMIT} cap={CAP} right={prefs.swipeRight} left={prefs.swipeLeft} done={task.done} />
      <div className="rowin" style={{ transform: `translateX(${dx}px)`, transition: dragging ? "none" : undefined }}>
      <input type="checkbox" checked={task.done} onChange={() => toggle(task)} aria-label={`Complete: ${task.title}`} />
      {renaming ? (
        <input
          className="in rowrename grow"
          value={draft}
          autoFocus
          aria-label="Task title"
          enterKeyHint="done"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commitRename()}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commitRename(); }
            if (e.key === "Escape") { e.preventDefault(); setRenaming(false); }
          }}
        />
      ) : (
        <button
          className={`link grow${task.done ? " done" : ""}`}
          onClick={() => {
            if (held.current) { held.current = false; return; } // the long press already opened the editor
            if (swiped.current) return; // a swipe is not a tap
            setDraft(task.title);
            setRenaming(true);
          }}
        >{task.title}</button>
      )}
      <span className="taskmeta">
        {task.priority === "high" && <span className="chip hi">high</span>}
        {task.due && <span className={`chip${overdue ? " warn" : ""}`}>{shortDate(task.due)}</span>}
        {task.repeat && <span className="chip">↻ {task.repeat}</span>}
        {source && (
          <button className="chip chipbtn" onClick={() => go({ name: "editor", path: task.path })}>
            {isDailyPath(task.path) ? `Daily · ${shortDate(dateOfDaily(task.path))}` : task.path.split("/").pop()!.replace(/\.md$/, "")}
          </button>
        )}
      </span>
      </div>
      {edit && <TaskDialog task={task} onClose={() => setEdit(false)} />}
    </div>
  );
});

/** The panel revealed while a row is dragged: tint and border grow with the distance, the icon grows, and past the
 *  commit point the label appears. */
function SwipePanel({ dx, commit, cap, right, left, done }: { dx: number; commit: number; cap: number; right: string; left: string; done: boolean }) {
  if (Math.abs(dx) < 4) return null;
  const toRight = dx > 0;
  const action = toRight ? right : left;
  if (action === "none") return null;
  const p = Math.min(1, Math.abs(dx) / cap);
  const armed = Math.abs(dx) >= commit;
  const icon = toRight ? "tasks" : action === "delete" ? "trash" : "calendar";
  const label = toRight ? "Complete" : action === "delete" ? "Delete" : done ? "Tomorrow" : "Tomorrow";
  return (
    <div
      className={`swipepanel${toRight ? " right" : " left"}${armed ? " armed" : ""}${action === "delete" ? " danger" : ""}`}
      aria-hidden="true"
      style={{ ["--p" as string]: p }}
    >
      {!toRight && armed && <span className="swipelabel">{label}</span>}
      <span className="swipeicon"><Icon name={icon} size={18} /></span>
      {toRight && armed && <span className="swipelabel">{label}</span>}
    </div>
  );
}

const REPEATS = ["", "daily", "weekdays", "weekly", "monthly", "yearly"];

export function TaskDialog({ task, onClose }: { task: Task; onClose: () => void }) {
  const { updateTask } = useStore();
  const [title, setTitle] = useState(task.title);
  const [due, setDue] = useState(task.due ?? "");
  const [at, setAt] = useState(task.at ?? "");
  const [priority, setPriority] = useState<Priority | "">(task.priority ?? "");
  const [repeat, setRepeat] = useState(task.repeat ?? "");
  const { prefs } = usePrefs();
  const [status, setStatus] = useState(task.status ?? "");
  const columns = columnsFor(prefs.kanbanColumns).filter((col) => col.kind === "status");
  const save = async () => {
    await updateTask(task, { title, due: due || null, at: due && at ? at : null, priority: priority || null, repeat: repeat || null, status: task.done ? undefined : status || null });
    onClose();
  };
  return (
    <Modal
      title="Task"
      onClose={onClose}
      footer={<div className="btnrow"><button className="pill" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Save</button></div>}
    >
      <input
        className="in titlein"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Task title"
        autoFocus
        enterKeyHint="done"
        onKeyDown={(e) => { if (e.key === "Enter") void save(); }}
      />
      <label className="field"><span>Due</span><input type="date" className="in" value={due} onChange={(e) => setDue(e.target.value)} /></label>
      {due && (
        <label className="field">
          <span>Remind at</span>
          <input type="time" className="in" value={at} onChange={(e) => setAt(e.target.value)} aria-label="Reminder time" />
        </label>
      )}
      {due && <p className="muted small">{at ? `Written as @at(${at}) in the note.` : "Leave it empty to use the default reminder time from Settings."}</p>}
      <label className="field"><span>Priority</span>
        <select className="in" value={priority} onChange={(e) => setPriority(e.target.value as Priority | "")}>
          <option value="">None</option><option value="low">Low</option><option value="med">Medium</option><option value="high">High</option>
        </select>
      </label>
      <label className="field"><span>Repeat</span>
        <select className="in" value={repeat} onChange={(e) => setRepeat(e.target.value)}>
          {REPEATS.map((r) => <option key={r} value={r}>{r || "Does not repeat"}</option>)}
          {repeat && !REPEATS.includes(repeat) && <option value={repeat}>{repeat}</option>}
        </select>
      </label>
      {!task.done && columns.length > 0 && (
        <label className="field"><span>Board column</span>
          <select className="in" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">To do</option>
            {columns.map((col) => <option key={col.id} value={col.id}>{col.title}</option>)}
            {status && !columns.some((col) => col.id === status) && <option value={status}>{status}</option>}
          </select>
        </label>
      )}
      <p className="muted small mono plainhint">Saved in the note as plain text: @due(…) @repeat(…) @status(…) !priority</p>
      {null}
    </Modal>
  );
}

export function CaptureDialog({ onClose, initial = "" }: { onClose: () => void; initial?: string }) {
  const { addTaskToToday } = useStore();
  const { prefs } = usePrefs();
  const [text, setText] = useState(initial);
  const [err, setErr] = useState("");
  const [due, setDue] = useState<"" | "today" | "tomorrow">(prefs.defaultDue === "none" ? "" : prefs.defaultDue);
  const submit = async () => {
    if (!text.trim()) return;
    const d = due === "today" ? today() : due === "tomorrow" ? addDays(today(), 1) : null;
    try {
      await addTaskToToday(text.trim(), d);
      onClose();
    } catch (e) {
      setErr(`Could not save the task: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  return (
    <Modal title="Quick capture" onClose={onClose}>
      <input className="in" autoFocus placeholder="What needs doing?" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      <div className="btnrow start">
        {(["", "today", "tomorrow"] as const).map((d) => (
          <button key={d} className={`pill${due === d ? " on" : ""}`} onClick={() => setDue(d)}>{d || "No date"}</button>
        ))}
      </div>
      {err && <p className="errtext" role="alert">{err}</p>}
      <p className="muted small">Added to today’s note under Plan.</p>
      <div className="btnrow"><button className="pill" onClick={onClose}>Cancel</button><button className="btn" onClick={submit}>Add</button></div>
    </Modal>
  );
}

export function NewFolderDialog({ onClose }: { onClose: () => void }) {
  const { mkdir } = useStore();
  const [name, setName] = useState("");
  const ok = /^[^/\\.][^/\\]*$/.test(name.trim());
  const submit = async () => {
    if (!ok) return;
    await mkdir(name.trim());
    onClose();
  };
  return (
    <Modal title="New folder" onClose={onClose}>
      <input className="in" autoFocus placeholder="Folder name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      <div className="btnrow"><button className="pill" onClick={onClose}>Cancel</button><button className="btn" disabled={!ok} onClick={submit}>Create</button></div>
    </Modal>
  );
}

export function RenameNoteDialog({ path, onClose, onDone }: { path: string; onClose: () => void; onDone: (to: string) => void }) {
  const { dirs, notes, renameNote } = useStore();
  const [name, setName] = useState(path.split("/").pop()!.replace(/\.md$/, ""));
  const [folder, setFolder] = useState(path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
  const [err, setErr] = useState("");
  const to = `${folder ? folder + "/" : ""}${name.trim()}.md`;
  const ok = /^[^/\\.][^/\\]*$/.test(name.trim());
  const submit = async () => {
    if (!ok) return;
    if (to !== path && notes[to] !== undefined) return setErr("A note with that name already exists there.");
    try {
      await renameNote(path, to);
      onDone(to);
    } catch (e) {
      setErr(String(e));
    }
  };
  return (
    <Modal title="Rename or move" onClose={onClose}>
      <input className="in" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} aria-label="Note name" />
      <label className="field"><span>Folder</span>
        <select className="in" value={folder} onChange={(e) => setFolder(e.target.value)}>
          <option value="">No folder</option>
          {dirs.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </label>
      {err && <p className="errtext">{err}</p>}
      <div className="btnrow"><button className="pill" onClick={onClose}>Cancel</button><button className="btn" disabled={!ok} onClick={submit}>Save</button></div>
    </Modal>
  );
}
