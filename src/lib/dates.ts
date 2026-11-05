export const pad = (n: number) => String(n).padStart(2, "0");
export const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const today = () => fmt(new Date());
export const addDays = (s: string, n: number) => {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return fmt(d);
};

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const weekdayKey = (s: string) => DAY_KEYS[parseDate(s).getDay()];

/** "Thursday, 29 October" */
export const longDate = (s: string) => {
  const d = parseDate(s);
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
/** "29 Oct" */
/** "Thu, 5 Nov" - the long form wraps onto two lines in a phone-sized header. */
export const shortLongDate = (s: string) => {
  const d = parseDate(s);
  return `${DAY_NAMES[d.getDay()].slice(0, 3)}, ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
};
export const shortDate = (s: string) => {
  const d = parseDate(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
};

const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

function addMonths(s: string, n: number, day?: number): string {
  const d = parseDate(s);
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const dd = Math.min(day ?? d.getDate(), daysInMonth(target.getFullYear(), target.getMonth()));
  return fmt(new Date(target.getFullYear(), target.getMonth(), dd));
}

/**
 * Next due date for a repeating task, counted from the old due date.
 * Rules: daily | weekdays | weekly | weekly:thu | monthly | monthly:29 | yearly
 */
export function nextOccurrence(due: string, rule: string): string | null {
  const [kind, arg] = rule.trim().toLowerCase().split(":");
  switch (kind) {
    case "daily":
      return addDays(due, 1);
    case "weekdays": {
      let n = addDays(due, 1);
      while (["sat", "sun"].includes(weekdayKey(n))) n = addDays(n, 1);
      return n;
    }
    case "weekly": {
      if (!arg) return addDays(due, 7);
      const want = DAY_KEYS.indexOf(arg.slice(0, 3));
      if (want < 0) return null;
      let n = addDays(due, 1);
      while (parseDate(n).getDay() !== want) n = addDays(n, 1);
      return n;
    }
    case "monthly":
      return addMonths(due, 1, arg ? Number(arg) : undefined);
    case "yearly":
      return addMonths(due, 12);
    default:
      return null;
  }
}
