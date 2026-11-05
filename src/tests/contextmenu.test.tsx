// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within as rawWithin } from "@testing-library/react";

/** clicks the menu item whose text is exactly this */
const within = (host: HTMLElement, label: string) => {
  const el = [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
  if (!el) throw new Error(`no menu item “${label}” in: ${host.textContent}`);
  return el as HTMLElement;
};
void rawWithin;

const files = () => JSON.parse(localStorage.getItem("atonacht.demo")!).files as Record<string, { content: string }>;
const first = () => files()[Object.keys(files())[0]].content;
const menu = () => document.querySelector('[role="menu"]') as HTMLElement | null;

async function boot() {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem("atonacht.prefs", JSON.stringify({ onboarded: true, root: "demo", theme: "solid", startupCache: false }));
  const { today } = await import("../lib/dates");
  const t = today();
  localStorage.setItem("atonacht.demo", JSON.stringify({ dirs: ["Daily notes", "Projects"], files: {
    [`Daily notes/${t}.md`]: { content: `# Today\n\n- [ ] Take a shower\n- [ ] Buy milk @due(${t})\n`, mtime: Date.now() },
    "Projects/Thesis.md": { content: "# Thesis outline\n\nSome text.\n", mtime: Date.now() },
  } }));
  // a mouse: `(pointer: fine)` matches, which is what the menu host asks for
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  const { default: App } = await import("../App");
  render(<App />);
  await screen.findByText("Today’s note");
}

const rightClick = (el: HTMLElement) => fireEvent.contextMenu(el, { clientX: 200, clientY: 300, button: 2 });

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("right-click on desktop", () => {
  it("opens a task menu and completes the task from it", async () => {
    await boot();
    rightClick(await screen.findByRole("button", { name: "Take a shower" }));
    const m = (await waitFor(() => menu()))!;
    expect(m.textContent).toContain("Complete");
    expect(m.textContent).toContain("Due tomorrow");
    fireEvent.click(within(m, "Complete"));
    await waitFor(() => expect(first()).toContain("- [x] Take a shower"));
    expect(menu()).toBeNull(); // and closes itself
  });

  it("sets a due date and priority from the same menu", async () => {
    await boot();
    rightClick(await screen.findByRole("button", { name: "Take a shower" }));
    fireEvent.click(within((await waitFor(() => menu()))!, "Due tomorrow"));
    const { today, addDays } = await import("../lib/dates");
    await waitFor(() => expect(first()).toContain(`@due(${addDays(today(), 1)})`));

    rightClick(await screen.findByRole("button", { name: "Take a shower" }));
    fireEvent.click(within((await waitFor(() => menu()))!, "High priority"));
    await waitFor(() => expect(first()).toContain("!high"));
  });

  it("closes on Escape and on a click elsewhere", async () => {
    await boot();
    rightClick(await screen.findByRole("button", { name: "Take a shower" }));
    await waitFor(() => expect(menu()).toBeTruthy());
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(menu()).toBeNull());

    rightClick(await screen.findByRole("button", { name: "Take a shower" }));
    await waitFor(() => expect(menu()).toBeTruthy());
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(menu()).toBeNull());
  });

  it("gives a note row its own menu: pin, rename and trash", async () => {
    await boot();
    fireEvent.click([...document.querySelectorAll(".side .navitem")].find((e) => /^Notes/.test(e.textContent ?? "")) as HTMLElement);
    const row = await screen.findByText("Thesis outline");
    rightClick(row.closest(".noterow") as HTMLElement);
    const m = (await waitFor(() => menu()))!;
    expect(m.textContent).toContain("Rename…");
    fireEvent.click(within(m, "Pin"));
    await waitFor(() => expect(files()["Projects/Thesis.md"].content).toContain("pinned: true"));
  });
});
