import { MONTHS, addDays, pad, parseDate } from "./dates";
import { Task } from "./tasks";

/** First day of the week containing `date`: Monday by default, Sunday if `mondayFirst` is false. */
export const weekStart = (date: string, mondayFirst = true) => addDays(date, -((parseDate(date).getDay() + (mondayFirst ? 6 : 0)) % 7));
export const weekEnd = (date: string, mondayFirst = true) => addDays(weekStart(date, mondayFirst), 6);
export const nextMonday = (date: string, mondayFirst = true) => addDays(weekStart(date, mondayFirst), 7);

export function isoWeek(date: string): { year: number; week: number } {
  const d = parseDate(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 3); // the Thursday of this week decides the year
  const year = d.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const week = 1 + Math.round(((d.getTime() - jan4.getTime()) / 864e5 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  return { year, week };
}

export const weeklyPath = (date: string) => {
  const { year, week } = isoWeek(date);
  return `Weekly reviews/${year}-W${pad(week)}.md`;
};

const label = (a: string, b: string) => {
  const [x, y] = [parseDate(a), parseDate(b)];
  const m = (d: Date) => MONTHS[d.getMonth()].slice(0, 3);
  return `${x.getDate()} ${m(x)} – ${y.getDate()} ${m(y)} ${y.getFullYear()}`;
};
export const weekLabel = (date: string, mondayFirst = true) => label(weekStart(date, mondayFirst), weekEnd(date, mondayFirst));

export const doneThisWeek = (tasks: Task[], date: string, mondayFirst = true) =>
  tasks.filter((t) => t.done && t.doneOn && t.doneOn >= weekStart(date, mondayFirst) && t.doneOn <= weekEnd(date, mondayFirst));

/** Summary written to Weekly reviews/<year>-W<nn>.md. Plain bullets, so it never adds duplicate tasks. */
export function reviewNote(date: string, done: Task[], stillOpen: Task[]): string {
  const { year, week } = isoWeek(date);
  const list = (ts: Task[]) => (ts.length ? ts.map((t) => `- ${t.title}${t.due ? ` (due ${t.due})` : ""}`).join("\n") : "- none");
  return `# Weekly review ${year}-W${pad(week)}\n\n${weekLabel(date)}\n\n## Done (${done.length})\n${list(done)}\n\n## Still open (${stillOpen.length})\n${list(stillOpen)}\n`;
}
