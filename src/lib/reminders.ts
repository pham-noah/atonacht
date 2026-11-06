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
  /** Nothing is announced inside these hours; a reminder that lands there waits until `quietTo`. */
  quietFrom: string; // "22:00"
  quietTo: string; // "07:00"
}

export const DEFAULT_REMIND: RemindSettings = {
  enabled: true, time: "09:00", daysBefore: 0, dailyPlan: false, planTime: "08:30", weeklyReview: false, reviewDay: 0, reviewTime: "18:00", quietFrom: "22:00", quietTo: "07:00",
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

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** True when `time` is inside the quiet window, which may cross midnight (22:00 → 07:00). */
export function inQuietHours(time: string, s: RemindSettings): boolean {
  const from = minutesOf(s.quietFrom);
  const to = minutesOf(s.quietTo);
  const t = minutesOf(time);
  if (from === to) return false;
  return from < to ? t >= from && t < to : t >= from || t < to;
}

/**
 * A reminder that lands in the quiet window waits for it to end, the same day or the next morning. Nothing is dropped:
 * a 23:30 nudge becomes an 07:00 one rather than disappearing.
 */
export function afterQuietHours(atMs: number, s: RemindSettings): number {
  const d = new Date(atMs);
  const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (!inQuietHours(hhmm, s)) return atMs;
  const [h, m] = s.quietTo.split(":").map(Number);
  const out = new Date(d);
  out.setHours(h || 0, m || 0, 0, 0);
  // a wake-up time already gone today means tomorrow morning
  if (out.getTime() <= atMs) out.setDate(out.getDate() + 1);
  return out.getTime();
}

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
    // a task can name its own time; otherwise the default time applies
    const time = t.at ?? s.time;
    push({
      id: hashId(`task|${t.path}|${t.title}|${t.due}|${s.daysBefore}|${time}`),
      at: afterQuietHours(at(date, time), s),
      title: t.title,
      body: s.daysBefore ? `Due tomorrow, ${shortDate(t.due)}` : "Due today",
    });
  }
  const start = fmt(new Date(now));
  for (let i = 0; i <= horizon; i++) {
    const date = addDays(start, i);
    if (s.dailyPlan) push({ id: hashId(`plan|${date}`), at: afterQuietHours(at(date, s.planTime), s), title: "Plan your day", body: "Open today’s note" });
    if (s.weeklyReview && parseDate(date).getDay() === s.reviewDay) push({ id: hashId(`week|${date}`), at: afterQuietHours(at(date, s.reviewTime), s), title: "Weekly review", body: "Close the week and plan the next" });
  }
  return out.sort((a, b) => a.at - b.at).slice(0, max);
}

export const todayKey = () => todayStr();
export const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
