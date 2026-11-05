// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const side = () => document.querySelector(".side") as HTMLElement;
const rows = () => document.querySelectorAll(".noterow").length;
const page = () => within(document.querySelector(".content") as HTMLElement);

async function boot(count: number) {
  vi.resetModules();
  localStorage.clear();
  const files: Record<string, { content: string; mtime: number }> = {};
  for (let i = 0; i < count; i++) files[`Notes/note ${i}.md`] = { content: `# note ${i}\n\nbody ${i}\n`, mtime: 1_700_000_000_000 + i };
  localStorage.setItem("atonacht.demo", JSON.stringify({ dirs: ["Notes"], files }));
  localStorage.setItem("atonacht.prefs", JSON.stringify({ onboarded: true, root: "demo", theme: "solid", startupCache: false }));
  // a phone-sized window: the sidebar lives in a drawer, so the page keeps its own search field
  window.matchMedia = ((q: string) => ({ matches: !q.includes("min-width: 900px"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  const { default: App } = await import("../App");
  render(<App />);
  await screen.findByText("Today’s note");
  const nav = [...side().querySelectorAll(".navitem")].find((e) => /^Notes/.test((e.textContent ?? "").trim()));
  fireEvent.click(nav as HTMLElement);
  await waitFor(() => expect(document.querySelectorAll(".noterow").length).toBeGreaterThan(0));
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("a folder with more notes than fit on a screen", () => {
  it("draws a page of them, and the rest arrive on demand", async () => {
    await boot(250);
    expect(rows()).toBe(100); // a page, not the whole folder
    const total = Number(page().getByRole("button", { name: /^Show \d+ more of \d+$/ }).textContent!.match(/of (\d+)$/)![1]);
    expect(total).toBeGreaterThanOrEqual(250);

    fireEvent.click(page().getByRole("button", { name: /^Show 100 more of \d+$/ }));
    expect(rows()).toBe(200);

    fireEvent.click(page().getByRole("button", { name: /^Show \d+ more of \d+$/ }));
    expect(rows()).toBe(total); // everything is there now
    expect(page().queryByRole("button", { name: /more of/ })).toBeNull();
  });

  it("starts again from the first page when the search changes", async () => {
    await boot(250);
    fireEvent.click(page().getByRole("button", { name: /^Show 100 more of \d+$/ }));
    expect(rows()).toBe(200);
    fireEvent.change(page().getByLabelText("Search notes"), { target: { value: "note 24" } });
    await waitFor(() => expect(rows()).toBeLessThanOrEqual(100));
  });
});
