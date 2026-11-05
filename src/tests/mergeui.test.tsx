// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/** Boots the demo with one note that two devices edited at once, and lands on Settings. */
async function boot() {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem("atonacht.prefs", JSON.stringify({ onboarded: true, root: "demo", theme: "solid", startupCache: false }));
  localStorage.setItem("atonacht.demo", JSON.stringify({
    dirs: [],
    files: {
      "Note.md": { content: "# Plan\n- buy milk\n- call Ana\n", mtime: Date.now() - 5000 },
      "Note.sync-conflict-20261105-101500-ABCDEFG.md": { content: "# Plan\n- buy milk\n- call Ana today\n- book train\n", mtime: Date.now() - 2000 },
    },
  }));
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  const { default: App } = await import("../App");
  render(<App />);
  await screen.findByText("Today’s note");
}

const demoFile = (name: string) => JSON.parse(localStorage.getItem("atonacht.demo")!).files[name];

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("a note that two devices edited", () => {
  it("can be merged by hand into one note holding both changes", async () => {
    await boot();
    fireEvent.click(await screen.findByRole("button", { name: /Sync conflicts/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Merge by hand" }));

    // one decision, and both sides of it visible before anything is chosen
    expect(await screen.findByText(/^1 place where they differ/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "This device" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Other device" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Both" })).toBeTruthy();
    expect(screen.getByText("- call Ana today")).toBeTruthy(); // the other device's line is on screen

    fireEvent.click(screen.getByRole("button", { name: "Save merged note" }));

    await waitFor(() => {
      const note = demoFile("Note.md");
      expect(note.content).toContain("- call Ana");
      expect(note.content).toContain("- call Ana today"); // "Both" keeps this device's line first
      expect(note.content).toContain("- book train");
      // the conflict copy is gone from the folder and kept in .trash, not deleted outright
      const files = JSON.parse(localStorage.getItem("atonacht.demo")!).files as Record<string, unknown>;
      expect(Object.keys(files)).not.toContain("Note.sync-conflict-20261105-101500-ABCDEFG.md");
      expect(Object.keys(files).some((k) => k.startsWith(".trash/"))).toBe(true);
    });
  });
});
