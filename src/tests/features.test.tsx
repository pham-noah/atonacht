// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { buildBackup, readBackup } from "../lib/backup";
import { useAppLock } from "../useAppLock";

const prefs = () => JSON.parse(localStorage.getItem("atonacht.prefs")!);
const files = () => JSON.parse(localStorage.getItem("atonacht.demo")!).files as Record<string, { content: string }>;

const clearDemo = () => localStorage.removeItem("atonacht.demo");
async function boot(extra: Record<string, unknown> = {}) {
  vi.resetModules();
  localStorage.removeItem("atonacht.prefs");
  localStorage.setItem("atonacht.prefs", JSON.stringify({ onboarded: true, root: "demo", theme: "solid", carryDismissed: "", ...extra }));
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  const { default: App } = await import("../App");
  render(<App />);
  await screen.findByText("Today’s note");
}
const openSettings = async (section: RegExp) => {
  fireEvent.click(screen.getAllByRole("button", { name: "Settings" })[0]);
  const list = await waitFor(() => {
    const el = document.querySelector(".setlist") as HTMLElement | null;
    if (!el) throw new Error("settings not loaded yet"); // the Settings screen loads on demand
    return el;
  });
  fireEvent.click(await within(list).findByRole("button", { name: section }));
};
afterEach(cleanup);
beforeEach(() => { vi.restoreAllMocks(); clearDemo(); });

describe("command palette", () => {
  it("opens with Ctrl+K, finds a note by typing and opens it", async () => {
    await boot();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const box = await screen.findByLabelText("Command palette search");
    fireEvent.change(box, { target: { value: "tide" } });
    expect(await screen.findByRole("option", { name: /Tide roguelike/ })).toBeTruthy();
    fireEvent.keyDown(box, { key: "Enter" });
    // a note opens to be read, so the source is one tap away
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toContain("Tide roguelike"));
    // actions work too
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    fireEvent.change(await screen.findByLabelText("Command palette search"), { target: { value: "trash" } });
    fireEvent.keyDown(screen.getByLabelText("Command palette search"), { key: "Enter" });
    await screen.findByText("The trash is empty.");
  });
});

describe("swipe actions", () => {
  it("swipe right completes a task, swipe left moves it to tomorrow", async () => {
    await boot();
    fireEvent.click(screen.getAllByRole("button", { name: /^All tasks/ })[0]);
    const row = async (name: string) => (await screen.findByText(name, { selector: "button.link" })).closest(".row") as HTMLElement;
    const swipe = (el: HTMLElement, dx: number) => {
      fireEvent.pointerDown(el, { clientX: 100, clientY: 100, pointerType: "touch" });
      fireEvent.pointerUp(el, { clientX: 100 + dx, clientY: 104, pointerType: "touch" });
    };
    swipe(await row("Renew bus pass"), 160);
    await waitFor(() => expect(Object.values(files()).some((f) => /- \[x\] Renew bus pass/.test(f.content))).toBe(true));
    swipe(await row("Buy oat milk"), -160);
    const tomorrow = new Date(Date.now() + 864e5).toLocaleDateString("sv");
    await waitFor(() => expect(Object.values(files()).some((f) => f.content.includes(`Buy oat milk @due(${tomorrow})`))).toBe(true));
    // a short drag or a vertical scroll does nothing
    swipe(await row("Email supervisor"), 20);
    expect(Object.values(files()).some((f) => /- \[x\] Email supervisor/.test(f.content))).toBe(false);
  });
});

