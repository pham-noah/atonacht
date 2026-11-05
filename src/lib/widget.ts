import { longDate } from "./dates";
import { Task } from "./tasks";

export interface WidgetTask { t: string; d: string }
export interface WidgetPayload { date: string; count: number; tasks: WidgetTask[] }

/**
 * What the home screen widget shows: overdue tasks first, then tasks due today, then open tasks in today's note.
 * `count` is the full number of open items; `tasks` is trimmed to what fits.
 */
export function widgetPayload(tasks: Task[], today: string, todaysNote: string, max = 8): WidgetPayload {
  const open = tasks.filter((t) => !t.done);
  const rank = (t: Task) => (t.due && t.due < today ? 0 : t.due === today ? 1 : 2);
  const shown = open
    .filter((t) => (t.due && t.due <= today) || t.path === todaysNote)
    .sort((a, b) =>
      rank(a) - rank(b) ||
      (rank(a) === 2 ? a.line - b.line : (a.due ?? "").localeCompare(b.due ?? "") || a.title.localeCompare(b.title)), // today's note keeps its own order
    );
  return {
    date: longDate(today),
    count: shown.length,
    tasks: shown.slice(0, max).map((t) => ({ t: t.title, d: t.due && t.due < today ? "overdue" : "" })),
  };
}
