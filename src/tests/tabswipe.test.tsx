// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const content = () => document.querySelector(".content") as HTMLElement;

async function bootPhone() {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem("atonacht.prefs", JSON.stringify({ onboarded: true, root: "demo", theme: "solid", startupCache: false }));
  // a phone: the sidebar query does not match, so the bottom bar and swipes are live
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  const { default: App } = await import("../App");
  render(<App />);
  await screen.findByText("Today’s note");
}

const swipe = (dx: number, from = content()) => {
  fireEvent.pointerDown(from, { clientX: 200, clientY: 400, pointerType: "touch" });
  fireEvent.pointerUp(from, { clientX: 200 + dx, clientY: 402, pointerType: "touch" });
};

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("moving between tabs on a phone", () => {
  it("swipes left to the next tab and right back to the previous one", async () => {
    await bootPhone();
    expect(screen.getByText("Today’s note")).toBeTruthy(); // Home

    swipe(-140); // left: Home -> All tasks
    await waitFor(() => expect(screen.getByText("All tasks", { selector: "h1" })).toBeTruthy());

    swipe(140); // right: back to Home
    await waitFor(() => expect(screen.getByText("Today’s note")).toBeTruthy());
  });

  it("slides the screen in from the side it came from", async () => {
    await bootPhone();
    swipe(-140);
    await waitFor(() => expect(content().className).toContain("slide-r"));
    await waitFor(() => expect(content().className).not.toContain("slide-"), { timeout: 1000 }); // and settles
  });

  it("leaves a swipe that starts on a task row alone", async () => {
    await bootPhone();
    fireEvent.click([...document.querySelectorAll(".tabs button")].find((b) => /^Tasks$/.test((b.textContent ?? "").trim())) as HTMLElement);
    await screen.findByText("All tasks", { selector: "h1" });
    const row = (await waitFor(() => {
      const r = document.querySelector(".row") as HTMLElement | null;
      if (!r) throw new Error("no task row yet");
      return r;
    })) as HTMLElement;
    swipe(-140, row); // this belongs to the row (complete / tomorrow), so the tab must not change
    await new Promise((r) => setTimeout(r, 250));
    expect(screen.getByText("All tasks", { selector: "h1" })).toBeTruthy();
    expect(screen.queryByText("Board", { selector: "h1" })).toBeNull();
  });
});
