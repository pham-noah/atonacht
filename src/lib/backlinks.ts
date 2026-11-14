/** Wiki links and tags are already rendered in a note; this is the index behind them. */

const LINK = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;
const TAG = /(^|\s)#([\p{L}\p{N}_-]+)/gu;

/** The note names a note points at, trimmed and in the order they appear. */
export function linksIn(content: string): string[] {
  const out: string[] = [];
  for (const m of content.matchAll(LINK)) {
    const name = m[1].trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/** A whole wiki link: the name, then whatever follows it — `|alias` or `#heading`. */
const LINK_FULL = /\[\[([^\]|#]+)((?:[|#][^\]]*)?)\]\]/g;

/**
 * Rewrites the links that pointed at an old note name, so renaming `Idea.md` does not leave every note that said
 * `[[Idea]]` pointing at nothing. Aliases and headings survive: `[[Idea|the plan]]` → `[[Ideas|the plan]]`.
 * Only the name is compared, case-insensitively, so an unrelated link is never touched.
 */
export function rewriteLinks(content: string, fromNames: string[], toName: string): string {
  const keys = new Set(fromNames.map((n) => n.trim().toLowerCase()).filter(Boolean));
  if (keys.size === 0) return content;
  return content.replace(LINK_FULL, (whole, name: string, rest: string) =>
    keys.has(name.trim().toLowerCase()) ? `[[${toName}${rest}]]` : whole,
  );
}

export function tagsIn(content: string): string[] {
  const out = new Set<string>();
  for (const m of content.matchAll(TAG)) out.add(m[2].toLowerCase());
  return [...out];
}

/** "Note.md" and "Daily notes/2026-11-05.md" both answer to "2026-11-05" and to their title. */
export function noteKeys(path: string, title: string): string[] {
  const base = path.split("/").pop()!.replace(/\.md$/i, "");
  const keys = [base.toLowerCase()];
  const t = title.trim().toLowerCase();
  if (t && !keys.includes(t)) keys.push(t);
  return keys;
}

export interface Backlinks {
  /** note path → the notes that link to it */
  incoming: Record<string, string[]>;
  /** note path → the note names it links to that exist in the folder */
  outgoing: Record<string, string[]>;
}

/**
 * One pass over the folder. A link matches by file name or by title, which is what someone typing `[[My note]]` means;
 * links to notes that do not exist are kept in `outgoing` so the editor can show them as missing.
 */
export function buildLinks(notes: Record<string, string>, titles: Record<string, string>): Backlinks {
  const byKey = new Map<string, string>();
  for (const path of Object.keys(notes)) for (const key of noteKeys(path, titles[path] ?? "")) byKey.set(key, path);

  const incoming: Record<string, string[]> = {};
  const outgoing: Record<string, string[]> = {};
  for (const [path, content] of Object.entries(notes)) {
    const names = linksIn(content);
    outgoing[path] = names;
    for (const name of names) {
      const target = byKey.get(name.trim().toLowerCase());
      if (!target || target === path) continue;
      (incoming[target] ??= []).push(path);
    }
  }
  return { incoming, outgoing };
}

export interface TagCount {
  tag: string;
  count: number;
  paths: string[];
}

export function tagIndex(notes: Record<string, string>): TagCount[] {
  const map = new Map<string, string[]>();
  for (const [path, content] of Object.entries(notes)) {
    for (const tag of tagsIn(content)) {
      const list = map.get(tag) ?? [];
      list.push(path);
      map.set(tag, list);
    }
  }
  return [...map.entries()]
    .map(([tag, paths]) => ({ tag, count: paths.length, paths }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
