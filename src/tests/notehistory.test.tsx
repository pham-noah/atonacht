// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { MAX_VERSION_BYTES, createIdbHistory } from "../lib/noteHistory";

afterEach(cleanup);

describe("the version history on this device", () => {
  it("keeps the last five versions of a note, newest first", async () => {
    const h = createIdbHistory(new IDBFactory());
    for (const v of ["one", "two", "three", "four", "five", "six"]) await h.record("/notes", "a.md", v);
    const list = await h.list("/notes", "a.md");
    expect(list.map((v) => v.content)).toEqual(["six", "five", "four", "three", "two"]);
    expect(list.every((v) => typeof v.at === "number" && v.at > 0)).toBe(true);
  });

  it("does not store the same text twice", async () => {
    const h = createIdbHistory(new IDBFactory());
    await h.record("/notes", "a.md", "same");
    await h.record("/notes", "a.md", "same");
    expect((await h.list("/notes", "a.md")).length).toBe(1);
    await h.record("/notes", "a.md", "different");
    expect((await h.list("/notes", "a.md")).map((v) => v.content)).toEqual(["different", "same"]);
  });

  it("keeps notes and folders apart, and clears one folder at a time", async () => {
    const h = createIdbHistory(new IDBFactory());
    await h.record("/one", "a.md", "one-a");
    await h.record("/one", "b.md", "one-b");
    await h.record("/two", "a.md", "two-a");
    expect((await h.list("/one", "a.md")).map((v) => v.content)).toEqual(["one-a"]);
    expect((await h.list("/one", "b.md")).map((v) => v.content)).toEqual(["one-b"]);
    await h.clear("/one");
    expect(await h.list("/one", "a.md")).toEqual([]);
    expect((await h.list("/two", "a.md")).map((v) => v.content)).toEqual(["two-a"]); // the other folder is untouched
    await h.clear();
    expect(await h.list("/two", "a.md")).toEqual([]);
  });

  it("keeps no version of a note too big to be worth it", async () => {
    const h = createIdbHistory(new IDBFactory());
    await h.record("/notes", "big.md", "x".repeat(MAX_VERSION_BYTES + 1));
    expect(await h.list("/notes", "big.md")).toEqual([]);
  });

  it("does nothing, without failing, where IndexedDB doesn't exist", async () => {
    const h = createIdbHistory(null);
    await h.record("/notes", "a.md", "text");
    expect(await h.list("/notes", "a.md")).toEqual([]);
    await h.clear();
  });
});

const files = () => JSON.parse(localStorage.getItem("atonacht.demo")!).files as Record<string, { content: string }>;

async function boot(seed: Record<string, string>) {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem("atonacht.prefs", JSON.stringify({ onboarded: true, root: "demo", theme: "solid", carryDismissed: "", startupCache: false }));
  localStorage.setItem("atonacht.demo", JSON.stringify({ dirs: ["Daily notes"], files: Object.fromEntries(Object.entries(seed).map(([p, content]) => [p, { content, mtime: Date.now() }])) }));
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  const { default: App } = await import("../App");
  render(<App />);
  await screen.findByText("Today’s note");
}

beforeEach(() => localStorage.clear());

describe("a save keeps the text it replaced", () => {
  it("shows it in History, with no repository set up, and restores it", async () => {
    const { today } = await import("../lib/dates");
    const t = today();
    const path = `Daily notes/${t}.md`;
    const original = `# Today\n\n- [ ] Take a shower\n`;
    await boot({ [path]: original });

    // a real save: the task is renamed in its row, which rewrites the note
    fireEvent.click(await screen.findByRole("button", { name: "Take a shower" }));
    const input = (await screen.findByLabelText("Task title")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Take a long shower" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(files()[path].content).toContain("Take a long shower"));

    // History is reachable without GitHub, and lists the text the save replaced
    const todaySection = screen.getByText("Today’s note").closest("section") as HTMLElement;
    fireEvent.click(within(todaySection).getByRole("button", { name: "Open note" }));
    fireEvent.click(await screen.findByRole("button", { name: "Note history" }));
    await screen.findByText("On this device");
    const row = (await screen.findByText(/bytes$/)).closest("button") as HTMLElement;
    fireEvent.click(row);
    expect(await screen.findByText(/Take a shower/, { selector: "pre" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Restore this version" }));
    await waitFor(() => expect(files()[path].content).toBe(original));
  });
});
