/**
 * Deleted notes keep their deletion time in the file name: "Plan.md" becomes "Plan (trashed 1730200000).md".
 * File dates can't say when a note was deleted, and a name travels with the file when Syncthing copies the trash.
 */
export function stampName(name: string, secs: number): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? `${name.slice(0, dot)} (trashed ${secs})${name.slice(dot)}` : `${name} (trashed ${secs})`;
}

const NEW = /^(.*) \(trashed (\d{9,})\)(\.[^./]*)?$/;
const OLD = /^(\d{9,})-(.+)$/;

export function unstampName(name: string): { name: string; deletedAt: number | null } {
  const n = NEW.exec(name);
  if (n) return { name: `${n[1]}${n[3] ?? ""}`, deletedAt: Number(n[2]) };
  const o = OLD.exec(name); // an older format: "<seconds>-name.md"
  if (o) return { name: o[2], deletedAt: Number(o[1]) };
  return { name, deletedAt: null };
}

const split = (p: string) => {
  const i = p.lastIndexOf("/");
  return [i < 0 ? "" : p.slice(0, i + 1), i < 0 ? p : p.slice(i + 1)] as const;
};
export const stampPath = (path: string, secs: number) => {
  const [dir, file] = split(path);
  return dir + stampName(file, secs);
};
export function unstampPath(path: string): { path: string; deletedAt: number | null } {
  const [dir, file] = split(path);
  const u = unstampName(file);
  return { path: dir + u.name, deletedAt: u.deletedAt };
}

/** Whole days left before a trashed note is deleted for good, or null if it has no clock yet. */
export function daysLeft(path: string, nowMs: number, keepDays: number): number | null {
  const { deletedAt } = unstampPath(path);
  if (deletedAt === null || keepDays <= 0) return null;
  return Math.max(0, Math.ceil(keepDays - (nowMs - deletedAt * 1000) / 864e5));
}

/** Splits the trash into notes to delete now, and old unstamped notes whose clock should start today. */
export function planTrashCleanup(paths: string[], nowMs: number, keepDays: number) {
  const purge: string[] = [];
  const stamp: string[] = [];
  if (keepDays <= 0) return { purge, stamp };
  for (const p of paths) {
    const { deletedAt } = unstampPath(p);
    if (deletedAt === null) stamp.push(p);
    else if (nowMs - deletedAt * 1000 > keepDays * 864e5) purge.push(p);
  }
  return { purge, stamp };
}
