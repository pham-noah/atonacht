// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

/** A vault with one task per note, and #work in two of the four notes. */
async function boot() {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem("atonacht.prefs", JSON.stringify({ onboarded: true, root: "demo", theme: "solid", startupCache: false }));
  localStorage.setItem("atonacht.demo", JSON.stringify({ dirs: ["Work", "Home"], files: {
    "Work/A.md": { content: "# A\n\n- [ ] Alpha\n- [ ] Beta\n", mtime: Date.now() },
    "Work/B.md": { content: "# B\n\n- [ ] Gamma #work\n", mtime: Date.now() },
    "Work/C.md": { content: "# C\n\n- [ ] Delta #work\n", mtime: Date.now() },
    "Home/D.md": { content: "# D\n\n- [ ] Epsilon\n", mtime: Date.now() },
    "Home/Empty.md": { content: "# Empty sections\n\n## Plan\n\n## Notes\n\n- [ ] Milk\n", mtime: Date.now() },
  } }));
  // a phone: the board and the drawer are the narrow layout
  window.matchMedia = ((q: string) => ({ matches: !q.includes("min-width: 900px"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  const { default: App } = await import("../App");
  render(<App />);
  await screen.findByText("Today’s note");
}

const columns = () => [...document.querySelectorAll(".kcol")] as HTMLElement[];
const visible = () => columns().filter((c) => !c.className.includes("hidden"));

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("the board on a phone", () => {
  it("shows one column at a time, and the pills say which", async () => {
    await boot();
    const tabsEl = document.querySelector(".tabs")! as HTMLElement;
    fireEvent.click(within(tabsEl).getByRole("button", { name: "Board" }));
    await screen.findByText("Alpha");

    const seg = document.querySelector(".colseg")! as HTMLElement;
    const tabs = within(seg).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent?.replace(/\s+/g, " ").trim())).toEqual(["To do 6", "Doing 0", "Done 0"]);

    // stacked, only one on screen — six cards were four sideways swipes inside a column before this
    expect(columns()).toHaveLength(3);
    expect(visible()).toHaveLength(1);
    expect(visible()[0].getAttribute("aria-label")).toBe("To do");

    fireEvent.click(within(seg).getByRole("tab", { name: /^Done/ }));
    expect(visible()).toHaveLength(1);
    expect(visible()[0].getAttribute("aria-label")).toBe("Done");
    // jsdom does not apply CSS, so the check is the class the stylesheet keys off
    expect(columns().find((c) => c.getAttribute("aria-label") === "To do")!.className).toContain("hidden");
  });
});

describe("the reading view", () => {
  it("drops a heading with nothing under it, so a fresh daily note is not three bold words", async () => {
    await boot();
    const tabsEl = document.querySelector(".tabs")! as HTMLElement;
    fireEvent.click(within(tabsEl).getByRole("button", { name: "Notes" }));
    fireEvent.click(await screen.findByText("Empty sections"));
    await screen.findByText("Milk");

    expect(screen.queryByText("Plan")).toBeNull(); // empty, so it is not shown at all
    expect(screen.getByText("Notes")).toBeTruthy(); // this one has a task under it
    // the index of every block in the preview is the index into what was rendered: filtering the array would
    // make double-clicking a line edit the wrong one
    const shown = [...document.querySelectorAll<HTMLElement>(".preview [data-block]")].map((e) => Number(e.dataset.block));
    expect(shown).toEqual(shown.slice().sort((a, b) => a - b));
  });
});

describe("the command palette", () => {
  it("does not label every row an action, because every row is one", async () => {
    await boot();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const rows = await screen.findAllByRole("option").catch(() => []);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => /Action/.test(r.textContent ?? ""))).toBe(false);
  });
});

describe("tags", () => {
  it("counts the notes that carry a tag, not the whole vault, and says which notes they are", async () => {
    await boot();
    fireEvent.click(screen.getByRole("button", { name: "Open the menu" }));
    fireEvent.click(await screen.findByRole("button", { name: "Tags" }));

    expect(await screen.findByText("1 tag in 2 notes")).toBeTruthy();
    expect(screen.getByText("#work")).toBeTruthy();
    expect(screen.getByText("B · C")).toBeTruthy(); // where it lives, on the row itself
    // the bar names where it goes — and it goes there, instead of walking back through whatever came before
    expect(document.querySelector(".bar .barlabel")!.textContent).toBe("Home");
    fireEvent.click(document.querySelector(".bar .ib")! as HTMLElement);
    expect(await screen.findByText("Today’s note")).toBeTruthy();
  });
});
