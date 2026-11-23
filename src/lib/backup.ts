import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { fmt } from "./dates";

export const backupName = (d: Date = new Date()) => `atonacht-backup-${fmt(d)}.zip`;
const SETTINGS = ".atonacht/settings.json";

/** A path a backup may carry: no "..", no empty segment, nothing hidden except the trash folder. */
const carryable = (p: string) => !p.split("/").some((s) => s === ".." || s === "" || (s.startsWith(".") && s !== ".trash"));

/**
 * Every note (including templates and conflict copies), the pictures and files they link, and your settings, as a plain
 * ZIP. Attachments go in at their own paths, so a restore puts them back where the links already point.
 */
export function buildBackup(notes: Record<string, string>, settings: unknown, attachments: Record<string, Uint8Array> = {}): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const [p, c] of Object.entries(notes)) files[p] = strToU8(c);
  for (const [p, bytes] of Object.entries(attachments)) if (carryable(p) && !/\.md$/i.test(p)) files[p] = bytes;
  files[SETTINGS] = strToU8(JSON.stringify(settings, null, 2));
  return zipSync(files, { level: 6 });
}

export function readBackup(bytes: Uint8Array): { notes: Record<string, string>; settings: unknown | null; attachments: Record<string, Uint8Array> } {
  const raw = unzipSync(bytes);
  const notes: Record<string, string> = {};
  const attachments: Record<string, Uint8Array> = {};
  let settings: unknown | null = null;
  for (const [p, data] of Object.entries(raw)) {
    if (p === SETTINGS) {
      try { settings = JSON.parse(strFromU8(data)); } catch { settings = null; }
    } else if (/\.md$/i.test(p) && carryable(p)) {
      notes[p] = strFromU8(data);
    } else if (carryable(p)) {
      // Everything else is an attachment: a picture from Attachments/, or a file a note links to. Bytes, not text.
      attachments[p] = data;
    }
  }
  return { notes, settings, attachments };
}
