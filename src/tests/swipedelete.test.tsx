// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const files = () => JSON.parse(localStorage.getItem("atonacht.demo")!).files as Record<string, { content: string }>;

async function boot(extra: Record<string, unknown> = {}) {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem("atonacht.prefs", JSON.stringify({ onboarded: true, root: "demo", theme: "solid", startupCache: false, ...extra }));
  const { today } = await import("../lib/dates");
  const t = today();
  localStorage.setItem("atonacht.demo", JSON.stringify({ dirs: ["Daily notes"], files: {
    [`Daily notes/${t}.md`]: { content: `# Today\n\n- [ ] Take a shower\n- [ ] Buy milk @due(${t})\n`, mtime: Date.now() },
  } }));
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  const { default: App } = await import("../App");
  render(<App />);
  await screen.findByText("Today’s note");
  return { title: await screen.findByRole("button", { name: "Take a shower" }), t };
}

const swipe = (el: HTMLElement, dx: number) => {
  const row = el.closest(".row") as HTMLElement;
  fireEvent.pointerDown(row, { clientX: 200, clientY: 300, pointerType: "touch" });
  fireEvent.pointerUp(row, { clientX: 200 + dx, clientY: 302, pointerType: "touch" });
};

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("swiping a task", () => {
  it("completes it on a right swipe without starting a rename", async () => {
    const { title } = await boot();
    swipe(title, 90);
    await waitFor(() => expect(files()[Object.keys(files())[0]].content).toContain("- [x] Take a shower"));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("moves it to tomorrow on a left swipe", async () => {
    const { title, t } = await boot();
    const { addDays } = await import("../lib/dates");
    swipe(title, -90);
    await waitFor(() => expect(files()[Object.keys(files())[0]].content).toContain(`@due(${addDays(t, 1)})`));
  });

  it("deletes it when swipe left is set to delete, and undo puts it back", async () => {
    const { title } = await boot({ swipeLeft: "delete" });
    swipe(title, -90);
    await waitFor(() => expect(files()[Object.keys(files())[0]].content).not.toContain("Take a shower"));
    const undo = await screen.findByRole("button", { name: "Undo" });
    fireEvent.click(undo);
    await waitFor(() => expect(files()[Object.keys(files())[0]].content).toContain("- [ ] Take a shower"));
  });
});
