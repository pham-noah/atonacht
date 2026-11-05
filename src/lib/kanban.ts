import { Task, TaskEdit, editTask, toggleTask } from "./tasks";

export interface Column {
  id: string; // "todo", "done", or the status written in the note
  title: string;
  kind: "todo" | "status" | "done";
}

/** "In review" -> "in-review": what gets written in the note as @status(in-review). */
export const slug = (s: string) => s.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");

/** To do, then the columns you chose, then Done. */
export function columnsFor(names: string[]): Column[] {
  const seen = new Set<string>(["todo", "done"]);
  const middle: Column[] = [];
  for (const n of names) {
    const id = slug(n);
    if (id && !seen.has(id)) {
      seen.add(id);
      middle.push({ id, title: n.trim(), kind: "status" });
    }
  }
  return [{ id: "todo", title: "To do", kind: "todo" }, ...middle, { id: "done", title: "Done", kind: "done" }];
}

/** Which column a task sits in. A status with no matching column counts as "to do". */
export function columnOf(t: Task, columns: Column[]): string {
  if (t.done) return "done";
  return columns.some((c) => c.kind === "status" && c.id === t.status) ? t.status! : "todo";
}

const PRIO = { high: 0, med: 1, low: 2 } as const;
const byUrgency = (a: Task, b: Task) =>
  (a.priority ? PRIO[a.priority] : 3) - (b.priority ? PRIO[b.priority] : 3) || (a.due ?? "9").localeCompare(b.due ?? "9") || a.path.localeCompare(b.path) || a.line - b.line;

export type BoardSort = "urgency" | "due" | "note" | "title";

const SORTS: Record<BoardSort, (a: Task, b: Task) => number> = {
  urgency: byUrgency,
  due: (a, b) => (a.due ?? "9").localeCompare(b.due ?? "9") || a.title.localeCompare(b.title),
  note: (a, b) => a.path.localeCompare(b.path) || a.line - b.line, // the order they have in their notes
  title: (a, b) => a.title.localeCompare(b.title),
};

export interface BoardOptions {
  sort?: BoardSort;
  tag?: string | null;
  /** Done tasks stamped before this date are left off the board. Tasks done before dates were recorded show only if this is undefined. */
  doneSince?: string;
}

export function buildBoard(tasks: Task[], columns: Column[], opts: BoardOptions = {}): { column: Column; tasks: Task[] }[] {
  const wanted = opts.tag ? tasks.filter((t) => t.tags.includes(opts.tag!)) : tasks;
  return columns.map((column) => {
    let list = wanted.filter((t) => columnOf(t, columns) === column.id);
    if (column.kind === "done") {
      if (opts.doneSince) list = list.filter((t) => t.doneOn && t.doneOn >= opts.doneSince!);
      list = list.sort((a, b) => (b.doneOn ?? "").localeCompare(a.doneOn ?? ""));
    } else list = list.sort(SORTS[opts.sort ?? "urgency"]);
    return { column, tasks: list };
  });
}

/**
 * Moves a task to another column by rewriting its line.
 *  - to "to do": unchecked, no status
 *  - to a status column: unchecked, @status(x)
 *  - to "done": checked and stamped (a repeating task adds its next occurrence, which starts again in "to do")
 */
export function moveInContent(content: string, task: Task, target: Column, today: string, repeatFrom: "due" | "completion" = "due"): string {
  const line = task.line;
  if (target.kind === "done") {
    if (task.done) return content;
    const cleared = task.status ? editTask(content, line, { status: null }) : content; // so a repeat doesn't inherit the old column
    return toggleTask(cleared, line, today, repeatFrom);
  }
  let next = content;
  if (task.done) next = toggleTask(next, line); // uncheck, and drop the old @done
  const edit: TaskEdit = { status: target.kind === "status" ? target.id : null };
  return editTask(next, line, edit);
}
