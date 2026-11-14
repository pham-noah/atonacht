/**
 * Where a link in a note actually goes: somewhere outside the app, or a note in this folder.
 *
 * A note arrives through Syncthing from another device, so its links are not trusted: only `http:`, `https:` and
 * `mailto:` are ever handed to the system, and anything else (`javascript:`, `file:`, `data:`, a relative path)
 * stays plain text. A wiki link resolves the same way the backlink index resolves it — by file name or by title.
 */

import { noteKeys } from "./backlinks";

const ALLOWED = /^(https?:\/\/|mailto:)/i;

/** The URL to open for a Markdown link target, or null when it is not one we open. */
export function externalHref(raw: string): string | null {
  const url = raw.trim();
  if (!url || !ALLOWED.test(url)) return null;
  // a URL carrying spaces, angle brackets or quotes is malformed, and escaping it into an attribute is not worth it
  if (/[\s<>"`\\]/.test(url)) return null;
  return url;
}

/** Every name and title a note answers to → the note. Same keys as `buildLinks`, so a click lands where the index says. */
export function noteIndex(paths: string[], titles: Record<string, string>): Map<string, string> {
  const map = new Map<string, string>();
  for (const path of paths) for (const key of noteKeys(path, titles[path] ?? "")) map.set(key, path);
  return map;
}

/** The note a `[[name]]` points at, or undefined when no note has that name. */
export function noteFor(name: string, index: Map<string, string>): string | undefined {
  return index.get(name.trim().toLowerCase());
}
