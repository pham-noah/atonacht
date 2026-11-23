import { shortDate } from "./dates";
import { frontmatterLines, stripFrontmatter } from "./frontmatter";
import { externalHref } from "./links";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(raw: string): string {
  const kept: string[] = [];
  const hold = (html: string) => `\u0000${kept.push(html) - 1}\u0000`;
  // a backslash before punctuation is that character, not markup (CommonMark 2.4)
  let s = raw.replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, (_m, c: string) => hold(esc(c)));
  s = esc(s);
  // code first: what sits between backticks is never emphasised, linked or chipped
  s = s.replace(/`([^`\n]+)`/g, (_m, c: string) => hold(`<code>${c}</code>`));
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(?<![\w])__([^_]+)__(?![\w])/g, "<strong>$1</strong>");
  s = s.replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  // underscore emphasis only between non-word edges, so snake_case and file_names stay as written
  s = s.replace(/(?<![\w])_([^_\s][^_]*)_(?![\w])/g, "<em>$1</em>");
  s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  s = s.replace(/\[\[([^\]]+)\]\]/g, '<a class="wl" data-link="$1">$1</a>');
  // an image in the folder: rendered by the editor once it has read the bytes (see attachSrc)
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, src: string) =>
    `<img class="attach" data-attach="${src}" alt="${alt}" />`);
  // [text](url): a real link when the scheme is one we open, otherwise it stays exactly as written (see links.ts)
  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (whole, text: string, href: string) => {
    const url = externalHref(href);
    return url ? `<a class="ext" href="${url}" data-href="${url}" rel="noopener noreferrer">${text}</a>` : whole;
  });
  // <https://…> and <me@example.com>: a bare address in angle brackets is a link
  s = s.replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, (whole, url: string) => {
    const u = externalHref(url);
    return u ? `<a class="ext" href="${u}" data-href="${u}" rel="noopener noreferrer">${url}</a>` : whole;
  });
  s = s.replace(/&lt;([\w.+-]+@[\w-]+\.[\w.-]+)&gt;/g, (_m, mail: string) =>
    `<a class="ext" href="mailto:${mail}" data-href="mailto:${mail}" rel="noopener noreferrer">${mail}</a>`);
  s = s.replace(/@due\((\d{4}-\d{2}-\d{2})\)/g, (_, d) => `<span class="chip">due ${shortDate(d)}</span>`);
  // Every list stamps a finished task with the day it was done; the reading view used to leave that raw in the text.
  s = s.replace(/@done\((\d{4}-\d{2}-\d{2})\)/g, (_, d) => `<span class="chip done">done ${shortDate(d)}</span>`);
  s = s.replace(/@repeat\(([^)]+)\)/g, '<span class="chip">↻ $1</span>');
  s = s.replace(/(^|\s)!(high|med|low)\b/g, '$1<span class="chip hi">$2</span>');
  s = s.replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu, '$1<span class="chip">#$2</span>');
  return s.replace(/\u0000(\d+)\u0000/g, (_m, n: string) => kept[Number(n)]);
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
const QUOTE = /^ {0,3}((?:> ?)+)(.*)$/;
const ORDERED = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
const DELIM_CELL = /^:?-+:?$/;

/** A paragraph's lines, joined the way CommonMark does: a space, or a break when the line asked for one. */
function paraHtml(lines: { text: string; brk: boolean }[]): string {
  return lines
    .map((l, k) => inline(l.text) + (k === lines.length - 1 ? "" : l.brk ? "<br>" : " "))
    .join("");
}

/** One fenced block is one <pre>: a code sample used to arrive as one element per line. */
function pre(f: { lang: string; lines: string[] }): string {
  return `<pre${f.lang ? ` class="language-${esc(f.lang)}"` : ""}><code>${f.lines.map(esc).join("\n")}</code></pre>`;
}

/** A run of quotes, nested as deep as each line asked, so "> a" over "> > b" reads as a quote inside a quote. */
function quoteHtml(lines: { text: string; depth: number }[]): string {
  let html = "";
  let open = 0;
  for (const l of lines) {
    while (open < l.depth) {
      html += "<blockquote>";
      open++;
    }
    while (open > l.depth) {
      html += "</blockquote>";
      open--;
    }
    html += `${inline(l.text)} `;
  }
  html += "</blockquote>".repeat(open);
  return html.replace(/\s+(<\/?blockquote>)/g, "$1");
}

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
  let fenced: { lang: string; lines: string[]; from: number; to: number } | null = null;
  let para: { lines: { text: string; brk: boolean }[]; from: number; to: number } | null = null;
  let quote: { lines: { text: string; depth: number }[]; from: number; to: number } | null = null;
  // a paragraph and a blockquote are never open at the same time, so one flush closes whichever is
  const flush = () => {
    if (para) out.push({ html: `<p>${paraHtml(para.lines)}</p>`, from: para.from, to: para.to });
    if (quote) out.push({ html: quoteHtml(quote.lines), from: quote.from, to: quote.to });
    para = null;
    quote = null;
  };
  const skip = frontmatterLines(src);
  for (let i = skip; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      flush();
      if (fenced) {
        out.push({ html: pre(fenced), from: fenced.from, to: i });
        fenced = null;
      } else {
        fenced = { lang: line.trim().slice(3).trim(), lines: [], from: i, to: i };
      }
      continue;
    }
    if (fenced) {
      fenced.lines.push(line);
      fenced.to = i;
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    const t = /^(\s*)[-*+] \[([ xX])\] ?(.*)$/.exec(line);
    const li = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    const ol = ORDERED.exec(line);
    const q = QUOTE.exec(line);
    // "Title" over "=====" or "-----" is a heading, and it wins over the rule it would otherwise be
    const setext =
      para && para.to === i - 1 && /^ {0,3}(=+|-{3,})\s*$/.test(line)
        ? line.trim()[0] === "=" ? 1 : 2
        : 0;
    if (setext) {
      // the whole paragraph above the line becomes the heading: "One\ntwo\n===" is an h1 reading "One two"
      out.push({ html: `<h${setext}>${paraHtml(para!.lines)}</h${setext}>`, from: para!.from, to: i });
      para = null;
    } else if (h) {
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
      if (!quote) quote = { lines: [], from: i, to: i };
      quote.lines.push({ text: q[2].trim(), depth: (q[1].match(/>/g) ?? []).length || 1 });
      quote.to = i;
    } else if (line.trim() === "") flush();
    else {
      if (quote) flush();
      if (!para) para = { lines: [], from: i, to: i };
      // two trailing spaces or a backslash is a hard break (CommonMark 6.8); the backslash itself is not shown
      const bare = line.replace(/\s+$/, "");
      const hard = / {2,}$/.test(line) || bare.endsWith("\\");
      para.lines.push({ text: hard && bare.endsWith("\\") ? bare.slice(0, -1).trim() : line.trim(), brk: hard });
      para.to = i;
    }
  }
  flush();
  if (fenced) {
    // a fence that never closes keeps its lines; a trailing newline is not one of them
    const kept = fenced.lines.filter((l, k) => !(k === fenced!.lines.length - 1 && l === ""));
    out.push({ html: pre({ ...fenced, lines: kept }), from: fenced.from, to: fenced.to });
  }
  return out;
}

/** A heading with nothing under it is a promise reading mode should not make: the daily template ships Plan, Notes
 * and Done empty, and a fresh day then reads as three bold words above nothing. Deeper headings count as structure,
 * not content, so an empty section with an empty subsection goes too. Block indexes are preserved — the preview maps
 * them back to source lines to edit in place. */
export function emptySectionIndexes(blocks: Block[]): Set<number> {
  const level = (b: Block) => Number(/^<h([1-6])[\s>]/.exec(b.html)?.[1] ?? 0);
  const bare = (html: string) => html.replace(/<[^>]*>/g, "").replace(/&[a-z#0-9]+;/gi, "x").trim().length > 0
    || /<(img|pre|input|table|hr|blockquote)\b/.test(html);
  const drop = new Set<number>();
  for (let i = 0; i < blocks.length; i++) {
    const lv = level(blocks[i]);
    if (!lv || lv === 1) continue; // the title names the note and always stays
    let filled = false;
    for (let j = i + 1; j < blocks.length; j++) {
      const deeper = level(blocks[j]);
      if (deeper && deeper <= lv) break;
      if (!deeper && bare(blocks[j].html)) { filled = true; break; }
    }
    if (!filled) drop.add(i);
  }
  return drop;
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
  const body = snippetLine(content);
  return body.length > max ? body.slice(0, max - 1) + "…" : body;
}

/**
 * The one line a row shows, with every markdown marker taken off: a blockquote, a bullet, a numbered item, a
 * rule or a table pipe is scaffolding for the writer, not prose for the reader.
 */
function snippetLine(content: string): string {
  return splitLines(stripFrontmatter(content))
    .filter((l) => l.trim() && !/^#/.test(l) && !/^\s*[-*+] \[[ xX>]\]/.test(l))
    .map((l) => l.replace(/^\s*(?:>\s*)+/, "").replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").replace(/\s*!(high|med|low)\b/gi, ""))
    .filter((l) => l.trim() && !/^\s*([-*_]\s*){3,}$/.test(l) && !/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l))
    .map((l) => l.includes("|") ? l.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim()).filter(Boolean).join(" · ") : l)
    .filter((l) => l.trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the first line a row would show is a quote, so the row can draw it as one. */
export function snippetIsQuote(content: string): boolean {
  const line = splitLines(stripFrontmatter(content)).find((l) => l.trim() && !/^#/.test(l) && !/^\s*[-*+] \[[ xX>]\]/.test(l));
  return !!line && /^\s*>/.test(line);
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
