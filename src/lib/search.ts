import { Task } from "./tasks";
import { addDays } from "./dates";

/**
 * Search that can be narrowed without a second set of controls: `tag:thesis`, `in:Daily notes`, `due:overdue`,
 * `is:open`, `has:task`. Everything that is not a filter is text, so the plain search still works exactly as before.
 */
export interface Query {
  text: string;
  tags: string[];
  folder?: string;
  due?: "overdue" | "today" | "week" | "none";
  done?: boolean;
  has?: "task" | "link";
  /** True when the query says something beyond plain text, so the UI can show what it understood. */
  filtered: boolean;
}

const FILTERS = /(?:^|\s)(tag|in|due|is|has):("[^"]+"|\S+)/gi;

export function parseQuery(raw: string): Query {
  const tags: string[] = [];
  let folder: string | undefined;
  let due: Query["due"];
  let done: boolean | undefined;
  let has: Query["has"];
  let filtered = false;

  let text = raw.replace(FILTERS, (_m, key: string, value: string) => {
    const v = value.replace(/^"|"$/g, "");
    filtered = true;
    switch (key.toLowerCase()) {
      case "tag":
        tags.push(v.replace(/^#/, "").toLowerCase());
        break;
      case "in":
        folder = v;
        break;
      case "due":
        if (/^(overdue|today|week|none)$/i.test(v)) due = v.toLowerCase() as Query["due"];
        break;
      case "is":
        if (/^(done|open)$/i.test(v)) done = v.toLowerCase() === "done";
        break;
      case "has":
        if (/^(task|link)$/i.test(v)) has = v.toLowerCase() as Query["has"];
        break;
    }
    return " ";
  });
  // bare #tags are a filter too, because that is how they are written in a note
  text = text.replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu, (_m, space: string, tag: string) => {
    tags.push(tag.toLowerCase());
    filtered = true;
    return space;
  });

  return { text: text.trim().replace(/\s+/g, " "), tags, folder, due, done, has, filtered };
}

/** Does one note match? `tasks` should be the tasks of the whole folder; they are filtered by path here. */
export function noteMatches(q: Query, path: string, content: string, tasks: Task[], today: string): boolean {
  if (q.folder && !path.toLowerCase().startsWith(q.folder.toLowerCase().replace(/\/$/, "") + "/")) return false;

  const lower = content.toLowerCase();
  if (q.tags.length) {
    for (const tag of q.tags) if (!new RegExp(`#${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(content)) return false;
  }
  if (q.has === "link" && !/\[\[[^\]]+\]\]/.test(content)) return false;

  const mine = q.has === "task" || q.due !== undefined || q.done !== undefined ? tasks.filter((t) => t.path === path) : [];
  if (q.has === "task" && mine.length === 0) return false;
  if (q.done !== undefined && !mine.some((t) => t.done === q.done)) return false;
  if (q.due) {
    const limit = addDays(today, 7); // a local date, not a UTC one: toISOString() would shift it by a day east of Greenwich
    const hit = mine.some((t) => {
      if (q.due === "none") return !t.due;
      if (!t.due) return false;
      if (q.due === "overdue") return !t.done && t.due < today;
      if (q.due === "today") return t.due === today;
      return t.due >= today && t.due <= limit;
    });
    if (!hit) return false;
  }

  if (!q.text) return true;
  const needle = q.text.toLowerCase();
  return path.toLowerCase().includes(needle) || lower.includes(needle);
}

/** Does one task match? The same query language as notes, read against the task's own line rather than the note. */
export function taskMatches(q: Query, t: Task, today: string): boolean {
  if (q.tags.length) {
    const mine = t.tags.map((x) => x.toLowerCase());
    for (const tag of q.tags) if (!mine.includes(tag)) return false;
  }
  if (q.has === "link" && t.links.length === 0) return false;
  if (q.done !== undefined && t.done !== q.done) return false;
  if (q.due) {
    if (q.due === "none") {
      if (t.due) return false;
    } else {
      if (!t.due) return false;
      if (q.due === "overdue" && (t.done || t.due >= today)) return false;
      if (q.due === "today" && t.due !== today) return false;
      if (q.due === "week" && (t.due < today || t.due > addDays(today, 7))) return false;
    }
  }
  if (!q.text) return true;
  const needle = q.text.toLowerCase();
  // the title is what is on screen; the rest of the line catches a link or a tag written after it
  return t.title.toLowerCase().includes(needle) || t.text.toLowerCase().includes(needle) || t.path.toLowerCase().includes(needle);
}

/** What the query understood, for a one-line hint under the field. */
export function describeQuery(q: Query): string {
  const bits: string[] = [];
  if (q.text) bits.push(`“${q.text}”`);
  for (const t of q.tags) bits.push(`tag #${t}`);
  if (q.folder) bits.push(`in ${q.folder}`);
  if (q.due) bits.push(`due ${q.due}`);
  if (q.done !== undefined) bits.push(q.done ? "done" : "open");
  if (q.has) bits.push(`has ${q.has}`);
  return bits.join(" · ");
}
