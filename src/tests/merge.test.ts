import { describe, expect, it } from "vitest";
import { hunkCount, mergeRows, mergeWith } from "../lib/merge";

const mine = "# Plan\n- buy milk\n- call Ana\n# Journal\nfine";
const theirs = "# Plan\n- buy milk\n- call Ana today\n- book train\n# Journal\nfine";

describe("merging two versions of a note", () => {
  it("finds the one place they disagree and leaves the rest alone", () => {
    const rows = mergeRows(mine, theirs);
    expect(hunkCount(rows)).toBe(1);
    expect(mergeWith(rows, () => "mine")).toBe(mine);
    expect(mergeWith(rows, () => "theirs")).toBe(theirs);
  });

  it("keeps both sides of a hunk when asked, this device first", () => {
    const rows = mergeRows(mine, theirs);
    const both = mergeWith(rows, () => "both");
    expect(both).toContain("- call Ana\n- call Ana today");
    expect(both).toContain("- book train");
  });

  it("never loses a line the two versions agree on", () => {
    const rows = mergeRows(mine, theirs);
    for (const how of ["mine", "theirs", "both"] as const) {
      const out = mergeWith(rows, () => how);
      expect(out.startsWith("# Plan\n- buy milk")).toBe(true);
      expect(out.endsWith("# Journal\nfine")).toBe(true);
    }
  });

  it("handles a note that only one device appended to", () => {
    const rows = mergeRows("one", "one\ntwo");
    expect(hunkCount(rows)).toBe(1);
    expect(mergeWith(rows, () => "both")).toBe("one\ntwo");
    expect(mergeWith(rows, () => "mine")).toBe("one");
  });

  it("says there is nothing to decide when the copies are identical", () => {
    expect(hunkCount(mergeRows(mine, mine))).toBe(0);
  });
});
