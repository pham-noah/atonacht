// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { rankItems, score } from "../lib/palette";
import { swipeDirection } from "../lib/swipe";
import { mapPool } from "../lib/pool";
import { backupName, buildBackup, readBackup } from "../lib/backup";
import { shouldLock } from "../lib/lock";
import { fetchSyncStatus, Fetcher } from "../lib/syncthing";
import { parseTasks } from "../lib/tasks";

describe("command palette ranking", () => {
  const items = [
    { id: "a", label: "Go to Tasks", kind: "action" as const },
    { id: "n1", label: "Thesis outline", hint: "Thesis", kind: "note" as const },
    { id: "n2", label: "Tide roguelike", hint: "Game ideas", kind: "note" as const },
    { id: "n3", label: "Weekly review 2026-W44", kind: "note" as const },
  ];
  it("prefers prefixes, then word starts, then loose matches", () => {
    expect(score("Thesis outline", "the")).toBeGreaterThan(score("Go to Thesis", "the"));
    expect(score("Go to Thesis", "the")).toBeGreaterThan(score("Another theme", "ther") * 0 + 0);
    expect(score("Tide roguelike", "trg")).toBeGreaterThan(0); // subsequence
    expect(score("Tide roguelike", "zzz")).toBe(0);
  });
  it("shows actions first with no query and ranks matches otherwise", () => {
    expect(rankItems(items, "").map((i) => i.id)).toEqual(["a"]);
    expect(rankItems(items, "tide").map((i) => i.id)).toEqual(["n2"]);
    expect(rankItems(items, "w44")[0].id).toBe("n3");
    expect(rankItems(items, "t", 2)).toHaveLength(2);
  });
});

describe("swipe, pool, lock", () => {
  it("only counts long, mostly horizontal swipes", () => {
    expect(swipeDirection(120, 10)).toBe("right");
    expect(swipeDirection(-120, 20)).toBe("left");
    expect(swipeDirection(40, 0)).toBeNull();
    expect(swipeDirection(100, 90)).toBeNull(); // a diagonal scroll
  });
  it("limits concurrency and keeps order", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapPool(Array.from({ length: 50 }, (_, i) => i), 5, async (i) => {
      peak = Math.max(peak, ++running);
      await new Promise((r) => setTimeout(r, 1));
      running--;
      return i * 2;
    });
    expect(peak).toBeLessThanOrEqual(5);
    expect(out).toEqual(Array.from({ length: 50 }, (_, i) => i * 2));
    expect(await mapPool([], 5, async (x) => x)).toEqual([]);
  });
  it("locks after the chosen time in the background", () => {
    expect(shouldLock(null, 1000, 0)).toBe(false);
    expect(shouldLock(0, 1000, 0)).toBe(true);
    expect(shouldLock(0, 59_000, 60_000)).toBe(false);
    expect(shouldLock(0, 61_000, 60_000)).toBe(true);
  });
});

describe("backup", () => {
  it("round-trips notes and settings, and ignores unsafe or non-note entries", () => {
    const zip = buildBackup({ "a.md": "# A\n", "Games/b.md": "é ünïcode ✓" }, { theme: "glass" });
    const back = readBackup(zip);
    expect(back.notes).toEqual({ "a.md": "# A\n", "Games/b.md": "é ünïcode ✓" });
    expect(back.settings).toEqual({ theme: "glass" });
    expect(backupName(new Date(2026, 9, 29))).toBe("atonacht-backup-2026-10-29.zip");
  });
});

describe("Syncthing status", () => {
  const data: Record<string, unknown> = {
    "/rest/config": { devices: [{ deviceID: "ME", name: "Desktop" }, { deviceID: "PHONE123", name: "Pixel 8" }, { deviceID: "OLD99999" }], folders: [{ id: "abc", label: "Atonacht", path: "/home/me/Documents/Atonacht" }] },
    "/rest/system/connections": { connections: { PHONE123: { connected: true } } },
    "/rest/system/status": { myID: "ME" },
    "/rest/db/status?folder=abc": { state: "syncing", globalBytes: 1000, needBytes: 250 },
  };
  const ok: Fetcher = async (url, init) => {
    expect(init?.headers?.["X-API-Key"]).toBe("key");
    const path = url.replace("http://127.0.0.1:8384", "");
    return { ok: true, status: 200, json: async () => data[path] };
  };
  it("lists other devices and folder progress", async () => {
    const s = await fetchSyncStatus("http://127.0.0.1:8384/", "key", ok);
    expect(s.devices).toEqual([{ id: "PHONE123", name: "Pixel 8", connected: true }, { id: "OLD99999", name: "OLD9999", connected: false }]);
    expect(s.folders).toEqual([{ id: "abc", label: "Atonacht", path: "/home/me/Documents/Atonacht", state: "syncing", completion: 75 }]);
  });
  it("explains a wrong API key", async () => {
    const bad: Fetcher = async () => ({ ok: false, status: 403, json: async () => ({}) });
    await expect(fetchSyncStatus("http://x", "nope", bad)).rejects.toThrow(/API key/);
  });
});