describe("settings: tab order, backup, privacy, Syncthing", () => {
  it("hides and reorders the bottom tabs", async () => {
    await boot();
    await openSettings(/^Interface/);
    fireEvent.click(await screen.findByLabelText("Show Calendar"));
    expect(prefs().tabs).toEqual(["home", "tasks", "board", "notes"]);
    fireEvent.click(screen.getByLabelText("Move Notes up"));
    expect(prefs().tabs).toEqual(["home", "tasks", "notes", "board"]);
    expect((screen.getByLabelText("Show Home") as HTMLInputElement).disabled).toBe(true);
  });

  it("exports a ZIP of every note and restores new notes without overwriting", async () => {
    await boot();
    let blob: Blob | undefined;
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b) => ((blob = b), "blob:test");
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await openSettings(/^Files & backup/);
    fireEvent.click(await screen.findByRole("button", { name: "Export…" }));
    await screen.findByText(/Saved a backup of/);
    const back = readBackup(new Uint8Array(await blob!.arrayBuffer()));
    expect(back.notes["Game ideas/Tide roguelike.md"]).toContain("Every wave flips");
    expect(JSON.stringify(back.settings)).not.toContain("demo"); // the folder handle is never exported

    const zip = buildBackup({ "New/restored.md": "# Restored\n", "Game ideas/Tide roguelike.md": "SHOULD NOT OVERWRITE" }, { theme: "light", root: "x" });
    fireEvent.click(screen.getByLabelText("Restore settings too"));
    const input = screen.getByLabelText("Backup file") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([zip as BlobPart], "b.zip", { type: "application/zip" })] } });
    await screen.findByText(/Restored 1 note\. 1 already existed/);
    expect(files()["New/restored.md"].content).toBe("# Restored\n");
    expect(files()["Game ideas/Tide roguelike.md"].content).not.toContain("SHOULD NOT");
    await waitFor(() => expect(prefs().theme).toBe("light"));
    expect(prefs().root).toBe("demo"); // restoring never changes which folder you use
  });

  it("explains that app lock is a phone feature", async () => {
    await boot();
    await openSettings(/^Privacy & lock/);
    expect(await screen.findByText("Available in the phone app")).toBeTruthy();
  });

  it("shows Syncthing devices and folder progress", async () => {
    await boot({ syncthingKey: "k" });
    const data: Record<string, unknown> = {
      "/rest/config": { devices: [{ deviceID: "ME", name: "Desktop" }, { deviceID: "P1", name: "Pixel 8" }], folders: [{ id: "f", label: "Atonacht", path: "/n" }] },
      "/rest/system/connections": { connections: { P1: { connected: true } } },
      "/rest/system/status": { myID: "ME" },
      "/rest/db/status?folder=f": { state: "idle", globalBytes: 10, needBytes: 0 },
    };
    vi.spyOn(window, "fetch").mockImplementation((async (url: string) => ({ ok: true, status: 200, json: async () => data[String(url).replace("http://127.0.0.1:8384", "")] })) as never);
    await openSettings(/^Sync(\s*)Notes folder/);
    fireEvent.click(await screen.findByRole("button", { name: "Test connection" }));
    await screen.findByText("Pixel 8");
    expect(screen.getByText("Connected")).toBeTruthy();
    expect(screen.getByText("Up to date")).toBeTruthy();
  });
});

