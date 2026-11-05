import { longDate } from "./dates";
import { Task, addTask, parseTasks } from "./tasks";
import { fillTemplate } from "./templates";

export const DEFAULT_DAILY_DIR = "Daily notes";
let dir = DEFAULT_DAILY_DIR;
/** The folder daily notes live in. Set from Settings; defaults to "Daily notes". */
export const setDailyDir = (d: string) => {
  dir = d.trim().replace(/^\/+|\/+$/g, "") || DEFAULT_DAILY_DIR;
};
export const getDailyDir = () => dir;
export const dailyPath = (date: string) => `${dir}/${date}.md`;
export const isDailyPath = (p: string) => /\.md$/.test(p) && p.startsWith(dir + "/") && /^\d{4}-\d{2}-\d{2}$/.test(p.slice(dir.length + 1, -3));
export const dateOfDaily = (p: string) => p.slice(dir.length + 1, -3);

export const dailyTemplate = (date: string) => `# ${longDate(date)}\n\n## Plan\n\n## Notes\n\n## Done\n`;

/** Uses the Templates/Daily note.md file when it exists, so the template is yours to edit. */
export const dailyContent = (date: string, template?: string) => (template ? fillTemplate(template, { date }) : dailyTemplate(date));

export interface CarryOver {
  from: string; // path of the earlier daily note
  date: string;
  tasks: Task[];
}

/** Unfinished tasks in the most recent daily note before `today`. */
export function findCarryOver(notes: Record<string, string>, today: string): CarryOver | null {
  const dates = Object.keys(notes)
    .filter(isDailyPath)
    .map(dateOfDaily)
    .filter((d) => d < today)
    .sort();
  for (let i = dates.length - 1; i >= 0; i--) {
    const path = dailyPath(dates[i]);
    const open = parseTasks(path, notes[path]).filter((t) => !t.done);
    if (open.length) return { from: path, date: dates[i], tasks: open };
    return null; // only look at the latest earlier daily note
  }
  return null;
}

/** Copies the tasks into today's Plan and marks the old lines as moved ([>]). */
export function applyCarryOver(todayContent: string, prevContent: string, tasks: Task[]) {
  let today = todayContent;
  for (const t of tasks) today = addTask(today, t.text);
  const lines = prevContent.split("\n");
  for (const t of tasks) lines[t.line] = lines[t.line].replace("[ ]", "[>]");
  return { today, prev: lines.join("\n") };
}
