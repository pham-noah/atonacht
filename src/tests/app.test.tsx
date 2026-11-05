// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

beforeAll(() => {
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  localStorage.setItem("atonacht.prefs", JSON.stringify({ onboarded: true, root: "demo", theme: "glass", accent: "blue", carryDismissed: "" }));
});
afterEach(cleanup);

describe("Atonacht app (browser demo backend)", () => {
  it("creates today's note, carries over tasks, toggles a task and resolves a sync conflict", async () => {
    const { default: App } = await import("../App");
    render(<App />);

    // Home: today's note exists and the carry-over banner is offered
    await screen.findByText("Today’s note");
    const banner = await screen.findByText(/unfinished tasks? from/);
    expect(banner.textContent).toMatch(/2 unfinished tasks/);

    fireEvent.click(screen.getByRole("button", { name: "Carry over" }));
    const card = screen.getByText("Today’s note").closest("section")!;
    await within(card).findByText("Send invoice");
    expect(within(card).getByText("Email supervisor #thesis")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/unfinished tasks? from/)).toBeNull());

    // Checking a task writes it back to the note and removes it from the open list
    fireEvent.click(within(card).getByLabelText("Complete: Send invoice"));
    await waitFor(() => expect(within(card).queryByText("Send invoice")).toBeNull());

    // The Syncthing conflict is surfaced and can be resolved with "Keep both"
    fireEvent.click(await screen.findByText(/1 sync conflict to review/));
    await screen.findByText("From another device");
    expect(document.querySelectorAll(".dl.add").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Keep both" }));
    await screen.findByText("No conflicts. Everything is in sync.");

    // The other version is kept as its own note
    fireEvent.click(screen.getAllByRole("button", { name: "Notes" })[0]);
    await waitFor(() => expect(screen.getAllByText("Thesis outline", { selector: ".nt" })).toHaveLength(2)); // original + kept copy
    expect(Object.keys(JSON.parse(localStorage.getItem("atonacht.demo")!).files).some((p) => p.includes("(conflict 2026-10-29)"))).toBe(true);
  });
});
