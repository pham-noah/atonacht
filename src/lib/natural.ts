import { addDays, parseDate, fmt, today } from "./dates";

export interface Parsed {
  title: string; // the words that are left, i.e. the task itself
  due?: string; // YYYY-MM-DD, when the words named a day
  at?: string; // HH:MM (24h), when the words named a time
  day?: string; // the words that gave the day, for the hint under the box
  time?: string; // the words that gave the time
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const validDate = (y: number, m: number, d: number) => {
  const x = new Date(y, m - 1, d);
  return x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d;
};

/** The weekday after `from`, counting today as day 0: "fri" typed on a Friday means next Friday. */
function nextWeekday(from: string, want: number): string {
  let n = addDays(from, 1);
  for (let i = 0; i < 7; i++) {
    if (parseDate(n).getDay() === want) return n;
    n = addDays(n, 1);
  }
  return n;
}

const pad2 = (s: string) => s.padStart(2, "0");

function clock(h: number, m: number, pm: boolean | null): string | null {
  if (Number.isNaN(h) || Number.isNaN(m) || h > 23 || m > 59) return null;
  let hour = h;
  if (pm === true && h < 12) hour = h + 12;
  if (pm === false && h === 12) hour = 0;
  return `${pad2(String(hour))}:${pad2(String(m))}`;
}

/**
 * Reads the day and the time out of what someone typed, the way they would say it: "buy milk tomorrow 5pm",
 * "pay rent on the 31st", "call mum fri", "review in 3 days at 9:30".
 *
 * Only what is unambiguous is taken: a bare number ("buy 2 apples") stays in the title, and a word that is both a
 * weekday and an ordinary word is only read as a day when it is the whole word. `@due(…)` and `@at(…)` typed by hand
 * win over anything here — they are returned untouched.
 */
export function parseWhen(input: string, from: string = today()): Parsed {
  const explicitDue = /@due\(/.test(input);
  const explicitAt = /@at\(/.test(input);
  let rest = input;
  let due: string | undefined;
  let at: string | undefined;
  let dayWords = "";
  let timeWords = "";

  const eat = (m: RegExpExecArray) => {
    rest = rest.slice(0, m.index) + " " + rest.slice(m.index + m[0].length);
  };
  const take = (m: RegExpExecArray, d?: string) => {
    if (d && !due) {
      due = d;
      dayWords = m[0].trim();
    }
    eat(m);
  };

  // ---- the day --------------------------------------------------------------------------------------------
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(rest);
  if (iso && !explicitDue) {
    const d = `${iso[1]}-${iso[2]}-${iso[3]}`;
    if (validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))) take(iso, d);
  }

  if (!due && !explicitDue) {
    const m =
      /\b(?:on|by|due)?\s*(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.exec(rest) ||
      /\b(?:on|by|due)?\s*(?:the\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/i.exec(rest);
    if (m) {
      const a = Number(m[1]);
      const isFirstDay = /^\d/.test(m[1]);
      const day = isFirstDay ? a : Number(m[2]);
      const mon = MONTHS.indexOf(String(isFirstDay ? m[2] : m[1]).slice(0, 3).toLowerCase());
      const y = parseDate(from).getFullYear();
      if (mon >= 0 && day >= 1 && day <= 31) {
        // no year given: this year's month if it has not gone by, else next year's
        let cand = fmt(new Date(y, mon, day));
        if (!validDate(y, mon + 1, day)) cand = "";
        if (cand && cand < from) {
          const ny = y + 1;
          if (validDate(ny, mon + 1, day)) cand = fmt(new Date(ny, mon, day));
        }
        if (cand) take(m, cand);
      }
    }
  }

  if (!due && !explicitDue) {
    const m = /\b(?:on\s+|by\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(rest);
    if (m && !/^24\/7$/.test(m[0].trim())) {
      const day = Number(m[1]);
      const mon = Number(m[2]);
      const y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : parseDate(from).getFullYear();
      let cand = validDate(y, mon, day) ? fmt(new Date(y, mon - 1, day)) : "";
      if (cand && !m[3] && cand < from) {
        const ny = y + 1;
        if (validDate(ny, mon, day)) cand = fmt(new Date(ny, mon - 1, day));
      }
      if (cand) take(m, cand);
    }
  }

  const words: [RegExp, (m: RegExpExecArray) => string | null][] = [
    [/\bday after tomorrow\b/i, () => addDays(from, 2)],
    [/\ba week from (?:today|now)\b/i, () => addDays(from, 7)],
    [/\bnext week\b/i, () => addDays(from, 7)],
    [/\b(?:in|after)\s+(\d{1,2})\s+(day|days|week|weeks)\b/i, (m) => addDays(from, Number(m[1]) * (/week/i.test(m[2]) ? 7 : 1))],
    [/\b(tomorrow|tmrw|tmr)\b/i, () => addDays(from, 1)],
    [/\btonight\b/i, () => from],
    [/\btoday\b/i, () => from],
    [
      /\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sund|monda|tuesd|wedne|thurs|satur|sun|mon|tue|tues|wed|thu|thur|fri|sat)\b/i,
      (m) => {
        const w = m[2].toLowerCase();
        const want = DAYS.indexOf(w.slice(0, 3));
        return want >= 0 ? nextWeekday(from, want) : null;
      },
    ],
  ];
  for (const [re, make] of words) {
    if (due || explicitDue) break;
    const m = re.exec(rest);
    if (!m) continue;
    const d = make(m);
    if (d) take(m, d);
  }

  // ---- the time -------------------------------------------------------------------------------------------
  if (!explicitAt) {
    let m: RegExpExecArray | null = null;
    let t: string | null = null;
    if ((m = /\b(?:at\s+)?(\d{1,2}):(\d{2})\s*(am|pm)?\b/i.exec(rest))) {
      t = clock(Number(m[1]), Number(m[2]), m[3] ? /pm/i.test(m[3]) : null);
    } else if ((m = /\b(?:at\s+)?(\d{1,2})\s*(am|pm)\b/i.exec(rest))) {
      t = clock(Number(m[1]), 0, /pm/i.test(m[2]));
    } else if ((m = /\b(?:at\s+)?(\d{1,2})\s*o'?clock\b/i.exec(rest))) {
      t = clock(Number(m[1]), 0, null);
    }
    if (m && t) {
      at = t;
      timeWords = m[0].trim();
      eat(m);
    } else {
      const n = /\b(noon|midnight)\b/i.exec(rest);
      if (n) {
        at = /noon/i.test(n[1]) ? "12:00" : "00:00";
        timeWords = n[0];
        eat(n);
      } else if (/\btonight\b/i.test(input)) {
        at = "20:00";
        timeWords = "tonight";
      }
    }
  }

  // A time with no day means today: "buy milk 5pm" is for this evening, not for whenever.
  if (at && !due && !explicitDue) {
    due = from;
    dayWords = dayWords || "today";
  }

  const title = rest
    .replace(/\s+/g, " ")
    .replace(/^[\s,;–-]+|[\s,;–-]+$/g, "")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
  return { title, due, at, day: dayWords, time: timeWords };
}

/** "17:00" as a person would say it: "5:00 pm". */
export function atLabel(at: string): string {
  const [h, m] = at.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${pad2(String(m || 0))} ${h < 12 ? "am" : "pm"}`;
}

export const describeWhen = (p: Parsed, now: Date = new Date()): string => {
  if (!p.due) return "";
  const d = parseDate(p.due);
  // `now` is injectable so a test can say what "today" means; a fixed date in a test used to flip from
  // "tomorrow" to "today" at midnight, which is when this broke.
  const same = (x: Date) => x.toDateString() === now.toDateString();
  const day = same(d) ? "today"
    : same(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)) ? "tomorrow"
    : `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].replace(/^./, (c) => c.toUpperCase())}`;
  return p.at ? `${day} at ${atLabel(p.at)}` : day;
};
