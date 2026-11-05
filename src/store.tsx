import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fs } from "./lib/backend";
import { mapPool } from "./lib/pool";
import { noteCache } from "./lib/noteCache";
import { planTrashCleanup, stampPath, unstampPath } from "./lib/trash";
import type { Entry } from "./lib/fs";
import { addDays, today } from "./lib/dates";
import { dailyContent, dailyPath, setDailyDir } from "./lib/daily";
import { isPinned, setPinned } from "./lib/frontmatter";
import { DAILY_TEMPLATE, STARTERS, isTemplatePath } from "./lib/templates";
import { conflictCopyPath, parseConflict } from "./lib/conflicts";
import { isKanbanNote } from "./lib/boardNote";
import { Column, moveInContent } from "./lib/kanban";
import { TaskIndex } from "./lib/taskIndex";
import { Task, TaskEdit, addTask, editTask, removeTaskLine, setMark, toggleTask } from "./lib/tasks";
import { usePrefs } from "./prefs";

interface Note {
  content: string;
  mtime: number;
  size: number;
}
export interface Conflict {
  path: string; // the conflict copy
  original: string;
  stamp: string;
  device: string;
}
export type Resolution = "mine" | "theirs" | "both";

interface Store {
  root: string;
  ready: boolean;
  error: string | null;
  notes: Record<string, string>; // visible notes only (no conflict copies)
  mtimes: Record<string, number>;
  templates: Record<string, string>;
  pinned: string[];
  boards: string[]; // notes in the Obsidian Kanban format
  all: Record<string, string>; // including conflict copies
  dirs: string[];
  tasks: Task[];
  conflicts: Conflict[];
  undo: { label: string; run: () => Promise<void> } | null;
  clearUndo: () => void;
  save: (path: string, content: string) => Promise<void>;
  remove: (path: string) => Promise<void>;
  mkdir: (name: string) => Promise<void>;
  edit: (path: string, fn: (content: string) => string) => Promise<void>;
  toggle: (t: Task) => Promise<void>;
  drop: (t: Task) => Promise<void>;
  moveTask: (t: Task, to: Column) => Promise<void>;
  someday: (t: Task) => Promise<void>;
  pin: (path: string, on: boolean) => Promise<void>;
  addStarterTemplates: () => Promise<void>;
  updateTask: (t: Task, e: TaskEdit) => Promise<void>;
  /** Removes the task's line from its note. Undo puts the whole note back. */
  deleteTask: (t: Task) => Promise<void>;
  /** `due` undefined uses the default due date from Settings; null means no date. */
  addTaskToToday: (text: string, due?: string | null) => Promise<void>;
  openDaily: (date?: string) => Promise<string>;
  resolve: (c: Conflict, how: Resolution) => Promise<void>;
  /** Saves a version merged by hand and clears the conflict copy. */
  resolveMerged: (c: Conflict, text: string) => Promise<void>;
  /** Re-reads the folder. Returns how many notes were picked up or dropped, so a button can say what it did. */
  refresh: () => Promise<{ updated: number; removed: number }>;
  loadTrash: () => Promise<Entry[]>;
  restore: (trashPath: string) => Promise<string>;
  purge: (trashPath: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  /** Deletes trashed notes older than `days` and starts the clock on old ones that have none. Returns how many were deleted. */
  cleanTrash: (days: number) => Promise<number>;
  renameNote: (from: string, to: string) => Promise<void>;
  renameFolder: (from: string, to: string) => Promise<void>;
  deleteFolder: (path: string) => Promise<void>;
  moveDailyNotes: (fromDir: string, toDir: string) => Promise<number>;
}

type DataKeys = "root" | "ready" | "error" | "notes" | "mtimes" | "templates" | "pinned" | "boards" | "all" | "dirs" | "tasks" | "conflicts" | "undo" | "clearUndo";
type StoreData = Pick<Store, DataKeys>;
type StoreActions = Omit<Store, DataKeys>;

// Notes change often; the actions below almost never. Keeping them in separate contexts means a component that only
// needs to act (a task row's checkbox) is not redrawn every time some other note is saved.
const DataCtx = createContext<StoreData>(null!);
const ActionsCtx = createContext<StoreActions>(null!);
export const useActions = () => useContext(ActionsCtx);
export function useStore(): Store {
  const d = useContext(DataCtx);
  const a = useContext(ActionsCtx);
  return useMemo(() => ({ ...d, ...a }), [d, a]);
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { prefs } = usePrefs();
  const root = prefs.root;
  setDailyDir(prefs.dailyDir);
  const [data, setData] = useState<Record<string, Note>>({});
  const [dirs, setDirs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ label: string; run: () => Promise<void> } | null>(null);
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 7000); // long enough to notice, short enough to not nag
    return () => clearTimeout(t);
  }, [undo]);
  const [ready, setReady] = useState(false);
  const ref = useRef(data);
  const writing = useRef(0); // saves in flight
  const rootRef = useRef(root);
  rootRef.current = root;
  const cacheOn = useRef(prefs.startupCache);
  cacheOn.current = prefs.startupCache;
  // Keep the on-disk copy in step. Failures are ignored: the cache only makes the next start faster.
  const persist = useCallback((changed: Record<string, Note>, removed: string[]) => {
    if (!cacheOn.current || !rootRef.current) return;
    void noteCache.put(rootRef.current, changed).catch(() => {});
    void noteCache.remove(rootRef.current, removed).catch(() => {});
  }, []);

  const put = useCallback((p: string, n: Note | null) => {
    const next = { ...ref.current };
    if (n) next[p] = n;
    else delete next[p];
    ref.current = next;
    setData(next);
    persist(n ? { [p]: n } : {}, n ? [] : [p]);
  }, [persist]);

  const refresh = useCallback(async (): Promise<{ updated: number; removed: number }> => {
    if (!root || writing.current > 0) return { updated: 0, removed: 0 }; // never read a note while we are in the middle of saving it
    try {
      const entries = await fs.list(root);
      const files = entries.filter((e) => e.kind === "file");
      const cur = ref.current;
      const next: Record<string, Note> = {};
      let changed = Object.keys(cur).length !== files.length;
      const fresh: Record<string, Note> = {}; // notes read from disk this time
      // Only changed files are read, and never more than 16 at a time, so a big folder opens without flooding the file layer.
      await mapPool(files, 16, async (e) => {
        const old = cur[e.path];
        if (old && old.mtime === e.mtime && old.size === e.size) {
          next[e.path] = old;
          return;
        }
        next[e.path] = fresh[e.path] = { content: await fs.read(root, e.path), mtime: e.mtime, size: e.size };
        changed = true;
      });
      const removed = Object.keys(cur).filter((p) => !(p in next));
      if (changed) {
        persist(fresh, removed);
        ref.current = next;
        setData(next);
      }
      const d = entries.filter((e) => e.kind === "dir").map((e) => e.path);
      setDirs((old) => (old.join("|") === d.join("|") ? old : d));
      setError(null);
      setReady(true);
      return { updated: Object.keys(fresh).length, removed: removed.length };
    } catch (e) {
      setError(String(e));
      setReady(true);
      return { updated: 0, removed: 0 };
    }
  }, [root, persist]);

  useEffect(() => {
    ref.current = {};
    setData({});
    setDirs([]);
    setReady(false);
    if (!root) return;
    let stop = false;
    // Show the notes from last time straight away, then read only what changed since.
    const warm = cacheOn.current ? noteCache.load(root).catch(() => ({})) : Promise.resolve({});
    warm
      .then((cached) => {
        if (!stop && Object.keys(cached).length > 0 && Object.keys(ref.current).length === 0) {
          ref.current = cached;
          setData(cached);
        }
        return fs.ensureRoot(root);
      })
      .catch((e) => setError(String(e)))
      .then(() => {
        if (!stop) void refresh();
      });
    const timer = setInterval(refresh, fs.pollMs ?? 4000); // pick up changes written by Syncthing
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    let unwatch: (() => void) | undefined;
    let wait: ReturnType<typeof setTimeout> | undefined;
    fs.watch?.(root, () => {
      clearTimeout(wait); // a sync can touch many files at once
      wait = setTimeout(refresh, 250);
    }).then((u) => (stop ? u() : (unwatch = u))).catch(() => {});
    return () => {
      unwatch?.();
      clearTimeout(wait);
      stop = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [root, refresh]);

  const save = useCallback(
    async (path: string, content: string) => {
      if (ref.current[path]?.content === content) return; // nothing changed: don't touch the file, so sync apps see nothing
      writing.current++;
      try {
        const mtime = await fs.write(root, path, content);
        put(path, { content, mtime, size: new TextEncoder().encode(content).length });
      } finally {
        writing.current--;
      }
    },
    [root, put],
  );

  const all = useMemo(() => Object.fromEntries(Object.entries(data).map(([p, n]) => [p, n.content])), [data]);
  // One pass over the paths: each one is either a sync-conflict copy, a template or a note.
  // conflict pattern three times per path (once for each list) on every save.
  const { conflicts, notes, templates } = useMemo(() => {
    const conflicts: Conflict[] = [];
    const notes: Record<string, string> = {};
    const templates: Record<string, string> = {};
    for (const p in all) {
      const c = parseConflict(p);
      if (c) conflicts.push({ path: p, ...c });
      else if (isTemplatePath(p)) templates[p] = all[p];
      else notes[p] = all[p];
    }
    conflicts.sort((a, b) => a.stamp.localeCompare(b.stamp));
    return { conflicts, notes, templates };
  }, [all]);
  const boards = useMemo(() => Object.keys(notes).filter((p) => isKanbanNote(notes[p])).sort(), [notes]);
  const pinned = useMemo(() => Object.keys(notes).filter((p) => isPinned(notes[p])), [notes]);
  const mtimes = useMemo(() => Object.fromEntries(Object.entries(data).map(([p, n]) => [p, n.mtime])), [data]);
  const index = useRef(new TaskIndex());
  const tasks = useMemo(() => index.current.build(notes), [notes]);

  const openDaily = useCallback(
    async (date = today()) => {
      const p = dailyPath(date);
      if (ref.current[p] === undefined) {
        // The template is a file in the notes folder. Read it from disk when the store has not got it (a fresh start
        // on a phone, a template just added, a folder that was not fully listed yet), so the day starts from your
        // template and not from the built-in one.
        let template: string | undefined = ref.current[DAILY_TEMPLATE]?.content;
        if (template === undefined) template = await fs.read(root, DAILY_TEMPLATE).catch((): undefined => undefined);
        await save(p, dailyContent(date, template));
      }
      return p;
    },
    [save, root],
  );

  const actions: StoreActions = useMemo(() => ({
    refresh, save, openDaily,
    remove: async (p) => {
      await fs.remove(root, p);
      put(p, null);
    },
    mkdir: async (name) => {
      await fs.mkdir(root, name);
      setDirs((d) => (d.includes(name) ? d : [...d, name].sort()));
    },
    edit: async (path, fn) => save(path, fn(ref.current[path]?.content ?? "")),
    // A row can outlive its note: another device deleted it and the next refresh hasn't landed yet. Nothing to write then.
    toggle: async (t) => {
      const c = ref.current[t.path]?.content;
      if (c !== undefined) await save(t.path, toggleTask(c, t.line, today(), prefs.repeatFrom));
    },
    moveTask: async (t, to) => {
      const c = ref.current[t.path]?.content;
      if (c !== undefined) await save(t.path, moveInContent(c, t, to, today(), prefs.repeatFrom));
    },
    drop: async (t) => {
      const c = ref.current[t.path]?.content;
      if (c !== undefined) await save(t.path, setMark(c, t.line, "-"));
    },
    someday: async (t) => {
      const c = ref.current[t.path]?.content;
      if (c !== undefined) await save(t.path, editTask(c, t.line, { due: null, title: /#someday\b/.test(t.title) ? t.title : `${t.title} #someday` }));
    },
    pin: async (path, on) => {
      const c = ref.current[path]?.content;
      if (c !== undefined) await save(path, setPinned(c, on));
    },
    addStarterTemplates: async () => {
      for (const [p, c] of Object.entries(STARTERS)) if (ref.current[p] === undefined) await save(p, c);
    },
    updateTask: async (t, e) => {
      const c = ref.current[t.path]?.content;
      if (c !== undefined) await save(t.path, editTask(c, t.line, e));
    },
    deleteTask: async (t) => {
      const before = ref.current[t.path]?.content;
      if (before === undefined) return;
      await save(t.path, removeTaskLine(before, t.line));
      setUndo({
        label: `Deleted “${t.title}”`,
        run: () => save(t.path, before),
      });
    },
    addTaskToToday: async (text, due) => {
      const p = await openDaily();
      const d = due === undefined ? (prefs.defaultDue === "today" ? today() : prefs.defaultDue === "tomorrow" ? addDays(today(), 1) : undefined) : due ?? undefined;
      await save(p, addTask(ref.current[p].content, d ? `${text} @due(${d})` : text));
    },
    loadTrash: () => fs.listTrash(root),
    restore: async (tp) => {
      const rel = await fs.restore(root, tp);
      await refresh();
      return rel;
    },
    purge: (tp) => fs.purge(root, tp),
    emptyTrash: async () => {
      for (const e of await fs.listTrash(root)) await fs.purge(root, e.path);
    },
    cleanTrash: async (days) => {
      const paths = (await fs.listTrash(root)).map((e) => e.path);
      const now = Date.now();
      const plan = planTrashCleanup(paths, now, days);
      for (const p of plan.purge) await fs.purge(root, p);
      for (const p of plan.stamp) await fs.rename(root, `.trash/${p}`, `.trash/${stampPath(unstampPath(p).path, Math.floor(now / 1000))}`);
      return plan.purge.length;
    },
    renameNote: async (from, to) => {
      if (from === to) return;
      await fs.rename(root, from, to);
      await refresh();
    },
    renameFolder: async (from, to) => {
      if (!/^[^/\\.][^/\\]*$/.test(to)) throw new Error("Folder names can’t contain / or start with a dot");
      const entries = await fs.list(root);
      if (entries.some((e) => e.path === to)) throw new Error(`A folder named “${to}” already exists`);
      const under = entries.filter((e) => e.path.startsWith(from + "/"));
      await fs.mkdir(root, to);
      for (const d of under.filter((e) => e.kind === "dir")) await fs.mkdir(root, to + d.path.slice(from.length));
      for (const f of under.filter((e) => e.kind === "file")) await fs.rename(root, f.path, to + f.path.slice(from.length));
      for (const d of [...under.filter((e) => e.kind === "dir")].sort((a, b) => b.path.length - a.path.length)) await fs.removeDir(root, d.path);
      await fs.removeDir(root, from);
      await refresh();
    },
    deleteFolder: async (path) => {
      const under = (await fs.list(root)).filter((e) => e.path.startsWith(path + "/"));
      for (const f of under.filter((e) => e.kind === "file")) await fs.remove(root, f.path); // notes go to the trash
      for (const d of [...under.filter((e) => e.kind === "dir")].sort((a, b) => b.path.length - a.path.length)) await fs.removeDir(root, d.path);
      await fs.removeDir(root, path);
      await refresh();
    },
    moveDailyNotes: async (fromDir, toDir) => {
      const files = Object.keys(ref.current).filter((p) => p.startsWith(fromDir + "/") && /\/\d{4}-\d{2}-\d{2}\.md$/.test(p) && !p.slice(fromDir.length + 1).includes("/"));
      let n = 0;
      for (const p of files) {
        const to = `${toDir}/${p.slice(fromDir.length + 1)}`;
        if (ref.current[to] === undefined) {
          await fs.rename(root, p, to);
          n++;
        }
      }
      await refresh();
      return n;
    },
    resolve: async (c, how) => {
      const other = ref.current[c.path]?.content ?? "";
      if (how === "theirs") await save(c.original, other);
      if (how === "both") {
        const to = conflictCopyPath(c.original, c.stamp);
        await save(to, other);
      }
      await fs.remove(root, c.path);
      put(c.path, null);
    },
    resolveMerged: async (c, text) => {
      await save(c.original, text);
      await fs.remove(root, c.path);
      put(c.path, null);
    },
  }), [root, prefs.repeatFrom, prefs.defaultDue, refresh, save, openDaily, put]); // changes only when the folder or one of these settings does
  const dataValue: StoreData = useMemo(() => ({ root, ready, error, notes, mtimes, templates, pinned, boards, all, dirs, tasks, conflicts, undo, clearUndo: () => setUndo(null) }), [root, ready, error, notes, mtimes, templates, pinned, boards, all, dirs, tasks, conflicts, undo]);
  return (
    <ActionsCtx.Provider value={actions}>
      <DataCtx.Provider value={dataValue}>{children}</DataCtx.Provider>
    </ActionsCtx.Provider>
  );
}
