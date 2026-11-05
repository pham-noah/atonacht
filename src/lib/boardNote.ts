import { addDays, nextOccurrence } from "./dates";
import { eolOf } from "./tasks";

/**
 * Project boards are ordinary notes in the format used by Obsidian's Kanban plugin, so the same file works in both apps:
 *
 *   ---
 *
 *   kanban-plugin: basic
 *
 *   ---
 *
 *   ## Doing
 *
 *   - [ ] A card
 *
 *   ## Done
 *
 *   **Complete**
 *
 *   - [x] A finished card
 *
 *   %% kanban:settings
 *   ```
 *   {"kanban-plugin":"basic"}
 *   ```
 *   %%
 *
 * Columns are "##" headings and cards are list items under them. The order of cards in the file is their order on the board.
 */

export interface BoardCard {
  start: number; // first line (index into the note's lines)
  end: number; // one past the last line, including indented lines that belong to the card
  text: string; // the first line without the bullet and checkbox
  checkbox: boolean;
  done: boolean;
}
export interface BoardColumn {
  title: string;
  heading: number; // line index of the "## Title" line
  end: number; // one past the last line of the column
  complete: boolean; // moving a card here checks it
  cards: BoardCard[];
}
export interface ParsedBoard {
  lines: string[];
  eol: string;
  columns: BoardColumn[];
  tail: number; // where the archive and settings footer start (kept exactly as is)
}

const FOOTER = /^%%\s*kanban:settings/;
const HEADING = /^##\s+(.*?)\s*$/;
const ITEM = /^[-*+]\s+(?:\[([ xX])\]\s?)?(.*)$/;
const COMPLETE_MARK = /^\*\*Complete\*\*\s*$/;
const COMPLETE_TITLE = /^(done|complete|completed)$/i;

export function isKanbanNote(content: string): boolean {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  return !!fm && /^\s*kanban-plugin\s*:/m.test(fm[1]);
}

export function parseBoard(content: string): ParsedBoard {
  const eol = eolOf(content);
  const lines = content.split(/\r?\n/);
  let body = 0;
  if (lines[0] === "---") {
    body = 1;
    while (body < lines.length && lines[body] !== "---") body++;
    body++;
  }
  let tail = lines.length;
  for (let k = body; k < lines.length; k++) {
    if (/^\*\*\*\s*$/.test(lines[k]) || FOOTER.test(lines[k])) {
      tail = k;
      break;
    }
  }
  const heads: number[] = [];
  for (let k = body; k < tail; k++) if (HEADING.test(lines[k])) heads.push(k);
  const columns: BoardColumn[] = heads.map((h, i) => {
    const end = i + 1 < heads.length ? heads[i + 1] : tail;
    const title = HEADING.exec(lines[h])![1];
    const col: BoardColumn = { title, heading: h, end, complete: COMPLETE_TITLE.test(title), cards: [] };
    let last: BoardCard | null = null;
    for (let k = h + 1; k < end; k++) {
      const line = lines[k];
      if (COMPLETE_MARK.test(line)) {
        col.complete = true;
        last = null;
        continue;
      }
      const m = ITEM.exec(line);
      if (m) {
        last = { start: k, end: k + 1, text: m[2], checkbox: m[1] !== undefined, done: m[1] !== undefined && m[1] !== " " };
        col.cards.push(last);
      } else if (/^\s+\S/.test(line) && last) last.end = k + 1; // an indented line continues the card above
      else if (line.trim() !== "") last = null;
    }
    // trailing blank lines belong between columns, not to the last card
    for (const c of col.cards) while (c.end > c.start + 1 && lines[c.end - 1].trim() === "") c.end--;
    return col;
  });
  return { lines, eol, columns, tail };
}

export function newBoard(columns: string[] = ["To do", "Doing", "Done"]): string {
  const cols = columns.map((c, i) => `## ${c}\n\n${i === columns.length - 1 && COMPLETE_TITLE.test(c) ? "**Complete**\n\n" : ""}`).join("");
  return `---\n\nkanban-plugin: basic\n\n---\n\n${cols}\n\n%% kanban:settings\n\`\`\`\n{"kanban-plugin":"basic"}\n\`\`\`\n%%\n`;
}

/** Where a new card goes in a column that has none: after the heading, a blank line and the "Complete" marker. */
function firstSlot(lines: string[], col: BoardColumn): number {
  let i = col.heading + 1;
  while (i < col.end && lines[i].trim() === "") i++;
  if (i < col.end && COMPLETE_MARK.test(lines[i])) {
    i++;
    while (i < col.end && lines[i].trim() === "") i++;
  }
  return i;
}

function insertAt(lines: string[], at: number, cardLines: string[]) {
  lines.splice(at, 0, ...cardLines);
  const after = at + cardLines.length;
  if (after < lines.length && (HEADING.test(lines[after]) || FOOTER.test(lines[after]))) lines.splice(after, 0, ""); // keep a blank line before the next heading
  if (at > 0 && lines[at - 1] !== "" && HEADING.test(lines[at - 1])) lines.splice(at, 0, ""); // and one after a heading
}

