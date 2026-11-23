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

describe("the note bar", () => {
  it("offers the formatting toolbar only while editing, and keeps the trash in the note's own menu", async () => {
    await boot({ "Notes/Work.md": "# Work\n\n- [ ] Send the invoice\n" });
    fireEvent.click(within(document.querySelector(".side") as HTMLElement).getAllByRole("button", { name: /^Notes$/ })[0]);
    const row = await waitFor(() => {
      const r = rows().find((x) => x.querySelector(".nt")?.textContent === "Work")!;
      expect(r).toBeTruthy();
      return r;
    });
    fireEvent.click(row);

    // Opening a note reads it: the format buttons drive a textarea that is not mounted, so they are not there at all.
    await screen.findByText("Send the invoice");
    expect(document.querySelector(".toolbar")).toBeNull();
    expect(screen.queryByRole("button", { name: "Bold" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const bar = await waitFor(() => {
      const t = document.querySelector(".toolbar");
      expect(t).toBeTruthy();
      return t as HTMLElement;
    });
    expect(within(bar).getByRole("button", { name: "Bold" })).toBeTruthy();
    // Delete used to sit in the toolbar, one slip from the space bar; it is now two taps deep and red.
    expect(within(bar).queryByRole("button", { name: "Delete note" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Note options" }));
    expect(await screen.findByRole("menuitem", { name: "Note history" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Move to trash" })).toBeTruthy();
  });
});
