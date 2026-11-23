import { today } from "./dates";

export interface ConflictName {
  original: string; // path of the note that conflicted
  stamp: string; // "2026-10-29 10:15", or "" for a GitHub copy (the store fills it from the file's mtime)
  device: string; // Syncthing's short device id, or "GitHub"
  source: ConflictSource;
}

export type ConflictSource = "syncthing" | "github";

// Syncthing names conflict copies like: "Note.sync-conflict-20261029-101500-ABCDEFG.md"
const RE = /^(.*)\.sync-conflict-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-([A-Z0-9]+)(\.[^./]+)?$/;

// GitHub sync writes the remote version beside the local one when both sides changed (besidePath in githubSync.ts):
// "Note (github).md". That is the same choice a Syncthing copy offers, so it belongs in the same screen.
const GH = /^(.*) \(github\)(\.[^./]+)?$/;

export function parseConflict(path: string): ConflictName | null {
  const m = RE.exec(path);
  if (m) {
    return {
      original: `${m[1]}${m[9] ?? ""}`,
      stamp: `${m[2]}-${m[3]}-${m[4]} ${m[5]}:${m[6]}`,
      device: m[8],
      source: "syncthing",
    };
  }
  const g = GH.exec(path);
  if (g) return { original: `${g[1]}${g[2] ?? ""}`, stamp: "", device: "GitHub", source: "github" };
  return null;
}

export const isConflictPath = (p: string) => parseConflict(p) !== null;

// What "keep both" writes: "Note (conflict 2026-11-23).md", and "… (conflict 2026-11-23) 2.md" when taken.
const KEPT = /^(.*) \(conflict \d{4}-\d{2}-\d{2}\)(?: \d+)?(\.[^./]+)?$/;

/** A copy a person chose to keep. A local answer to a divergence — never something to push at anyone else. */
export const isKeptCopy = (p: string) => KEPT.test(p);

/** Where "keep both" saves the other version. */
export function conflictCopyPath(original: string, stamp: string): string {
  const dot = original.lastIndexOf(".");
  const base = dot > original.lastIndexOf("/") ? original.slice(0, dot) : original;
  const ext = dot > original.lastIndexOf("/") ? original.slice(dot) : "";
  // A Syncthing copy carries its own date; a GitHub copy is stamped from its mtime, and a caller with neither gets today.
  // Local day, not UTC: `new Date().toISOString()` is still yesterday until 02:00 east of Greenwich.
  const day = /\d{4}-\d{2}-\d{2}/.exec(stamp)?.[0] ?? today();
  return `${base} (conflict ${day})${ext}`;
}

/**
 * Where "keep both" saves the other version when that name is already taken — two conflicts for the same note, or the
 * same one resolved twice on the same day, would otherwise overwrite the copy kept first.
 */
export function freeCopyPath(original: string, stamp: string, taken: (p: string) => boolean): string {
  const first = conflictCopyPath(original, stamp);
  if (!taken(first)) return first;
  const dot = first.lastIndexOf(".");
  const stem = first.slice(0, dot);
  const ext = first.slice(dot);
  for (let i = 2; i < 100; i++) if (!taken(`${stem} ${i}${ext}`)) return `${stem} ${i}${ext}`;
  return `${stem} ${Date.now()}${ext}`;
}
