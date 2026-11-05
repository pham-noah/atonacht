import { addDays, parseDate, pad, shortDate, today as todayStr, fmt } from "./dates";
import { Task } from "./tasks";

export interface RemindSettings {
  enabled: boolean;
  time: string; // "09:00", for tasks that only have a date
  daysBefore: 0 | 1;
  dailyPlan: boolean;
  planTime: string;
  weeklyReview: boolean;
  reviewDay: number; // 0 = Sunday
  reviewTime: string;
}

export const DEFAULT_REMIND: RemindSettings = {
  enabled: true, time: "09:00", daysBefore: 0, dailyPlan: false, planTime: "08:30", weeklyReview: false, reviewDay: 0, reviewTime: "18:00",
};

export interface Reminder {
  id: number; // stable, so a changed plan can replace the old one
  at: number; // ms since epoch
  title: string;
  body: string;
}

/** Stable positive 31-bit id from a string (FNV-1a). */
export function hashId(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) & 0x7fffffff;
}

const at = (date: string, time: string) => {
  const [h, m] = time.split(":").map(Number);
  const d = parseDate(date);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
};

/**
 * Everything that should be scheduled in the next `horizon` days: task due dates,
 * the daily plan nudge and the weekly review nudge. Pure, so it is easy to test.
 */
export function planReminders(tasks: Task[], now: number, s: RemindSettings, horizon = 14, max = 60): Reminder[] {
  if (!s.enabled) return [];
  const out: Reminder[] = [];
  const end = now + horizon * 864e5;
  const push = (r: Reminder) => r.at > now && r.at <= end && out.push(r);

  for (const t of tasks) {
    if (t.done || !t.due) continue;
    const date = addDays(t.due, -s.daysBefore);
    push({
      id: hashId(`task|${t.path}|${t.title}|${t.due}|${s.daysBefore}`),
      at: at(date, s.time),
      title: t.title,
      body: s.daysBefore ? `Due tomorrow, ${shortDate(t.due)}` : "Due today",
    });
  }
  const start = fmt(new Date(now));
  for (let i = 0; i <= horizon; i++) {
    const date = addDays(start, i);
    if (s.dailyPlan) push({ id: hashId(`plan|${date}`), at: at(date, s.planTime), title: "Plan your day", body: "Open today’s note" });
    if (s.weeklyReview && parseDate(date).getDay() === s.reviewDay) push({ id: hashId(`week|${date}`), at: at(date, s.reviewTime), title: "Weekly review", body: "Close the week and plan the next" });
  }
  return out.sort((a, b) => a.at - b.at).slice(0, max);
}

export const todayKey = () => todayStr();
export const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