const CHECK = /^(\s*[-*+]\s+)\[([ xX])\](\s?)(.*)$/;
const DUE = /@due\((\d{4}-\d{2}-\d{2})\)/;
const REPEAT = /@repeat\(([^)]+)\)/;
const DONE = /\s*@done\(\d{4}-\d{2}-\d{2}\)/;

export interface BoardOps {
  today: string;
  repeatFrom?: "due" | "completion";
}

/** The slot (index in lines) where card `index` of column `col` would be inserted. */
function slot(p: ParsedBoard, col: number, index: number): number {
  const c = p.columns[col];
  if (index < c.cards.length) return c.cards[index].start;
  if (c.cards.length) return c.cards[c.cards.length - 1].end;
  return firstSlot(p.lines, c);
}

/**
 * Moves a card to another column, or to another place in the same column (`to.index` is the position among that column's
 * cards, counted before the card is taken out). Entering a "complete" column checks the card and stamps @done;
 * leaving it unchecks the card. A repeating card that is completed adds its next round to the first column.
 */
export function moveCard(content: string, from: { col: number; card: number }, to: { col: number; index: number }, ops: BoardOps): string {
  const p = parseBoard(content);
  const card = p.columns[from.col]?.cards[from.card];
  if (!card || !p.columns[to.col]) return content;
  let index = to.index;
  if (to.col === from.col && index > from.card) index--; // the card itself no longer counts
  const moved = p.lines.slice(card.start, card.end);
  const lines = p.lines.slice();
  lines.splice(card.start, card.end - card.start);
  if (card.start < lines.length && lines[card.start] === "" && (card.start === 0 || lines[card.start - 1] === "")) lines.splice(card.start, 1); // no double gaps where it left
  const q = parseBoard(lines.join(p.eol));
  const at = slot(q, to.col, Math.min(index, q.columns[to.col].cards.length));
  insertAt(q.lines, at, moved);
  let out = q.lines;

  const dest = q.columns[to.col];
  const firstLine = out.indexOf(moved[0], at);
  const m = CHECK.exec(out[firstLine]);
  if (m) {
    const done = m[2] !== " ";
    if (dest.complete && !done) {
      const text = m[4];
      out[firstLine] = `${m[1]}[x]${m[3]}${text}${DONE.test(text) ? "" : ` @done(${ops.today})`}`;
      const rule = REPEAT.exec(text)?.[1];
      const due = DUE.exec(text)?.[1];
      const next = rule && due ? nextOccurrence(ops.repeatFrom === "completion" ? ops.today : due, rule) : null;
      if (next) {
        const again = `- [ ] ${text.replace(DUE, `@due(${next})`).replace(DONE, "")}`;
        const r = parseBoard(out.join(p.eol));
        const first = r.columns.findIndex((c) => !c.complete);
        if (first >= 0) {
          insertAt(r.lines, slot(r, first, r.columns[first].cards.length), [again]);
          out = r.lines;
        }
      }
    } else if (!dest.complete && done) {
      out[firstLine] = `${m[1]}[ ]${m[3]}${m[4].replace(DONE, "")}`;
    }
  }
  return out.join(p.eol);
}

export function addCard(content: string, col: number, text: string): string {
  const p = parseBoard(content);
  if (!p.columns[col] || !text.trim()) return content;
  insertAt(p.lines, slot(p, col, p.columns[col].cards.length), [`- [ ] ${text.trim()}`]);
  return p.lines.join(p.eol);
}

export function editCard(content: string, col: number, card: number, text: string): string {
  const p = parseBoard(content);
  const c = p.columns[col]?.cards[card];
  if (!c || !text.trim()) return content;
  p.lines[c.start] = p.lines[c.start].replace(/^(\s*[-*+]\s+(?:\[[ xX]\]\s?)?).*$/, `$1${text.trim()}`);
  return p.lines.join(p.eol);
}

export function deleteCard(content: string, col: number, card: number): string {
  const p = parseBoard(content);
  const c = p.columns[col]?.cards[card];
  if (!c) return content;
  p.lines.splice(c.start, c.end - c.start);
  return p.lines.join(p.eol);
}

export function addColumn(content: string, title: string): string {
  const p = parseBoard(content);
  const name = title.trim();
  if (!name || p.columns.some((c) => c.title.toLowerCase() === name.toLowerCase())) return content;
  let at = p.tail;
  while (at > 0 && p.lines[at - 1].trim() === "") at--;
  p.lines.splice(at, 0, "", `## ${name}`, "");
  return p.lines.join(p.eol);
}

export function renameColumn(content: string, col: number, title: string): string {
  const p = parseBoard(content);
  const c = p.columns[col];
  if (!c || !title.trim()) return content;
  p.lines[c.heading] = `## ${title.trim()}`;
  return p.lines.join(p.eol);
}

/** Removes a column. Only allowed when it has no cards, so nothing is lost. */
export function deleteColumn(content: string, col: number): string {
  const p = parseBoard(content);
  const c = p.columns[col];
  if (!c || c.cards.length) return content;
  p.lines.splice(c.heading, c.end - c.heading);
  return p.lines.join(p.eol);
}

/** Shown in lists: the board's file name. */
export const boardTitle = (path: string) => path.split("/").pop()!.replace(/\.md$/, "");
export const tomorrow = (d: string) => addDays(d, 1);
