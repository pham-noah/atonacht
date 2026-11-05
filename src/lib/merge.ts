import { diffLines } from "./diff";

/** Lines the two versions agree on, or a hunk where they differ. */
export type MergeRow = { kind: "same"; lines: string[] } | { kind: "hunk"; id: number; mine: string[]; theirs: string[] };

export type Pick = "mine" | "theirs" | "both";

/**
 * Splits two versions of a note into unchanged runs and hunks.
 *
 * Syncthing itself never merges: it keeps both files, and merging can only happen in an editor. This is that editor's
 * data: the smallest set of decisions a person has to make, with everything else already agreed.
 */
export function mergeRows(mine: string, theirs: string): MergeRow[] {
  const rows: MergeRow[] = [];
  let same: string[] = [];
  let inHunk = false;
  let id = 0;
  let cur: { kind: "hunk"; id: number; mine: string[]; theirs: string[] } | null = null;

  const closeHunk = () => {
    if (cur) rows.push(cur);
    cur = null;
    inHunk = false;
  };
  const flushSame = () => {
    if (same.length) rows.push({ kind: "same", lines: same });
    same = [];
  };

  for (const line of diffLines(mine, theirs)) {
    if (line.type === "same") {
      if (inHunk) closeHunk();
      same.push(line.text);
      continue;
    }
    if (!inHunk) {
      flushSame();
      cur = { kind: "hunk", id: id++, mine: [], theirs: [] };
      inHunk = true;
    }
    if (line.type === "del") cur!.mine.push(line.text);
    else cur!.theirs.push(line.text);
  }
  if (inHunk) closeHunk();
  flushSame();
  return rows;
}

/** The merged text, with one decision per hunk. "both" keeps this device's lines first, then the other device's. */
export function mergeWith(rows: MergeRow[], pick: (id: number) => Pick): string {
  const out: string[] = [];
  for (const row of rows) {
    if (row.kind === "same") {
      out.push(...row.lines);
      continue;
    }
    const how = pick(row.id);
    if (how === "mine") out.push(...row.mine);
    else if (how === "theirs") out.push(...row.theirs);
    else out.push(...row.mine, ...row.theirs);
  }
  return out.join("\n");
}

/** How many hunks need a decision — the size of the job before any merging starts. */
export const hunkCount = (rows: MergeRow[]) => rows.filter((r) => r.kind === "hunk").length;
