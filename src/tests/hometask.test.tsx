// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement | null;

async function boot() {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem("atonacht.prefs", JSON.stringify({ onboarded: true, root: "demo", theme: "solid", startupCache: false }));
  const { today } = await import("../lib/dates");
  const t = today();
  localStorage.setItem("atonacht.demo", JSON.stringify({ dirs: ["Daily notes"], files: {
    [`Daily notes/${t}.md`]: { content: `# Today\n\n- [ ] Take a shower\n- [ ] Buy milk @due(${t})\n`, mtime: Date.now() },
  } }));
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  const { default: App } = await import("../App");
  render(<App />);
  await screen.findByText("Today’s note");
  return screen.findByRole("button", { name: "Take a shower" });
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("pressing a task", () => {
  it("renames it right in the row on a tap, with no sheet in the way", async () => {
    const title = await boot();
    fireEvent.click(title);
    const input = (await screen.findByLabelText("Task title")) as HTMLInputElement; // the row's own field
    expect(input.value).toBe("Take a shower");
    expect(dialog()).toBeNull(); // no dialog at all
    fireEvent.change(input, { target: { value: "Take a long shower" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Take a long shower" })).toBeTruthy());
  });

  it("opens the whole editor when the press is held", async () => {
    const title = await boot();
    const row = title.closest(".row") as HTMLElement;
    fireEvent.pointerDown(row, { clientX: 100, clientY: 300, pointerType: "touch" });
    await waitFor(() => expect(dialog()).toBeTruthy(), { timeout: 1500 });
    fireEvent.pointerUp(row, { clientX: 101, clientY: 301, pointerType: "touch" });
    const sheet = dialog()!;
    expect(within(sheet).getByLabelText("Task title")).toBeTruthy();
    expect(within(sheet).getByLabelText("Priority")).toBeTruthy();
    expect(within(sheet).getByLabelText("Repeat")).toBeTruthy();
  });

  it("does the same on the All tasks screen", async () => {
    await boot();
    fireEvent.click([...document.querySelectorAll(".side .navitem")].find((e) => /^All tasks/.test(e.textContent ?? "")) as HTMLElement);
    await screen.findByText("All tasks", { selector: "h1" });
    fireEvent.click(await screen.findByRole("button", { name: "Buy milk" }));
    expect(((await screen.findByLabelText("Task title")) as HTMLInputElement).value).toBe("Buy milk");
    expect(dialog()).toBeNull();
  });
});
