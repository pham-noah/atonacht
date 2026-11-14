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

/** A note split into lines: CRLF and LF split the same way, so a note edited on Windows renders the same. */
const splitLines = (src: string) => src.split(/\x0d?\n/);

const RULE = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const ORDERED = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
const DELIM_CELL = /^:?-+:?$/;

/** The cells of a `| a | b |` row, with the outer pipes dropped. */
function cells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

/** `|---|:--:|` — the line under a table's header row. Null when the line is not one. */
function headerRule(line: string): string[] | null {
  if (!line.includes("|")) return null;
  const cs = cells(line);
  return cs.length >= 2 && cs.every((c) => DELIM_CELL.test(c)) ? cs : null;
}

const alignment = (cell: string) => {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  return left && right ? "center" : right ? "right" : left ? "left" : "";
};

/**
 * Small, safe Markdown renderer. Task checkboxes carry data-line so clicks can toggle them, and every block
 * records the source lines it came from, so the preview can turn one line back into text for editing.
 */
export function renderBlocks(src: string): Block[] {
  const out: Block[] = [];
  const lines = splitLines(src);
  let fenced = false;
  let para: { text: string[]; from: number; to: number } | null = null;
  let quote: { text: string[]; from: number; to: number } | null = null;
  // a paragraph and a blockquote are never open at the same time, so one flush closes whichever is
  const flush = () => {
    if (para) out.push({ html: `<p>${inline(para.text.join(" "))}</p>`, from: para.from, to: para.to });
    if (quote) out.push({ html: `<blockquote>${inline(quote.text.join(" "))}</blockquote>`, from: quote.from, to: quote.to });
    para = null;
    quote = null;
  };
  const skip = frontmatterLines(src);
  for (let i = skip; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      flush();
      fenced = !fenced;
      continue;
    }
    if (fenced) {
      out.push({ html: `<pre>${esc(line)}</pre>`, from: i, to: i });
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const t = /^(\s*)[-*+] \[([ xX])\] ?(.*)$/.exec(line);
    const li = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    const ol = ORDERED.exec(line);
    const q = QUOTE.exec(line);
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
    } else if (ol) {
      // the number is kept as written: restarting or skipping numbers is a choice the note has already made
      flush();
      out.push({
        html: `<div class="md-li md-ol" data-line="${i}" style="margin-left:${ol[1].length * 8}px"><span class="num">${ol[2]}.</span>${inline(ol[3])}</div>`,
        from: i,
        to: i,
      });
    } else if (RULE.test(line)) {
      flush();
      out.push({ html: `<hr data-line="${i}" />`, from: i, to: i });
    } else if (line.includes("|") && headerRule(lines[i + 1] ?? "")) {
      flush();
      const align = headerRule(lines[i + 1] ?? "")!.map(alignment);
      const row = (cs: string[], tag: "th" | "td") =>
        `<tr>${cs.map((c, k) => `<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ""}>${inline(c)}</${tag}>`).join("")}</tr>`;
      const body: string[] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].includes("|") && lines[j].trim() !== "") {
        body.push(row(cells(lines[j]), "td"));
        j++;
      }
      out.push({
        html: `<div class="md-table"><table><thead>${row(cells(line), "th")}</thead>${body.length ? `<tbody>${body.join("")}</tbody>` : ""}</table></div>`,
        from: i,
        to: j - 1,
      });
      i = j - 1; // the loop's own i++ lands on the first line after the table
    } else if (q) {
      if (para) flush(); // a quote starts a block of its own
      if (!quote) quote = { text: [], from: i, to: i };
      quote.text.push(q[1].trim());
      quote.to = i;
    } else if (line.trim() === "") flush();
    else {
      if (quote) flush();
      if (!para) para = { text: [], from: i, to: i };
      para.text.push(line.trim());
      para.to = i;
    }
  }
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
  const body = splitLines(stripFrontmatter(content))
    .filter((l) => l.trim() && !/^#/.test(l) && !/^\s*[-*+] \[[ xX>]\]/.test(l))
    .join(" ")
    .replace(/\s+/g, " ");
  return body.length > max ? body.slice(0, max - 1) + "…" : body;
}

/** A search hit cut into the text before it, the term itself, and the text after, so the row can mark the term. */
export interface Hit {
  before: string;
  hit: string;
  after: string;
}

/**
 * The line of a note that holds the search term, cut to `max` characters around it. A result row shows this
 * instead of the note's opening line, which says nothing about why the note matched.
 */
export function matchSnippet(content: string, term: string, max = 90): Hit | null {
  const q = term.trim().toLowerCase();
  if (!q) return null;
  for (const raw of splitLines(stripFrontmatter(content))) {
    const text = raw.trim();
    const at = text.toLowerCase().indexOf(q);
    if (at < 0) continue;
    if (text.length <= max) return { before: text.slice(0, at), hit: text.slice(at, at + q.length), after: text.slice(at + q.length) };
    // a long line is windowed around the hit rather than cut at the front: the term has to stay visible
    const start = Math.max(0, Math.min(at - Math.floor((max - q.length) / 2), text.length - max));
    const part = text.slice(start, start + max);
    const cut = at - start;
    return {
      before: (start > 0 ? "…" : "") + part.slice(0, cut),
      hit: part.slice(cut, cut + q.length),
      after: part.slice(cut + q.length) + (start + max < text.length ? "…" : ""),
    };
  }
  return null;
}
