// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const side = () => document.querySelector(".side") as HTMLElement;

async function openTaskDialog() {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem("atonacht.prefs", JSON.stringify({ onboarded: true, root: "demo", theme: "solid", startupCache: false }));
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  const { default: App } = await import("../App");
  render(<App />);
  await screen.findByText("Today’s note");
  fireEvent.click([...side().querySelectorAll(".navitem")].find((e) => /^All tasks/.test(e.textContent ?? "")) as HTMLElement);
  const title = await screen.findByRole("button", { name: "Send invoice" });
  const row = title.closest(".row") as HTMLElement;
  title.focus();
  // the sheet opens on a hold; a tap renames in place
  fireEvent.pointerDown(row, { clientX: 100, clientY: 300, pointerType: "touch" });
  await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeTruthy(), { timeout: 2000 });
  fireEvent.pointerUp(row, { clientX: 101, clientY: 301, pointerType: "touch" });
  return { trigger: title as HTMLElement };
}

const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement | null;

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("a dialog in the app", () => {
  it("takes the keyboard, closes on Escape and gives focus back", async () => {
    const { trigger } = await openTaskDialog();
    const sheet = dialog()!;
    expect(sheet).toBeTruthy();
    expect(sheet.getAttribute("aria-modal")).toBe("true");
    await waitFor(() => expect(sheet.contains(document.activeElement)).toBe(true)); // focus moved in

    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    await waitFor(() => expect(dialog()).toBeNull());
    expect(document.activeElement).toBe(trigger); // and came back to the row it started from
  });

  it("keeps Tab inside the dialog", async () => {
    await openTaskDialog();
    const sheet = dialog()!;
    await waitFor(() => expect(sheet.contains(document.activeElement)).toBe(true));
    const items = [...sheet.querySelectorAll<HTMLElement>("input, select, textarea, button")].filter((el) => !el.hasAttribute("disabled"));
    const first = items[0];
    const last = items[items.length - 1];
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" }); // Tab at the end wraps to the start
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true }); // and Shift+Tab at the start wraps to the end
    expect(document.activeElement).toBe(last);
  });
});
