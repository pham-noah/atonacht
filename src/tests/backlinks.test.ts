import { describe, expect, it } from "vitest";
import { buildLinks, linksIn, noteKeys, tagIndex, tagsIn } from "../lib/backlinks";

describe("reading links out of a note", () => {
  it("finds wiki links, ignores repeats and strips aliases and anchors", () => {
    expect(linksIn("See [[Thesis outline]] and [[Thesis outline|the outline]] plus [[Reading list#Books]].")).toEqual([
      "Thesis outline",
      "Reading list",
    ]);
  });

  it("ignores headings, lowercases, and lists each tag once", () => {
    // "# Plan" is a heading (no tag name right after the #); "#hash" is a tag even mid-sentence; repeats collapse
    expect(tagsIn("# Plan\n- [ ] Buy milk #shopping #Home\n\nNo #hash here? #shopping again")).toEqual(["shopping", "home", "hash"]);
  });

  it("answers to a file name and to its title", () => {
    expect(noteKeys("Daily notes/2026-11-05.md", "Wednesday, 5 November")).toEqual(["2026-11-05", "wednesday, 5 november"]);
  });
});

describe("the link graph", () => {
  const notes = {
    "Thesis/Outline.md": "# Outline\n\nSee [[Reading list]] and [[Missing note]].",
    "Thesis/Reading list.md": "# Reading list\n\n#thesis",
    "Daily notes/2026-11-05.md": "# Today\n\nWorked on [[Outline]] #thesis",
  };
  const titles = {
    "Thesis/Outline.md": "Outline",
    "Thesis/Reading list.md": "Reading list",
    "Daily notes/2026-11-05.md": "Today",
  };

  it("knows which notes point at a note, by title as well as by file name", () => {
    const { incoming } = buildLinks(notes, titles);
    expect(incoming["Thesis/Reading list.md"]).toEqual(["Thesis/Outline.md"]);
    expect(incoming["Thesis/Outline.md"]).toEqual(["Daily notes/2026-11-05.md"]);
  });

  it("keeps a link to a note that does not exist, so the editor can say it is missing", () => {
    const { outgoing } = buildLinks(notes, titles);
    expect(outgoing["Thesis/Outline.md"]).toEqual(["Reading list", "Missing note"]);
  });

  it("never links a note to itself", () => {
    const { incoming } = buildLinks({ "A.md": "# A\n\n[[A]]" }, { "A.md": "A" });
    expect(incoming["A.md"]).toBeUndefined();
  });

  it("counts tags per note, most used first", () => {
    const index = tagIndex(notes);
    expect(index[0]).toMatchObject({ tag: "thesis", count: 2 });
  });
});

describe("search filters", () => {
  it("reads tag:, due: and is: out of the query and keeps the rest as text", async () => {
    const { parseQuery, noteMatches } = await import("../lib/search");
    const q = parseQuery("tag:thesis due:overdue is:open milk");
    expect(q).toMatchObject({ text: "milk", tags: ["thesis"], due: "overdue", done: false, filtered: true });
    const tasks = [
      { id: "1", path: "A.md", line: 3, title: "Buy milk", done: false, due: "2026-01-01", raw: "" },
    ] as never[];
    expect(noteMatches(q, "A.md", "Buy milk #thesis", tasks, "2026-11-05")).toBe(true);
    expect(noteMatches(q, "A.md", "Buy milk", tasks, "2026-11-05")).toBe(false); // no tag
  });

  it("treats a bare #tag as a filter and leaves plain words alone", async () => {
    const { parseQuery, describeQuery } = await import("../lib/search");
    expect(parseQuery("#work invoice")).toMatchObject({ text: "invoice", tags: ["work"], filtered: true });
    expect(parseQuery("just words").filtered).toBe(false);
    expect(describeQuery(parseQuery("tag:work due:today"))).toBe("tag #work · due today");
  });
});
