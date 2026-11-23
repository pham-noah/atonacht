// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { addDays, today } from "../lib/dates";

const files = () => JSON.parse(localStorage.getItem("atonacht.demo")!).files as Record<string, { content: string }>;
const all = () => Object.values(files()).map((f) => f.content).join("\n");

async function boot(extra: Record<string, unknown> = {}) {
  vi.resetModules();
  localStorage.removeItem("atonacht.prefs");
  localStorage.setItem("atonacht.prefs", JSON.stringify({ onboarded: true, root: "demo", theme: "solid", carryDismissed: "", ...extra }));
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  const { default: App } = await import("../App");
  render(<App />);
  await screen.findByText("Today’s note");
}

const addOnHome = async (text: string) => {
  fireEvent.change(screen.getByPlaceholderText("Add a task to today"), { target: { value: text } });
  fireEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);
};

afterEach(cleanup);
beforeEach(() => { vi.restoreAllMocks(); localStorage.removeItem("atonacht.demo"); });

describe("a default of today", () => {
  it("replaces the old 'no date' default for anyone who never chose one", async () => {
    await boot({ defaultDue: "none" }); // stored before the default changed, with no version stamp
    await waitFor(() => expect(JSON.parse(localStorage.getItem("atonacht.prefs")!).defaultDue).toBe("today"));
  });

  it("keeps a default that was chosen on purpose", async () => {
    await boot({ defaultDue: "tomorrow" });
    expect(JSON.parse(localStorage.getItem("atonacht.prefs")!).defaultDue).toBe("tomorrow");
    await boot({ defaultDue: "none", version: 2 }); // and an explicit "No date" is respected once stamped
    expect(JSON.parse(localStorage.getItem("atonacht.prefs")!).defaultDue).toBe("none");
  });
});

describe("tasks written the way you would say them", () => {
  it("reads the day and the time out of the words", async () => {
    await boot();
    await addOnHome("Buy milk tomorrow 5pm");
    await waitFor(() => expect(all()).toMatch(new RegExp(`- \\[ \\] Buy milk @due\\(${addDays(today(), 1)}\\) @at\\(17:00\\)`)));
  });

  it("assumes today when the words name no day", async () => {
    await boot();
    await addOnHome("Call the bank");
    await waitFor(() => expect(all()).toMatch(new RegExp(`- \\[ \\] Call the bank @due\\(${today()}\\)`)));
  });

  it("says what it understood while the words are still in the box", async () => {
    await boot();
    const box = screen.getByPlaceholderText("Add a task to today");
    fireEvent.change(box, { target: { value: "Pay rent tomorrow 5pm" } });
    expect(await screen.findByText("tomorrow at 5:00 pm")).toBeTruthy();
    fireEvent.change(box, { target: { value: "Pay rent" } });
    await waitFor(() => expect(screen.queryByText("tomorrow at 5:00 pm")).toBeNull());
  });
});
