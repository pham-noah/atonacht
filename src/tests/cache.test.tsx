// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createIdbCache } from "../lib/noteCache";

afterEach(cleanup);

describe("note cache", () => {
  it("stores, updates, removes and clears notes per folder", async () => {
    const c = createIdbCache();
    await c.put("/a", { "x.md": { content: "X", mtime: 1, size: 1 }, "d/y.md": { content: "Y", mtime: 2, size: 1 } });
    await c.put("/b", { "x.md": { content: "other folder", mtime: 3, size: 12 } });
    expect(Object.keys(await c.load("/a")).sort()).toEqual(["d/y.md", "x.md"]);
    await c.put("/a", { "x.md": { content: "X2", mtime: 5, size: 2 } });
    expect((await c.load("/a"))["x.md"]).toEqual({ content: "X2", mtime: 5, size: 2 });
    await c.remove("/a", ["d/y.md"]);
    expect(Object.keys(await c.load("/a"))).toEqual(["x.md"]);
    await c.clear("/a");
    expect(await c.load("/a")).toEqual({});
    expect(Object.keys(await c.load("/b"))).toEqual(["x.md"]); // the other folder is untouched
    await c.clear();
    expect(await c.load("/b")).toEqual({});
  });
  it("does nothing, without failing, where IndexedDB doesn't exist", async () => {
    const c = createIdbCache(null);
    await c.put("/a", { "x.md": { content: "X", mtime: 1, size: 1 } });
    expect(await c.load("/a")).toEqual({});
    await c.remove("/a", ["x.md"]);
    await c.clear();
  });
});

beforeAll(() => {
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});

async function start(prefs: Record<string, unknown> = {}) {
  vi.resetModules();
  localStorage.setItem("atonacht.prefs", JSON.stringify({ onboarded: true, root: "demo", theme: "solid", carryDismissed: "", ...prefs }));
  const { fs } = await import("../lib/backend");
  const read = vi.spyOn(fs, "read");
  const { noteCache } = await import("../lib/noteCache");
  const { default: App } = await import("../App");
  render(<App />);
  await screen.findByText("Today’s note");
  return { read, noteCache };
}

describe("fast startup", () => {
  it("reads every note the first time, and only changed notes the second time", async () => {
    localStorage.clear();
    const first = await start();
    await waitFor(() => expect(first.read.mock.calls.length).toBeGreaterThanOrEqual(5));
    const total = first.read.mock.calls.length;
    await waitFor(async () => expect(Object.keys(await first.noteCache.load("demo")).length).toBeGreaterThanOrEqual(5));
    cleanup();

    // second start: same notes on disk, so nothing needs reading
    const second = await start();
    await waitFor(() => expect(document.querySelector(".fold")).toBeTruthy());
    await new Promise((r) => setTimeout(r, 50));
    expect(total).toBeGreaterThanOrEqual(5);
    expect(second.read).not.toHaveBeenCalled();
    cleanup();

    // a note changed elsewhere while the app was closed is the only one that is read again
    const demo = JSON.parse(localStorage.getItem("atonacht.demo")!);
    demo.files["Personal/Packing list.md"] = { content: "# Packing list\n\nchanged on another device\n", mtime: Date.now() + 5000 };
    localStorage.setItem("atonacht.demo", JSON.stringify(demo));
    const third = await start();
    await waitFor(() => expect(third.read).toHaveBeenCalledTimes(1));
    expect(third.read.mock.calls[0][1]).toBe("Personal/Packing list.md");
  });

  it("can be switched off and cleared from Settings, and then reads everything again", async () => {
    localStorage.clear();
    const first = await start();
    await waitFor(async () => expect(Object.keys(await first.noteCache.load("demo")).length).toBeGreaterThanOrEqual(5));
    fireEvent.click(screen.getAllByRole("button", { name: "Settings" })[0]);
    const list = await waitFor(() => { const el = document.querySelector(".setlist") as HTMLElement | null; if (!el) throw new Error("loading"); return el; });
    fireEvent.click(await within(list).findByRole("button", { name: /^Files & backup/ }));
    fireEvent.click(await screen.findByLabelText(/Keep a copy of my notes/));
    await waitFor(async () => expect(await first.noteCache.load("demo")).toEqual({}));
    expect(JSON.parse(localStorage.getItem("atonacht.prefs")!).startupCache).toBe(false);
    cleanup();
    const again = await start({ startupCache: false });
    await waitFor(() => expect(again.read.mock.calls.length).toBeGreaterThanOrEqual(5));
  });
});
