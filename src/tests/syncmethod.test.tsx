// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

async function boot(method?: "syncthing" | "github" | "both" | "none") {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem("atonacht.prefs", JSON.stringify({ onboarded: true, root: "demo", theme: "solid", startupCache: false, ...(method ? { syncMethod: method } : {}) }));
  localStorage.setItem("atonacht.demo", JSON.stringify({ dirs: [], files: { "Note.md": { content: "# Note\n", mtime: Date.now() } } }));
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  const { default: App } = await import("../App");
  render(<App />);
  await screen.findByText("Today’s note");
  document.querySelector(".brandbtn")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  const gear = await screen.findByRole("button", { name: "Settings" });
  fireEvent.click(gear);
  const card = await screen.findByText("Notes folder, Syncthing, conflicts");
  fireEvent.click(card);
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("choosing how this device syncs", () => {
  it("offers both and only shows the one that is on", async () => {
    await boot("github");
    // GitHub is chosen, so its fields are here and Syncthing's guide is not
    expect(await screen.findByText(/fine-grained token with Contents/)).toBeTruthy();
    expect(screen.queryByText(/Start Syncthing-Fork/)).toBeNull();
  });

  it("hides both sections when sync is off, and keeps the notes folder", async () => {
    await boot("none");
    expect(await screen.findByText(/Nothing is copied off this device/)).toBeTruthy();
    expect(screen.queryByText(/fine-grained token with Contents/)).toBeNull();
    expect(screen.queryByText(/Start Syncthing-Fork/)).toBeNull();
    expect(screen.getByText(/^Notes folder$/)).toBeTruthy();
  });

  it("shows both sections when both are chosen", async () => {
    await boot("both");
    expect(await screen.findByText(/fine-grained token with Contents/)).toBeTruthy();
    expect(screen.getByText(/Syncthing-Fork/)).toBeTruthy();
  });
});
