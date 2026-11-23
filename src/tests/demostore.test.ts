// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createMemFs } from "../lib/memFs";

// The browser demo keeps its notes in localStorage, so a store written by an older build can be missing a field.
// It used to bring the whole screen down with "Cannot read properties of undefined (reading 'filter')".
describe("a demo store from an older build", () => {
  beforeEach(() => localStorage.clear());

  it("opens when the saved store has notes but no folders", async () => {
    localStorage.setItem("atonacht.demo", JSON.stringify({ files: { "Plan.md": { content: "# Plan\n", mtime: 1 } } }));
    const mem = createMemFs(undefined, true);
    const listed = await mem.list("demo");
    expect(listed.map((e) => e.path)).toEqual(["Plan.md"]);
    expect(listed[0].kind).toBe("file");
    expect(await mem.read("demo", "Plan.md")).toBe("# Plan\n");
    await mem.write("demo", "Plan.md", "# Plan\nmore\n");
    expect(JSON.parse(localStorage.getItem("atonacht.demo")!).dirs).toEqual([]);
  });

  it("seeds the sample notes when nothing is stored at all", async () => {
    const mem = createMemFs(undefined, true);
    expect((await mem.list("demo")).length).toBeGreaterThan(3);
  });

  it("shows an empty folder when the store holds no notes, rather than re-seeding over a cleared one", async () => {
    localStorage.setItem("atonacht.demo", JSON.stringify({ files: {}, dirs: [] }));
    const mem = createMemFs(undefined, true);
    expect(await mem.list("demo")).toEqual([]);
  });
});
