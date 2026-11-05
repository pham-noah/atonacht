const FM = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** Number of lines taken by a leading front-matter block (0 if none). */
export function frontmatterLines(content: string): number {
  const m = FM.exec(content);
  return m ? m[0].split(/\r?\n/).length - (m[0].endsWith("\n") ? 1 : 0) : 0;
}

export const stripFrontmatter = (content: string) => content.replace(FM, "");

export const isPinned = (content: string) => {
  const m = FM.exec(content);
  return !!m && /^pinned:\s*true\s*$/im.test(m[1]);
};

/** Pinning is stored in the note itself (`pinned: true`), so it syncs with the file. */
export function setPinned(content: string, pinned: boolean): string {
  const eol = content.includes("\r\n") ? "\r\n" : "\n"; // keep the note's own line endings
  const m = FM.exec(content);
  if (!m) return pinned ? `---${eol}pinned: true${eol}---${eol}${content}` : content;
  const rest = m[1].split(/\r?\n/).filter((l) => !/^pinned:/i.test(l));
  if (pinned) rest.push("pinned: true");
  const body = content.slice(m[0].length);
  return rest.length ? `---${eol}${rest.join(eol)}${eol}---${eol}${body}` : body;
}
