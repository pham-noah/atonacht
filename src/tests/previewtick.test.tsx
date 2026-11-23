// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { today } from "../lib/dates";

const files = () => JSON.parse(localStorage.getItem("atonacht.demo")!).files as Record<string, { content: string }>;
const rows = () => [...document.querySelectorAll(".noterow")] as HTMLElement[];

async function boot(seed: Record<string, string>) {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem("atonacht.prefs", JSON.stringify({ onboarded: true, root: "demo", theme: "solid", carryDismissed: "", startupCache: false }));
  localStorage.setItem(
    "atonacht.demo",
    JSON.stringify({ dirs: ["Notes"], files: Object.fromEntries(Object.entries(seed).map(([p, content]) => [p, { content, mtime: Date.now() }])) }),
  );
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  const { default: App } = await import("../App");
  render(<App />);
  await screen.findByText("Today’s note");
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("ticking a task in the reading view", () => {
  it("stamps the day it was done, like the checkbox in every list does", async () => {
    await boot({ "Notes/Work.md": "# Work\n\n- [ ] Send the invoice\n" });
    fireEvent.click(within(document.querySelector(".side") as HTMLElement).getAllByRole("button", { name: /^Notes$/ })[0]);
    const row = await waitFor(() => {
      const r = rows().find((x) => x.querySelector(".nt")?.textContent === "Work")!;
      expect(r).toBeTruthy();
      return r;
    });
    fireEvent.click(row);

    const box = (await waitFor(() => {
      const b = document.querySelector<HTMLInputElement>(".md-task input[type=checkbox]");
      expect(b).toBeTruthy();
      return b!;
    })) as HTMLInputElement;
    fireEvent.click(box);

    // A done task with no @done date is invisible in Done and in the weekly review: every list filters on that stamp.
    await waitFor(() => expect(files()["Notes/Work.md"].content).toContain("- [x] Send the invoice"));
    expect(files()["Notes/Work.md"].content).toContain(`@done(${today()})`);
  });
});
