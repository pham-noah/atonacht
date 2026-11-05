import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { fmt } from "./dates";

export const backupName = (d: Date = new Date()) => `atonacht-backup-${fmt(d)}.zip`;
const SETTINGS = ".atonacht/settings.json";

/** Every note (including templates and conflict copies) plus your settings, as a plain ZIP. */
export function buildBackup(notes: Record<string, string>, settings: unknown): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const [p, c] of Object.entries(notes)) files[p] = strToU8(c);
  files[SETTINGS] = strToU8(JSON.stringify(settings, null, 2));
  return zipSync(files, { level: 6 });
}

export function readBackup(bytes: Uint8Array): { notes: Record<string, string>; settings: unknown | null } {
  const raw = unzipSync(bytes);
  const notes: Record<string, string> = {};
  let settings: unknown | null = null;
  for (const [p, data] of Object.entries(raw)) {
    if (p === SETTINGS) {
      try { settings = JSON.parse(strFromU8(data)); } catch { settings = null; }
    } else if (/\.md$/i.test(p) && !p.split("/").some((s) => s === ".." || s === "" || (s.startsWith(".") && s !== ".trash"))) {
      notes[p] = strFromU8(data);
    }
  }
  return { notes, settings };
}