describe("app lock", () => {
  it("locks at start, unlocks with authentication, relocks after time in the background", async () => {
    const authenticate = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAppLock({ enabled: true, lockAfterMs: 0, authenticate }));
    expect(result.current.locked).toBe(true);
    await act(async () => result.current.unlock());
    expect(result.current.locked).toBe(false);
    const vis = (s: "hidden" | "visible") => {
      Object.defineProperty(document, "visibilityState", { value: s, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    act(() => vis("hidden"));
    act(() => vis("visible"));
    expect(result.current.locked).toBe(true);
    authenticate.mockRejectedValueOnce(new Error("Not recognised"));
    await act(async () => result.current.unlock());
    expect(result.current.locked).toBe(true);
    expect(result.current.error).toBe("Not recognised");
  });
  it("never locks when switched off", () => {
    const { result } = renderHook(() => useAppLock({ enabled: false, lockAfterMs: 0, authenticate: vi.fn() }));
    expect(result.current.locked).toBe(false);
  });
});

describe("trash empties itself", () => {
  it("deletes old notes, keeps recent ones and starts the clock on unstamped ones", async () => {
    const now = Math.floor(Date.now() / 1000);
    vi.resetModules();
    localStorage.clear();
    const f = (content: string) => ({ content, mtime: Date.now() });
    localStorage.setItem("atonacht.demo", JSON.stringify({ dirs: ["Daily notes"], files: {
      [`.trash/Old (trashed ${now - 40 * 86400}).md`]: f("old"),
      [`.trash/Recent (trashed ${now - 3 * 86400}).md`]: f("recent"),
      ".trash/Legacy.md": f("legacy"),
    } }));
    await boot();
    await waitFor(() => expect(Object.keys(files()).filter((p) => p.startsWith(".trash/Old")).length).toBe(0));
    expect(Object.keys(files()).some((p) => p.startsWith(".trash/Recent"))).toBe(true);
    await waitFor(() => expect(Object.keys(files()).some((p) => /^\.trash\/Legacy \(trashed \d+\)\.md$/.test(p))).toBe(true)); // clock started
    expect(files()[".trash/Legacy.md"]).toBeUndefined();
  });
});

describe("saving", () => {
  it("does not rewrite a note whose text did not change, and does not check for changes mid-save", async () => {
    await boot();
    const { fs } = await import("../lib/backend");
    const write = vi.spyOn(fs, "write");
    const list = vi.spyOn(fs, "list");
    fireEvent.change(screen.getByPlaceholderText("Add a task to today"), { target: { value: "Same text" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    // a slow save: refresh requests are ignored until it finishes
    let release!: () => void;
    const orig = write.getMockImplementation() ?? ((...a: Parameters<typeof fs.write>) => Object.getPrototypeOf(fs).write?.call(fs, ...a));
    void orig;
    write.mockImplementationOnce(() => new Promise<number>((res) => (release = () => res(Date.now()))));
    fireEvent.change(screen.getByPlaceholderText("Add a task to today"), { target: { value: "Slow one" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);
    await waitFor(() => expect(write).toHaveBeenCalledTimes(2));
    list.mockClear();
    window.dispatchEvent(new Event("focus"));
    await new Promise((r) => setTimeout(r, 20));
    expect(list).not.toHaveBeenCalled();
    release();
    await waitFor(() => expect(screen.getByText("Slow one")).toBeTruthy());
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(list).toHaveBeenCalled());
  });
});

describe("privacy options on Android", () => {
  it("shows the screen options only in the Android app and saves them", async () => {
    vi.resetModules();
    localStorage.setItem("atonacht.prefs", JSON.stringify({ onboarded: true, root: "demo" }));
    const { PrefsProvider } = await import("../prefs");
    const { PrivacyPanel } = await import("../ui/SettingsPanels");
    const { rerender } = render(<PrefsProvider><PrivacyPanel available android={false} /></PrefsProvider>);
    expect(screen.queryByLabelText(/Hide content in recent apps/)).toBeNull();
    rerender(<PrefsProvider><PrivacyPanel available android /></PrefsProvider>);
    fireEvent.click(await screen.findByLabelText(/Hide content in recent apps/));
    fireEvent.click(screen.getByLabelText(/Block screenshots/));
    expect(prefs()).toMatchObject({ hideInRecents: true, blockScreenshots: true });
  });
});

describe("redraws", () => {
  it("saving one note does not redraw the task rows of the other notes", async () => {
    await boot();
    const { perf } = await import("../ui/common");
    fireEvent.click(screen.getAllByRole("button", { name: /^All tasks/ })[0]);
    await screen.findByText("Renew bus pass", { selector: "button.link" });
    const rows = document.querySelectorAll(".row").length;
    expect(rows).toBeGreaterThanOrEqual(6);
    perf.taskRowRenders = 0;
    fireEvent.change(screen.getByPlaceholderText("Add a task to today’s note"), { target: { value: "Brand new task" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);
    await screen.findByText("Brand new task", { selector: "button.link" });
    // only the new row (and at most the rows of today's own note) are drawn again, not the other six or more
    expect(perf.taskRowRenders).toBeGreaterThanOrEqual(1);
    expect(perf.taskRowRenders).toBeLessThanOrEqual(3);
  });
});

// ---- boards: dragging cards ------------------------------------------------------------------------------------
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, left: x, top: y, right: x + w, bottom: y + h, width: w, height: h, toJSON() {} }) as DOMRect;
const COLW = 300;
/** jsdom has no layout, so give columns and cards positions: columns side by side, cards stacked 100px apart. */
function layout() {
  const cols = [...document.querySelectorAll<HTMLElement>("[data-col-drop]")];
  cols.forEach((c, ci) => {
    c.getBoundingClientRect = () => rect(ci * COLW, 0, COLW, 3000);
    [...c.querySelectorAll<HTMLElement>("[data-card]")].forEach((k, i) => (k.getBoundingClientRect = () => rect(ci * COLW + 10, 100 + i * 100, COLW - 20, 80)));
  });
  (document as unknown as { elementFromPoint: (x: number) => Element | null }).elementFromPoint = (x) => cols[Math.floor(x / COLW)] ?? null;
}
const above = (i: number) => 110 + i * 100; // just above the middle of card i: drops before it
const below = (i: number) => 160 + i * 100; // below its middle: drops after it
const ptr = (type: string) => ({ pointerId: 1, pointerType: type, button: 0 });
function mouseDrag(card: HTMLElement, fromCol: number, toCol: number, y: number) {
  layout();
  fireEvent.pointerDown(card, { ...ptr("mouse"), clientX: fromCol * COLW + 50, clientY: 120 });
  fireEvent.pointerMove(window, { ...ptr("mouse"), clientX: toCol * COLW + 50, clientY: y });
  layout();
  fireEvent.pointerUp(window, { ...ptr("mouse"), clientX: toCol * COLW + 50, clientY: y });
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("kanban board: drag and drop", () => {
  const col = (name: string) => screen.getByRole("listitem", { name });
  const cardEl = (name: string, title: string) => within(col(name)).getByText(title, { selector: "button.ktitle" }).closest("article") as HTMLElement;
  const inCol = (name: string, title: string) => within(col(name)).queryByText(title, { selector: "button.ktitle" });
  const openBoard = async () => {
    fireEvent.click(within(document.querySelector(".side") as HTMLElement).getByRole("button", { name: /^Board/ }));
    await screen.findByRole("heading", { name: "Board" });
    await waitFor(() => expect(inCol("To do", "Renew bus pass")).toBeTruthy());
  };

  it("has no menus on the cards", async () => {
    await boot();
    await openBoard();
    expect(screen.queryByLabelText(/^Move “/)).toBeNull();
    expect(document.querySelectorAll(".kcard select, .kcard .kbtn")).toHaveLength(0);
  });

  it("moves a card to another column with the mouse and writes @status into the note", async () => {
    await boot();
    await openBoard();
    mouseDrag(cardEl("To do", "Renew bus pass"), 0, 1, above(0));
    await waitFor(() => expect(inCol("Doing", "Renew bus pass")).toBeTruthy());
    expect(inCol("To do", "Renew bus pass")).toBeNull();
    expect(Object.values(files()).some((f) => /- \[ \] Renew bus pass @due\(\S+\) @repeat\(monthly\) @status\(doing\)/.test(f.content))).toBe(true);
    expect(document.querySelector(".kghost")).toBeNull(); // the floating copy is gone

    // finishing a repeating task: it lands in Done and the next round starts again in To do
    mouseDrag(cardEl("Doing", "Renew bus pass"), 1, 2, above(0));
    await waitFor(() => expect(inCol("Done", "Renew bus pass")).toBeTruthy());
    expect(inCol("To do", "Renew bus pass")).toBeTruthy();
    expect(Object.values(files()).some((f) => /- \[x\] Renew bus pass .*@done\(\d{4}-\d{2}-\d{2}\)/.test(f.content))).toBe(true);
  });

  it("a short press or a click is not a drag", async () => {
    await boot();
    await openBoard();
    const card = cardEl("To do", "Renew bus pass");
    layout();
    fireEvent.pointerDown(card, { ...ptr("mouse"), clientX: 50, clientY: 120 });
    fireEvent.pointerMove(window, { ...ptr("mouse"), clientX: 52, clientY: 121 }); // 2px: just a click
    fireEvent.pointerUp(window, { ...ptr("mouse"), clientX: 52, clientY: 121 });
    expect(document.querySelector(".kghost")).toBeNull();
    expect(inCol("To do", "Renew bus pass")).toBeTruthy();
  });

  it("works on a touchscreen: press and hold to pick up, but moving at once scrolls", async () => {
    await boot();
    await openBoard();
    const card = cardEl("To do", "Renew bus pass");
    layout();
    // moving before the hold finishes = scrolling
    fireEvent.pointerDown(card, { ...ptr("touch"), clientX: 50, clientY: 120 });
    fireEvent.pointerMove(window, { ...ptr("touch"), clientX: 350, clientY: 140 });
    await sleep(320);
    fireEvent.pointerUp(window, { ...ptr("touch"), clientX: 350, clientY: 140 });
    expect(inCol("To do", "Renew bus pass")).toBeTruthy();
    // press and hold, then move
    fireEvent.pointerDown(card, { ...ptr("touch"), clientX: 50, clientY: 120 });
    await sleep(320);
    await waitFor(() => expect(document.querySelector(".kghost")).toBeTruthy()); // lifted
    fireEvent.pointerMove(window, { ...ptr("touch"), clientX: 350, clientY: above(0) });
    layout();
    fireEvent.pointerUp(window, { ...ptr("touch"), clientX: 350, clientY: above(0) });
    await waitFor(() => expect(inCol("Doing", "Renew bus pass")).toBeTruthy());
  });

  it("works from the keyboard: Space picks up, arrows choose, Space drops", async () => {
    await boot();
    await openBoard();
    const card = cardEl("To do", "Renew bus pass");
    card.focus();
    fireEvent.keyDown(card, { key: " " });
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Picked up Renew bus pass/));
    fireEvent.keyDown(card, { key: "ArrowRight" });
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Doing/));
    fireEvent.keyDown(card, { key: " " });
    await waitFor(() => expect(inCol("Doing", "Renew bus pass")).toBeTruthy());
    expect(screen.getByRole("status").textContent).toMatch(/Dropped in Doing/);
    // Escape puts it down again without moving it
    const again = cardEl("Doing", "Renew bus pass");
    fireEvent.keyDown(again, { key: " " });
    fireEvent.keyDown(again, { key: "ArrowRight" });
    fireEvent.keyDown(again, { key: "Escape" });
    expect(inCol("Doing", "Renew bus pass")).toBeTruthy();
  });

  it("columns come from Settings, and the task dialog can still set the column", async () => {
    await boot();
    await openSettings(/^Tasks/);
    const box = await screen.findByLabelText("Board columns");
    fireEvent.change(box, { target: { value: "Doing, In review" } });
    fireEvent.blur(box);
    expect(prefs().kanbanColumns).toEqual(["Doing", "In review"]);
    fireEvent.click(screen.getAllByRole("button", { name: /^Board/ })[0]);
    await screen.findByRole("listitem", { name: "In review" });
    fireEvent.click(await screen.findByText("Draft methods section #thesis", { selector: "button.ktitle" }));
    fireEvent.change(await screen.findByLabelText("Board column"), { target: { value: "in-review" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(inCol("In review", "Draft methods section #thesis")).toBeTruthy());
  });

  it("sorts the all-tasks board by your choice", async () => {
    await boot();
    await openBoard();
    const titles = () => within(col("To do")).queryAllByRole("button").filter((b) => b.classList.contains("ktitle")).map((b) => b.textContent!);
    const first = titles();
    fireEvent.change(screen.getByLabelText("Sort cards by"), { target: { value: "title" } });
    await waitFor(() => expect(titles()).toEqual([...first].sort((a, b) => a.localeCompare(b))));
    expect(prefs().boardSort).toBe("title");
  });
});

describe("project boards: drag and drop", () => {
  const side = () => within(document.querySelector(".side") as HTMLElement);
  const col = (name: string) => screen.getByRole("listitem", { name });
  const titles = (name: string) => within(col(name)).queryAllByRole("button").filter((b) => b.classList.contains("ktitle")).map((b) => b.textContent);
  const cardEl = (name: string, title: string) => within(col(name)).getByText(title, { selector: "button.ktitle" }).closest("article") as HTMLElement;
  const board = () => files()["Boards/Thesis plan.md"]?.content ?? "";

  async function makeBoard() {
    await boot();
    fireEvent.click(side().getByRole("button", { name: /^Board/ }));
    fireEvent.click(await screen.findByRole("button", { name: "+ New board" }));
    fireEvent.change(await screen.findByLabelText("Board name"), { target: { value: "Thesis plan" } });
    fireEvent.click(screen.getByRole("button", { name: "Create board" }));
    await screen.findByRole("heading", { name: "Thesis plan" });
  }
  const addCardTo = async (column: string, text: string) => {
    fireEvent.click(within(col(column)).getByRole("button", { name: "+ Add a card" }));
    fireEvent.change(await screen.findByLabelText(`New card in ${column}`), { target: { value: text } });
    fireEvent.click(within(col(column)).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(titles(column)).toContain(text));
  };

  it("creates a board in the Obsidian Kanban format and adds cards", async () => {
    await makeBoard();
    expect(board()).toContain("kanban-plugin: basic");
    expect(board()).toContain("%% kanban:settings");
    await addCardTo("To do", "Write intro");
    await addCardTo("To do", "Collect data");
    expect(board()).toMatch(/## To do\n\n- \[ \] Write intro\n- \[ \] Collect data\n/);
    expect(screen.queryByLabelText(/^Move “/)).toBeNull(); // no menus here either
  });

  it("reorders cards by dragging within a column, and moves them between columns at an exact place", async () => {
    await makeBoard();
    await addCardTo("To do", "First");
    await addCardTo("To do", "Second");
    await addCardTo("To do", "Third");
    mouseDrag(cardEl("To do", "First"), 0, 0, below(2)); // below the last card
    await waitFor(() => expect(titles("To do")).toEqual(["Second", "Third", "First"]));
    expect(board().indexOf("Second")).toBeLessThan(board().indexOf("Third"));
    expect(board().indexOf("Third")).toBeLessThan(board().indexOf("First"));
    mouseDrag(cardEl("To do", "First"), 0, 0, above(0)); // to the top
    await waitFor(() => expect(titles("To do")).toEqual(["First", "Second", "Third"]));
    await addCardTo("Doing", "Busy");
    mouseDrag(cardEl("To do", "Third"), 0, 1, above(0)); // into Doing, above "Busy"
    await waitFor(() => expect(titles("Doing")).toEqual(["Third", "Busy"]));
    expect(titles("To do")).toEqual(["First", "Second"]);
    expect(board()).toMatch(/## Doing\n\n- \[ \] Third\n- \[ \] Busy\n/);
  });

  it("drops show a line where the card will land, and reordering also works from the keyboard", async () => {
    await makeBoard();
    await addCardTo("To do", "First");
    await addCardTo("To do", "Second");
    await addCardTo("To do", "Third");
    layout();
    fireEvent.pointerDown(cardEl("To do", "First"), { ...ptr("mouse"), clientX: 50, clientY: 120 });
    fireEvent.pointerMove(window, { ...ptr("mouse"), clientX: 50, clientY: below(1) });
    await waitFor(() => expect(document.querySelector(".kdrop")).toBeTruthy());
    expect(document.querySelector(".kghost")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" }); // cancelled: nothing changes
    await waitFor(() => expect(document.querySelector(".kghost")).toBeNull());
    expect(titles("To do")).toEqual(["First", "Second", "Third"]);

    const second = cardEl("To do", "Second");
    second.focus();
    fireEvent.keyDown(second, { key: " " });
    fireEvent.keyDown(second, { key: "ArrowDown" });
    fireEvent.keyDown(second, { key: " " });
    await waitFor(() => expect(titles("To do")).toEqual(["First", "Third", "Second"]));
    const third = cardEl("To do", "Third");
    fireEvent.keyDown(third, { key: " " });
    fireEvent.keyDown(third, { key: "ArrowUp" });
    fireEvent.keyDown(third, { key: " " });
    await waitFor(() => expect(titles("To do")).toEqual(["Third", "First", "Second"]));
  });

  it("dropping a card in Done checks it, and out of Done unchecks it; project cards are tasks everywhere else", async () => {
    await makeBoard();
    await addCardTo("To do", "Collect data");
    mouseDrag(cardEl("To do", "Collect data"), 0, 2, above(0));
    await waitFor(() => expect(titles("Done")).toEqual(["Collect data"]));
    expect(board()).toMatch(/- \[x\] Collect data @done\(\d{4}-\d{2}-\d{2}\)/);
    mouseDrag(cardEl("Done", "Collect data"), 2, 1, above(0));
    await waitFor(() => expect(titles("Doing")).toEqual(["Collect data"]));
    expect(board()).toContain("- [ ] Collect data\n");
    expect(board()).not.toContain("@done");
    fireEvent.click(screen.getByRole("tab", { name: "All tasks" }));
    await screen.findByRole("listitem", { name: "To do" });
    expect(within(col("To do")).queryByText("Collect data", { selector: "button.ktitle" })).toBeNull();
    fireEvent.click(side().getByRole("button", { name: /^All tasks/ }));
    expect(await screen.findByText("Collect data", { selector: "button.link" })).toBeTruthy();
  });

  it("edits and deletes cards, adds columns, and opens as a plain note", async () => {
    await makeBoard();
    await addCardTo("To do", "Old title");
    fireEvent.click(within(col("To do")).getByText("Old title", { selector: "button.ktitle" }));
    fireEvent.change(await screen.findByLabelText("Card text"), { target: { value: "New title !high" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(board()).toContain("- [ ] New title !high"));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(within(col("To do")).getByText("New title", { selector: "button.ktitle" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete card" }));
    await waitFor(() => expect(board()).not.toContain("New title"));
    fireEvent.change(screen.getByLabelText("New column name"), { target: { value: "Blocked" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Add column" }));
    await screen.findByRole("listitem", { name: "Blocked" });
    expect(board()).toContain("## Blocked");
    fireEvent.click(screen.getByRole("button", { name: "Open as a note" }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toContain("kanban-plugin"));
  });
});
