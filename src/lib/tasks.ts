import { addDays, nextOccurrence } from "./dates";

export type Priority = "high" | "med" | "low";

export interface Task {
  id: string; // "path:line"
  path: string;
  line: number;
  done: boolean;
  text: string; // everything after the checkbox
  title: string; // text without @due / @repeat / !priority
  due?: string;
  priority?: Priority;
  repeat?: string;
  doneOn?: string;
  status?: string; // board column, e.g. "doing"; none means "to do"
  tags: string[];
  links: string[];
}

const TASK_RE = /^(\s*)([-*+]) \[([ xX])\] ?(.*)$/;
const DUE_RE = /@due\((\d{4}-\d{2}-\d{2})\)/;
const DONE_RE = /@done\((\d{4}-\d{2}-\d{2})\)/;
const STATUS_RE = /@status\(([^)]+)\)/;
const REPEAT_RE = /@repeat\(([^)]+)\)/;
const PRIO_RE = /(^|\s)!(high|med|low)\b/;
const TAG_RE = /(?:^|\s)#([\p{L}\p{N}_-]+)/gu;
const LINK_RE = /\[\[([^\]]+)\]\]/g;

export const eolOf = (content: string) => (content.includes("\r\n") ? "\r\n" : "\n");
const splitLines = (content: string) => content.split(/\r?\n/);

export function parseTaskLine(path: string, line: number, raw: string): Task | null {
  const m = TASK_RE.exec(raw);
  if (!m) return null;
  const mark = m[3];
  if (mark === ">") return null;
  const text = m[4];
  const title = text
    .replace(DUE_RE, "")
    .replace(REPEAT_RE, "")
    .replace(DONE_RE, "")
    .replace(STATUS_RE, "")
    .replace(PRIO_RE, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  return {
    id: `${path}:${line}`,
    path,
    line,
    done: mark !== " ",
    text,
    title,
    due: DUE_RE.exec(text)?.[1],
    priority: PRIO_RE.exec(text)?.[2] as Priority | undefined,
    repeat: REPEAT_RE.exec(text)?.[1],
    doneOn: DONE_RE.exec(text)?.[1],
    status: STATUS_RE.exec(text)?.[1],
    tags: [...text.matchAll(TAG_RE)].map((x) => x[1]),
    links: [...text.matchAll(LINK_RE)].map((x) => x[1]),
  };
}

export function parseTasks(path: string, content: string): Task[] {
  const out: Task[] = [];
  let fenced = false;
  splitLines(content).forEach((raw, i) => {
    if (/^\s*```/.test(raw)) fenced = !fenced;
    if (fenced) return;
    const t = parseTaskLine(path, i, raw);
    if (t && TASK_RE.test(raw) && !/\[[>]\]/.test(raw)) out.push(t);
  });
  return out;
}

/**
 * Check or uncheck a task. Checking stamps @done(date) when `doneOn` is given, and a repeating
 * task adds the next one right below it.
 */
export function toggleTask(content: string, line: number, doneOn?: string, repeatFrom: "due" | "completion" = "due"): string {
  const eol = eolOf(content);
  const lines = splitLines(content);
  const m = TASK_RE.exec(lines[line] ?? "");
  if (!m) return content;
  const [, indent, bullet, mark, text] = m;
  if (mark === " ") {
    lines[line] = `${indent}${bullet} [x] ${text}${doneOn ? ` @done(${doneOn})` : ""}`;
    const rule = REPEAT_RE.exec(text)?.[1];
    const due = DUE_RE.exec(text)?.[1];
    if (rule && due) {
      const next = nextOccurrence(repeatFrom === "completion" && doneOn ? doneOn : due, rule);
      if (next) lines.splice(line + 1, 0, `${indent}${bullet} [ ] ${text.replace(DUE_RE, `@due(${next})`)}`);
    }
  } else {
    lines[line] = `${indent}${bullet} [ ] ${text.replace(DONE_RE, "").replace(/\s{2,}/g, " ").trimEnd()}`;
  }
  return lines.join(eol);
}

/** Set the checkbox character, e.g. "-" for a dropped task. Dropped tasks stay in the note but leave every list. */
export function setMark(content: string, line: number, mark: string): string {
  const eol = eolOf(content);
  const lines = splitLines(content);
  lines[line] = (lines[line] ?? "").replace(/\[[ xX>-]\]/, `[${mark}]`);
  return lines.join(eol);
}

export interface TaskEdit {
  title?: string;
  due?: string | null;
  priority?: Priority | null;
  repeat?: string | null;
  status?: string | null;
}

/** Rewrite one task line, keeping tags and links in the text. */
/** Drops one task's line from a note, leaving everything else exactly as it was. */
export function removeTaskLine(content: string, line: number): string {
  const eol = eolOf(content);
  const lines = splitLines(content);
  if (line < 0 || line >= lines.length) return content;
  lines.splice(line, 1);
  return lines.join(eol);
}

export function editTask(content: string, line: number, edit: TaskEdit): string {
  const eol = eolOf(content);
  const lines = splitLines(content);
  const m = TASK_RE.exec(lines[line] ?? "");
  if (!m) return content;
  const [, indent, bullet, mark, text] = m;
  const old = parseTaskLine("", line, lines[line])!;
  const title = (edit.title ?? old.title).trim();
  const due = edit.due === undefined ? old.due : edit.due;
  const priority = edit.priority === undefined ? old.priority : edit.priority;
  const repeat = edit.repeat === undefined ? old.repeat : edit.repeat;
  const status = edit.status === undefined ? old.status : edit.status;
  const parts = [title];
  if (due) parts.push(`@due(${due})`);
  if (repeat) parts.push(`@repeat(${repeat})`);
  if (status) parts.push(`@status(${status})`);
  if (priority) parts.push(`!${priority}`);
  if (old.doneOn) parts.push(`@done(${old.doneOn})`);
  void text;
  lines[line] = `${indent}${bullet} [${mark}] ${parts.join(" ")}`;
  return lines.join(eol);
}

/** Add a task at the end of the "Plan" section (or at the end of the note). */
export function addTask(content: string, text: string, section = "Plan"): string {
  const eol = eolOf(content);
  const lines = splitLines(content);
  const entry = `- [ ] ${text}`;
  const head = lines.findIndex((l) => new RegExp(`^#{1,6}\\s+${section}\\s*$`, "i").test(l));
  if (head < 0) {
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    lines.push("", `## ${section}`, entry, "");
    return lines.join(eol);
  }
  let end = head + 1;
  while (end < lines.length && !/^#{1,6}\s/.test(lines[end])) end++;
  let at = end;
  while (at > head + 1 && lines[at - 1].trim() === "") at--;
  lines.splice(at, 0, entry);
  return lines.join(eol);
}

export interface Groups {
  overdue: Task[];
  today: Task[];
  week: Task[];
  later: Task[];
  nodate: Task[];
}

const byDue = (a: Task, b: Task) => (a.due ?? "9").localeCompare(b.due ?? "9");

export function groupTasks(tasks: Task[], today: string): Groups {
  const g: Groups = { overdue: [], today: [], week: [], later: [], nodate: [] };
  const weekEnd = addDays(today, 6);
  for (const t of tasks.filter((t) => !t.done).sort(byDue)) {
    if (!t.due) g.nodate.push(t);
    else if (t.due < today) g.overdue.push(t);
    else if (t.due === today) g.today.push(t);
    else if (t.due <= weekEnd) g.week.push(t);
    else g.later.push(t);
  }
  return g;
}