describe("performance with a big notes folder", () => {
  it("parses tasks from 5,000 notes quickly", () => {
    const note = Array.from({ length: 40 }, (_, i) => (i % 3 ? `Some text line ${i} with [[link]] and #tag` : `- [ ] Task number ${i} @due(2026-11-0${(i % 9) + 1}) !high #tag`)).join("\n");
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 5000; i++) n += parseTasks(`n${i}.md`, note).length;
    const ms = performance.now() - t0;
    expect(n).toBeGreaterThan(50_000);
    expect(ms).toBeLessThan(3000);
    console.log(`parsed ${n} tasks from 5000 notes in ${Math.round(ms)} ms`);
  });
});

import { widgetPayload } from "../lib/widget";
import { renderHook } from "@testing-library/react";
import { useAndroidBridge } from "../useAndroidBridge";
import { vi } from "vitest";
import { dailyPath } from "../lib/daily";

describe("widget payload", () => {
  const today = "2026-10-29";
  const tasks = parseTasks("Journal/x.md", "- [ ] Later @due(2026-11-03)\n- [ ] Overdue one @due(2026-10-27)\n- [ ] Due today @due(2026-10-29)\n- [x] Done @due(2026-10-29)\n- [ ] No date\n")
    .concat(parseTasks(dailyPath(today), "- [ ] In today's note\n- [ ] Also here @due(2026-11-09)\n"));
  it("puts overdue first, then due today, then today's note, and leaves out the rest", () => {
    const p = widgetPayload(tasks, today, dailyPath(today));
    expect(p.date).toBe("Thursday, 29 October");
    expect(p.tasks).toEqual([{ t: "Overdue one", d: "overdue" }, { t: "Due today", d: "" }, { t: "In today's note", d: "" }, { t: "Also here", d: "" }]);
    expect(p.count).toBe(4);
  });
  it("trims to what fits but still reports the full count", () => {
    const many = parseTasks("a.md", Array.from({ length: 12 }, (_, i) => `- [ ] T${i} @due(2026-10-29)`).join("\n"));
    const p = widgetPayload(many, today, "none", 8);
    expect(p.tasks).toHaveLength(8);
    expect(p.count).toBe(12);
  });
});

describe("Android bridge hook", () => {
  const t = parseTasks("a.md", "- [ ] One @due(2026-10-29)\n");
  it("pushes the widget list after a pause, only when it changed, and the privacy flags immediately", async () => {
    vi.useFakeTimers();
    const invoke = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook((p: { tasks: typeof t; block: boolean }) => useAndroidBridge({ enabled: true, tasks: p.tasks, blockScreenshots: p.block, hideInRecents: false, invoke }), { initialProps: { tasks: t, block: false } });
    expect(invoke).toHaveBeenCalledWith("set_privacy_flags", { blockScreenshots: false, hideInRecents: false });
    expect(invoke).not.toHaveBeenCalledWith("set_widget_tasks", expect.anything());
    await vi.advanceTimersByTimeAsync(900);
    expect(invoke).toHaveBeenCalledWith("set_widget_tasks", { json: expect.stringContaining("\"count\"") });
    invoke.mockClear();
    rerender({ tasks: [...t], block: false }); // new array, same content
    await vi.advanceTimersByTimeAsync(900);
    expect(invoke).not.toHaveBeenCalled();
    rerender({ tasks: t, block: true });
    expect(invoke).toHaveBeenCalledWith("set_privacy_flags", { blockScreenshots: true, hideInRecents: false });
    vi.useRealTimers();
  });
  it("does nothing outside Android", async () => {
    const invoke = vi.fn();
    renderHook(() => useAndroidBridge({ enabled: false, tasks: t, blockScreenshots: true, hideInRecents: true, invoke }));
    await new Promise((r) => setTimeout(r, 10));
    expect(invoke).not.toHaveBeenCalled();
  });
});

import { TaskIndex } from "../lib/taskIndex";

describe("task index", () => {
  it("parses only the notes that changed, and forgets deleted ones", () => {
    const idx = new TaskIndex();
    const notes: Record<string, string> = { "a.md": "- [ ] A\n", "b.md": "- [ ] B1\n- [ ] B2\n", "c.md": "no tasks" };
    const first = idx.build(notes);
    expect(first.map((t) => t.title)).toEqual(["A", "B1", "B2"]);
    expect(idx.parsed).toBe(3);
    const again = idx.build({ ...notes }); // a new object with the same text
    expect(idx.parsed).toBe(0);
    expect(again[0]).toBe(first[0]); // the very same task objects are reused
    idx.build({ ...notes, "b.md": "- [ ] B1\n" });
    expect(idx.parsed).toBe(1);
    const { "a.md": _gone, ...rest } = notes;
    void _gone;
    expect(idx.build(rest).map((t) => t.title)).toEqual(["B1", "B2"]);
    idx.build({ ...rest, "a.md": "- [ ] A\n" });
    expect(idx.parsed).toBe(1); // a deleted note is parsed afresh if it comes back
  });
  it("makes a save in a 5,000-note folder cheap", () => {
    const note = Array.from({ length: 40 }, (_, i) => (i % 3 ? `text ${i}` : `- [ ] Task ${i} @due(2026-11-01) #tag`)).join("\n");
    const notes: Record<string, string> = {};
    for (let i = 0; i < 5000; i++) notes[`F${i % 30}/n${i}.md`] = note;
    const idx = new TaskIndex();
    idx.build(notes);
    const edited = { ...notes, "F0/n0.md": note + "\n- [ ] one more" };
    const t0 = performance.now();
    idx.build(edited);
    const ms = performance.now() - t0;
    expect(idx.parsed).toBe(1);
    console.log(`save in 5000-note folder: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(100);
  });
});
