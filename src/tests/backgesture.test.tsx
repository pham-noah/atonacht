// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const back = () => window.__atonachtBack?.() ?? false;
const side = () => document.querySelector(".side") as HTMLElement;

async function boot() {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem("atonacht.prefs", JSON.stringify({ onboarded: true, root: "demo", theme: "solid", startupCache: false }));
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  const { default: App } = await import("../App");
  render(<App />);
  await screen.findByText("Today’s note");
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("the Android back gesture", () => {
  it("closes an open sheet before anything else", async () => {
    await boot();
    fireEvent.click([...side().querySelectorAll(".navitem")].find((e) => /^All tasks/.test(e.textContent ?? "")) as HTMLElement);
    const t = await screen.findByRole("button", { name: "Send invoice" });
    const row = t.closest(".row") as HTMLElement;
    fireEvent.pointerDown(row, { clientX: 100, clientY: 300, pointerType: "touch" });
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeTruthy(), { timeout: 2000 });
    expect(back()).toBe(true); // the app handled it
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    // and it did not also navigate away
    expect(screen.getByText("All tasks", { selector: "h1" })).toBeTruthy();
  });

  it("walks back from a detail screen to the one it was opened from", async () => {
    await boot();
    fireEvent.click([...side().querySelectorAll(".navitem")].find((e) => /^All tasks/.test(e.textContent ?? "")) as HTMLElement);
    await screen.findByText("All tasks", { selector: "h1" });
    fireEvent.click(document.querySelector(".side button[aria-label='Settings']") ?? [...side().querySelectorAll("button")].pop()!);
    const settings = await screen.findByText("Settings", { selector: "h1" });
    expect(settings).toBeTruthy();
    expect(back()).toBe(true);
    await waitFor(() => expect(screen.getByText("All tasks", { selector: "h1" })).toBeTruthy());
  });

  it("returns to Home from another tab, then lets the system close the app", async () => {
    await boot();
    fireEvent.click([...side().querySelectorAll(".navitem")].find((e) => /^Board/.test(e.textContent ?? "")) as HTMLElement);
    await screen.findByText("Board", { selector: "h1" });
    expect(back()).toBe(true);
    await waitFor(() => expect(screen.getByText("Today’s note")).toBeTruthy());
    expect(back()).toBe(false); // nothing left: the activity is allowed to finish
  });
});
