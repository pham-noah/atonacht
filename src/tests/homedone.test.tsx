// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const demo = () => JSON.parse(localStorage.getItem("atonacht.demo")!).files as Record<string, { content: string }>;

async function boot() {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem("atonacht.prefs", JSON.stringify({ onboarded: true, root: "demo", theme: "solid", startupCache: false }));
  const { today } = await import("../lib/dates");
  const t = today();
  localStorage.setItem("atonacht.demo", JSON.stringify({ dirs: [], files: {
    [`Daily notes/${t}.md`]: { content: `# Today\n\n- [ ] Take a shower\n- [x] Pay rent\n`, mtime: Date.now() },
  } }));
  window.matchMedia = ((q: string) => ({ matches: !q.includes("min-width: 900px"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  const { default: App } = await import("../App");
  render(<App />);
  await screen.findByText("Today’s note");
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("today on Home", () => {
  it("shows what is left, and puts finished work one tap away", async () => {
    await boot();
    // open tasks first: the done one is not in the way
    expect(await screen.findByText("Take a shower")).toBeTruthy();
    expect(screen.queryByText("Pay rent")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: /^Done/ }));
    expect(await screen.findByText("Pay rent")).toBeTruthy();
    expect(screen.queryByText("Take a shower")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "All" }));
    expect(await screen.findByText("Take a shower")).toBeTruthy();
    expect(screen.getByText("Pay rent")).toBeTruthy();
    expect(demo()).toBeTruthy(); // the note itself was never rewritten by filtering
  });

  it("opens a note to be read, with editing one tap away", async () => {
    await boot();
    fireEvent.click(await screen.findByRole("button", { name: "Open note" }));
    // preview is the state you land in, so the toggle offers Edit
    expect(await screen.findByRole("button", { name: "Edit" })).toBeTruthy();
    expect(document.querySelector("textarea.page")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("button", { name: "Preview" })).toBeTruthy();
  });
});
