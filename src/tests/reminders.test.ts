import { describe, expect, it } from "vitest";
import type { Task } from "../lib/tasks";


describe("a task that names its own time, and quiet hours", () => {
  const task = (at?: string): Task => ({
    id: "A.md:3", path: "A.md", line: 3, done: false, text: "Ship it", title: "Ship it", due: "2026-11-06", at, tags: [], links: [],
  });

  it("reads @at out of the line and leaves it out of the title", async () => {
    const { parseTaskLine } = await import("../lib/tasks");
    const t = parseTaskLine("A.md", 0, "- [ ] Ship it @due(2026-11-06) @at(18:30)")!;
    expect(t.at).toBe("18:30");
    expect(t.title).toBe("Ship it");
  });

  it("schedules at the task's own time instead of the default", async () => {
    const { planReminders, DEFAULT_REMIND } = await import("../lib/reminders");
    const now = new Date(2026, 10, 5, 8, 0).getTime();
    const plain = planReminders([task()], now, { ...DEFAULT_REMIND, time: "09:00" });
    const timed = planReminders([task("18:30")], now, { ...DEFAULT_REMIND, time: "09:00" });
    expect(new Date(plain[0].at).getHours()).toBe(9);
    expect(new Date(timed[0].at).getHours()).toBe(18);
    expect(new Date(timed[0].at).getMinutes()).toBe(30);
  });

  it("moves a reminder out of the quiet window to the morning, never drops it", async () => {
    const { planReminders, DEFAULT_REMIND, inQuietHours, afterQuietHours } = await import("../lib/reminders");
    const s = { ...DEFAULT_REMIND, quietFrom: "22:00", quietTo: "07:00" };
    expect(inQuietHours("23:30", s)).toBe(true);
    expect(inQuietHours("12:00", s)).toBe(false);
    expect(inQuietHours("03:00", s)).toBe(true);
    const late = new Date(2026, 10, 5, 23, 30).getTime();
    const moved = new Date(afterQuietHours(late, s));
    expect(moved.getDate()).toBe(6);
    expect(moved.getHours()).toBe(7);

    const plan = planReminders([task("23:30")], new Date(2026, 10, 5, 8, 0).getTime(), s);
    expect(plan).toHaveLength(1);
    expect(new Date(plan[0].at).getHours()).toBe(7);
  });
});
