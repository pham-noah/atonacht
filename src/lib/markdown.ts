import { shortDate } from "./dates";
import { frontmatterLines, stripFrontmatter } from "./frontmatter";
import { externalHref } from "./links";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(raw: string): string {
  let s = esc(raw);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  s = s.replace(/\[\[([^\]]+)\]\]/g, '<a class="wl" data-link="$1">$1</a>');
  // an image in the folder: rendered by the editor once it has read the bytes (see attachSrc)
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, src: string) =>
    `<img class="attach" data-attach="${src}" alt="${alt}" />`);
  // [text](url): a real link when the scheme is one we open, otherwise it stays exactly as written (see links.ts)
  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (whole, text: string, href: string) => {
    const url = externalHref(href);
    return url ? `<a class="ext" href="${url}" data-href="${url}" rel="noopener noreferrer">${text}</a>` : whole;
  });
  s = s.replace(/@due\((\d{4}-\d{2}-\d{2})\)/g, (_, d) => `<span class="chip">due ${shortDate(d)}</span>`);
  s = s.replace(/@repeat\(([^)]+)\)/g, '<span class="chip">↻ $1</span>');
  s = s.replace(/(^|\s)!(high|med|low)\b/g, '$1<span class="chip hi">$2</span>');
  s = s.replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu, '$1<span class="chip">#$2</span>');
  return s;
}

/** One rendered block, with the source lines it came from (0-based, inclusive). */
export interface Block {
  html: string;
  from: number;
  to: number;
}

/**
 * Small, safe Markdown renderer. Task checkboxes carry data-line so clicks can toggle them, and every block
 * records the source lines it came from, so the preview can turn one line back into text for editing.
 */
export function renderBlocks(src: string): Block[] {
  const out: Block[] = [];
  let fenced = false;
  let para: { text: string[]; from: number; to: number } | null = null;
  const flush = () => {
    if (para) out.push({ html: `<p>${inline(para.text.join(" "))}</p>`, from: para.from, to: para.to });
    para = null;
  };
  const skip = frontmatterLines(src);
  src.split(/\r?\n/).forEach((line, i) => {
    if (i < skip) return;
    if (/^\s*```/.test(line)) {
      flush();
      fenced = !fenced;
      return;
    }
    if (fenced) return void out.push({ html: `<pre>${esc(line)}</pre>`, from: i, to: i });
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const t = /^(\s*)[-*+] \[([ xX])\] ?(.*)$/.exec(line);
    const li = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    if (h) {
      flush();
      out.push({ html: `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`, from: i, to: i });
    } else if (t) {
      flush();
      const done = t[2] !== " ";
      out.push({
        html: `<div class="md-task${done ? " done" : ""}" data-line="${i}" style="margin-left:${t[1].length * 8}px"><input type="checkbox" data-line="${i}"${done ? " checked" : ""}><span>${inline(t[3])}</span></div>`,
        from: i,
        to: i,
      });
    } else if (li) {
      flush();
      out.push({ html: `<div class="md-li" data-line="${i}" style="margin-left:${li[1].length * 8}px">• ${inline(li[2])}</div>`, from: i, to: i });
    } else if (line.trim() === "") flush();
    else {
      if (!para) para = { text: [], from: i, to: i };
      para.text.push(line.trim());
      para.to = i;
    }
  });
  flush();
  return out;
}

export function renderMarkdown(src: string): string {
  return renderBlocks(src).map((b) => b.html).join("\n");
}

/** The source lines `from..to` (0-based, inclusive) of a note. */
export function sourceLines(src: string, from: number, to: number): string {
  return src.split(/\r?\n/).slice(from, to + 1).join("\n");
}

/** A copy of `src` where source lines `from..to` (0-based, inclusive) are replaced by `text`. */
export function replaceLines(src: string, from: number, to: number, text: string): string {
  const eol = src.includes("\r\n") ? "\r\n" : "\n";
  const lines = src.split(/\r?\n/);
  const insert = text.split(/\r?\n/);
  return [...lines.slice(0, from), ...insert, ...lines.slice(to + 1)].join(eol);
}

/** First "# heading", else the file name. */
export function noteTitle(path: string, content: string): string {
  const h = /^#\s+(.+)$/m.exec(stripFrontmatter(content));
  if (h) return h[1].trim();
  return path.split("/").pop()!.replace(/\.md$/, "");
}

export function snippet(content: string, max = 90): string {
  const body = stripFrontmatter(content)
    .split(/\r?\n/)
    .filter((l) => l.trim() && !/^#/.test(l) && !/^\s*[-*+] \[[ xX>]\]/.test(l))
    .join(" ")
    .replace(/\s+/g, " ");
  return body.length > max ? body.slice(0, max - 1) + "…" : body;
}
