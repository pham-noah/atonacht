export interface ConflictName {
  original: string; // path of the note that conflicted
  stamp: string; // "2026-10-29 10:15"
  device: string; // Syncthing's short device id
}

// Syncthing names conflict copies like: "Note.sync-conflict-20261029-101500-ABCDEFG.md"
const RE = /^(.*)\.sync-conflict-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-([A-Z0-9]+)(\.[^./]+)?$/;

export function parseConflict(path: string): ConflictName | null {
  const m = RE.exec(path);
  if (!m) return null;
  return {
    original: `${m[1]}${m[9] ?? ""}`,
    stamp: `${m[2]}-${m[3]}-${m[4]} ${m[5]}:${m[6]}`,
    device: m[8],
  };
}

export const isConflictPath = (p: string) => RE.test(p);

/** Where "keep both" saves the other version. */
export function conflictCopyPath(original: string, stamp: string): string {
  const dot = original.lastIndexOf(".");
  const base = dot > original.lastIndexOf("/") ? original.slice(0, dot) : original;
  const ext = dot > original.lastIndexOf("/") ? original.slice(dot) : "";
  return `${base} (conflict ${stamp.slice(0, 10)})${ext}`;
}
