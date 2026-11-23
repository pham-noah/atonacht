// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const files = () => JSON.parse(localStorage.getItem("atonacht.demo")!).files as Record<string, { content: string }>;

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem("atonacht.prefs", JSON.stringify({ onboarded: true, root: "demo", theme: "solid", startupCache: false }));
  localStorage.setItem("atonacht.demo", JSON.stringify({
    dirs: ["Personal"],
    files: {
      "Personal/Plan.md": { content: "# Plan\n\nMine: call the bank.\n", mtime: Date.now() },
      // what GitHub sync leaves behind when both sides changed the same note
      "Personal/Plan (github).md": { content: "# Plan\n\nGitHub: call the bank, and the plumber.\n", mtime: Date.now() },
    },
  }));
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

describe("a conflict from GitHub sync", () => {
  it("is offered as a conflict, not left sitting in the notes list as a note", async () => {
    const { default: App } = await import("../App");
    render(<App />);
    // the copy is not a note you have to notice yourself
    expect(await screen.findByText(/1 sync conflict to review/)).toBeTruthy();

    fireEvent.click(screen.getByText(/1 sync conflict to review/));
    expect(await screen.findByText(/edited here and on GitHub/)).toBeTruthy();
    // it names where the other version came from, and dates it
    expect(screen.getByText("From GitHub")).toBeTruthy();
    expect(screen.getByText(/\d{4}-\d{2}-\d{2} · GitHub/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Keep GitHub’s" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Keep both" }));
    await screen.findByText("No conflicts. Everything is in sync.");

    // both versions survive, and the copy stops being named like a sync artifact
    expect(files()["Personal/Plan.md"].content).toContain("Mine: call the bank.");
    const kept = Object.keys(files()).find((p) => /^Personal\/Plan \(conflict \d{4}-\d{2}-\d{2}\)\.md$/.test(p));
    expect(kept).toBeTruthy();
    expect(files()[kept!].content).toContain("and the plumber");
    await waitFor(() => expect(Object.keys(files()).some((p) => / \(github\)\.md$/.test(p))).toBe(false));
  });
});
