import { describe, expect, it } from "vitest";
import { folderCounts } from "../lib/fs";
import { nextOccurrence } from "../lib/dates";
import { addTask, editTask, groupTasks, parseTasks, toggleTask } from "../lib/tasks";
import { applyCarryOver, dailyPath, dailyTemplate, findCarryOver } from "../lib/daily";
import { conflictCopyPath, parseConflict } from "../lib/conflicts";
import { diffLines } from "../lib/diff";
import { matchSnippet, noteTitle, renderBlocks, renderMarkdown, snippet } from "../lib/markdown";
import { createMemFs } from "../lib/memFs";

describe("repeat rules", () => {
  it("handles daily, weekdays, weekly and monthly", () => {
    expect(nextOccurrence("2026-10-29", "daily")).toBe("2026-10-30");
    expect(nextOccurrence("2026-10-30", "weekdays")).toBe("2026-11-02"); // Fri -> Mon
    expect(nextOccurrence("2026-10-29", "weekly")).toBe("2026-11-05");
    expect(nextOccurrence("2026-10-29", "weekly:mon")).toBe("2026-11-02");
    expect(nextOccurrence("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(nextOccurrence("2026-10-29", "monthly:5")).toBe("2026-11-05");
    expect(nextOccurrence("2026-10-29", "nonsense")).toBeNull();
  });
});

describe("tasks", () => {
  const note = "# T\n\n## Plan\n- [ ] Draft methods @due(2026-10-30) !high #thesis [[Thesis]]\n- [x] Pay rent\n- [>] Moved away\n```\n- [ ] not a task\n```\n";
  it("parses metadata and skips code blocks and moved tasks", () => {
    const t = parseTasks("a.md", note);
    expect(t).toHaveLength(2);
    expect(t[0]).toMatchObject({ title: "Draft methods #thesis [[Thesis]]", due: "2026-10-30", priority: "high", tags: ["thesis"], links: ["Thesis"], done: false, line: 3 });
    expect(t[1].done).toBe(true);
  });
  it("toggles in place", () => {
    const out = toggleTask(note, 3);
    expect(out.split("\n")[3].startsWith("- [x] Draft")).toBe(true);
    expect(toggleTask(out, 3)).toBe(note);
  });
  it("creates the next repeating task when checked", () => {
    const c = "- [ ] Bus pass @due(2026-10-31) @repeat(monthly)\n";
    const out = toggleTask(c, 0).split("\n");
    expect(out[0]).toContain("[x]");
    expect(out[1]).toBe("- [ ] Bus pass @due(2026-11-30) @repeat(monthly)");
  });
  it("keeps CRLF line endings", () => {
    expect(toggleTask("- [ ] a\r\n- [ ] b\r\n", 1)).toBe("- [ ] a\r\n- [x] b\r\n");
  });
  it("edits a task line", () => {
    const out = editTask("- [ ] Call bank #home\n", 0, { due: "2026-11-01", priority: "med", repeat: "weekly" });
    expect(out).toBe("- [ ] Call bank #home @due(2026-11-01) @repeat(weekly) !med\n");
    expect(editTask(out, 0, { due: null, priority: null, repeat: null })).toBe("- [ ] Call bank #home\n");
  });
  it("adds under Plan, or appends a Plan section", () => {
    const d = dailyTemplate("2026-10-29");
    const out = addTask(addTask(d, "One"), "Two");
    expect(out).toContain("## Plan\n- [ ] One\n- [ ] Two\n\n## Notes");
    expect(addTask("# Plain\n\nText\n", "X")).toBe("# Plain\n\nText\n\n## Plan\n- [ ] X\n");
  });
  it("groups by due date", () => {
    const tasks = parseTasks("a.md", "- [ ] a @due(2026-10-28)\n- [ ] b @due(2026-10-29)\n- [ ] c @due(2026-11-02)\n- [ ] d @due(2026-12-01)\n- [ ] e\n- [x] f @due(2026-10-29)\n");
    const g = groupTasks(tasks, "2026-10-29");
    expect([g.overdue, g.today, g.week, g.later, g.nodate].map((x) => x.map((t) => t.title))).toEqual([["a"], ["b"], ["c"], ["d"], ["e"]]);
  });
});

describe("daily notes and carry-over", () => {
  it("carries open tasks from the latest earlier daily note", () => {
    const prev = "# Wed\n\n## Plan\n- [ ] A\n- [x] B\n- [ ] C @due(2026-10-30)\n";
    const notes = { [dailyPath("2026-10-28")]: prev, [dailyPath("2026-10-20")]: "- [ ] old\n", "x.md": "- [ ] ignore\n" };
    const c = findCarryOver(notes, "2026-10-29")!;
    expect(c.date).toBe("2026-10-28");
    expect(c.tasks.map((t) => t.title)).toEqual(["A", "C"]);
    const { today, prev: p2 } = applyCarryOver(dailyTemplate("2026-10-29"), prev, c.tasks);
    expect(today).toContain("- [ ] A\n- [ ] C @due(2026-10-30)");
    expect(p2).toContain("- [>] A");
    expect(parseTasks("p", p2).filter((t) => !t.done)).toHaveLength(0);
    expect(findCarryOver(notes, "2026-10-28")?.date).toBe("2026-10-20");
  });
});

describe("conflicts and diff", () => {
  it("parses Syncthing conflict names", () => {
    const c = parseConflict("Thesis/Outline.sync-conflict-20261029-101500-ABCDEFG.md")!;
    expect(c).toEqual({ original: "Thesis/Outline.md", stamp: "2026-10-29 10:15", device: "ABCDEFG" });
    expect(parseConflict("Thesis/Outline.md")).toBeNull();
    expect(conflictCopyPath(c.original, c.stamp)).toBe("Thesis/Outline (conflict 2026-10-29).md");
  });
  it("diffs lines", () => {
    const d = diffLines("a\nb\nc", "a\nx\nc");
    expect(d.map((l) => l.type)).toEqual(["same", "del", "add", "same"]);
  });
});

describe("markdown", () => {
  it("escapes html and renders tasks with line numbers", () => {
    const html = renderMarkdown("# Hi <b>\n- [ ] do **it** #x @due(2026-10-30)\n<script>alert(1)</script>");
    expect(html).toContain("&lt;b&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain('data-line="1"');
    expect(html).toContain("<strong>it</strong>");
    expect(html).toContain("due 30 Oct");
    expect(noteTitle("A/b.md", "no heading")).toBe("b");
  });
});

describe("markdown blocks the preview used to flatten", () => {
  it("renders a blockquote, an ordered list and a rule as themselves", () => {
    const note = "# Plan\n\n> ship it\n> and then some\n\n1. first\n2. second\n\n---\n";
    const blocks = renderBlocks(note);
    expect(blocks.find((b) => b.html.startsWith("<blockquote>"))).toEqual({
      html: "<blockquote>ship it and then some</blockquote>",
      from: 2,
      to: 3, // both lines, so double-click-to-edit rewrites the whole quote
    });
    expect(renderMarkdown(note)).toContain('<div class="md-li md-ol" data-line="5" style="margin-left:0px"><span class="num">1.</span>first</div>');
    expect(renderMarkdown(note)).toContain('<span class="num">2.</span>second');
    expect(renderMarkdown(note)).toContain('<hr data-line="8"');
  });

  it("renders a pipe table with its alignment, and keeps inline markup in the cells", () => {
    const note = "| Task | Due |\n|:--|--:|\n| Pay **rent** | 1 Dec |\n| Buy milk | — |\n";
    const blocks = renderBlocks(note);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].from).toBe(0);
    expect(blocks[0].to).toBe(3); // the whole table, not just the header
    const html = blocks[0].html;
    expect(html).toContain('<th style="text-align:left">Task</th>');
    expect(html).toContain('<th style="text-align:right">Due</th>');
    expect(html).toContain('<td style="text-align:left">Pay <strong>rent</strong></td>');
    expect(html).toContain('<td style="text-align:right">1 Dec</td>');
  });

  it("leaves a line with a pipe that is not a table alone", () => {
    expect(renderMarkdown("a | b\n\nnext")).toBe("<p>a | b</p>\n<p>next</p>");
    expect(renderMarkdown("a | b\n---")).toContain("<p>a | b</p>"); // --- under text is not a table's header rule
  });

  it("does not read a note's front matter as a rule or a table", () => {
    const html = renderMarkdown("---\npinned: true\n---\n# Hi\n");
    expect(html).toBe("<h1>Hi</h1>");
    expect(html).not.toContain("<hr");
  });

  it("keeps a quote and a paragraph from swallowing each other", () => {
    const html = renderMarkdown("> quoted\n\nplain\n> quoted again\n");
    expect(html).toBe("<blockquote>quoted</blockquote>\n<p>plain</p>\n<blockquote>quoted again</blockquote>");
  });
});

describe("the line a search hit is on", () => {
  const note = [...Array.from({ length: 39 }, (_, i) => `line ${i + 1}`), "- [ ] Pay rent by Friday"].join("\n");

  it("finds the matching line, not the opening one, and marks the term", () => {
    const hit = matchSnippet(note, "rent")!;
    expect(hit).toEqual({ before: "- [ ] Pay ", hit: "rent", after: " by Friday" });
    expect(snippet(note)).not.toContain("rent"); // the opening line says nothing about why it matched
  });

  it("windows a long line around the hit so the term stays visible", () => {
    const long = `${"a ".repeat(80)}rent${" b".repeat(80)}`;
    const hit = matchSnippet(long, "rent", 90)!;
    expect(hit.hit).toBe("rent");
    expect(hit.before.startsWith("…")).toBe(true);
    expect(hit.after.endsWith("…")).toBe(true);
    expect(hit.before.length + hit.hit.length + hit.after.length).toBeLessThanOrEqual(92);
  });

  it("says nothing when the term is only in the file name, so the row falls back to the opening line", () => {
    expect(matchSnippet("# Rent\n\nno mention here\n", "rent")).toEqual({ before: "# ", hit: "Rent", after: "" });
    expect(matchSnippet("# Other\n\nno mention here\n", "rent")).toBeNull();
    expect(matchSnippet("# Other\n\nrent is due\n", "  ")).toBeNull();
  });
});

describe("memory file system", () => {
  it("writes, lists, renames and trashes", async () => {
    const fs = createMemFs();
    await fs.write("", "Games/idea.md", "# x");
    await fs.rename("", "Games/idea.md", "Games/idea2.md");
    expect((await fs.list("")).map((e) => e.path).sort()).toEqual(["Games", "Games/idea2.md"]);
    await fs.remove("", "Games/idea2.md");
    expect((await fs.list("")).filter((e) => e.kind === "file")).toHaveLength(0);
    const [t1] = (await fs.listTrash("")).map((e) => e.path);
    expect(t1).toMatch(/^Games\/idea2 \(trashed \d+\)\.md$/);
    expect(await fs.restore("", t1)).toBe("Games/idea2.md");
    await fs.remove("", "Games/idea2.md");
    await fs.purge("", (await fs.listTrash(""))[0].path);
    expect(await fs.listTrash("")).toEqual([]);
    await expect(fs.removeDir("", "Games")).resolves.toBeUndefined();
  });
});

import { isPinned, setPinned, stripFrontmatter } from "../lib/frontmatter";
import { setMark } from "../lib/tasks";
import { fillTemplate, STARTERS } from "../lib/templates";
import { dailyContent } from "../lib/daily";
import { doneThisWeek, isoWeek, nextMonday, reviewNote, weekEnd, weekStart, weeklyPath } from "../lib/weekly";

describe("done dates, dropped tasks", () => {
  it("stamps @done when checked and removes it when unchecked", () => {
    const out = toggleTask("- [ ] Pay rent #home\n", 0, "2026-10-29");
    expect(out).toBe("- [x] Pay rent #home @done(2026-10-29)\n");
    expect(parseTasks("a", out)[0]).toMatchObject({ done: true, doneOn: "2026-10-29", title: "Pay rent #home" });
    expect(toggleTask(out, 0)).toBe("- [ ] Pay rent #home\n");
  });
  it("does not copy @done into the next repeating task", () => {
    const out = toggleTask("- [ ] Pass @due(2026-10-29) @repeat(weekly)\n", 0, "2026-10-29").split("\n");
    expect(out[1]).toBe("- [ ] Pass @due(2026-11-05) @repeat(weekly)");
  });
  it("keeps @done when a done task is edited", () => {
    expect(editTask("- [x] A @done(2026-10-29)\n", 0, { priority: "high" })).toBe("- [x] A !high @done(2026-10-29)\n");
  });
  it("a dropped task leaves every list but stays in the note", () => {
    const out = setMark("- [ ] Maybe\n- [ ] Keep\n", 0, "-");
    expect(out).toBe("- [-] Maybe\n- [ ] Keep\n");
    expect(parseTasks("a", out).map((t) => t.title)).toEqual(["Keep"]);
  });
});

describe("pinned notes and templates", () => {
  it("pins through front matter", () => {
    const pinned = setPinned("# Note\n", true);
    expect(pinned).toBe("---\npinned: true\n---\n# Note\n");
    expect(isPinned(pinned)).toBe(true);
    expect(setPinned(pinned, false)).toBe("# Note\n");
    expect(setPinned("---\ntags: a\n---\nx", true)).toBe("---\ntags: a\npinned: true\n---\nx");
    expect(stripFrontmatter(pinned)).toBe("# Note\n");
  });
  it("keeps task line numbers right with front matter", () => {
    const c = setPinned("# N\n- [ ] a\n", true);
    expect(parseTasks("n", c)[0].line).toBe(4);
    expect(renderMarkdown(c)).toContain('data-line="4"');
    expect(renderMarkdown(c)).not.toContain("pinned");
    expect(noteTitle("n.md", c)).toBe("N");
  });
  it("fills templates", () => {
    expect(fillTemplate("# {{long_date}}\n{{date}} {{title}}", { date: "2026-10-29", title: "X" })).toBe("# Thursday, 29 October\n2026-10-29 X");
    expect(dailyContent("2026-10-29")).toContain("## Plan");
    expect(dailyContent("2026-10-29", "# Mine {{date}}\n")).toBe("# Mine 2026-10-29\n");
    expect(Object.keys(STARTERS)).toContain("Templates/Daily note.md");
  });
});

describe("weekly review", () => {
  it("finds the week, next Monday and ISO week", () => {
    expect([weekStart("2026-10-29"), weekEnd("2026-10-29"), nextMonday("2026-10-29")]).toEqual(["2026-10-26", "2026-11-01", "2026-11-02"]);
    expect(weekStart("2026-11-01")).toBe("2026-10-26"); // Sunday belongs to the week before
    expect(isoWeek("2026-10-29")).toEqual({ year: 2026, week: 44 });
    expect(isoWeek("2026-01-01")).toEqual({ year: 2026, week: 1 });
    expect(isoWeek("2027-01-01")).toEqual({ year: 2026, week: 53 });
    expect(weeklyPath("2026-10-29")).toBe("Weekly reviews/2026-W44.md");
  });
  it("lists tasks finished this week and writes plain-bullet notes", () => {
    const tasks = parseTasks("a", "- [x] A @done(2026-10-27)\n- [x] B @done(2026-11-03)\n- [x] C\n- [ ] D @due(2026-10-30)\n");
    const done = doneThisWeek(tasks, "2026-10-29");
    expect(done.map((t) => t.title)).toEqual(["A"]);
    const note = reviewNote("2026-10-29", done, tasks.filter((t) => !t.done));
    expect(note).toContain("# Weekly review 2026-W44");
    expect(note).toContain("26 Oct – 1 Nov 2026");
    expect(note).toContain("- A");
    expect(parseTasks("w", note)).toHaveLength(0);
  });
});

import { DEFAULT_REMIND, hashId, planReminders } from "../lib/reminders";
import { getDailyDir, isDailyPath, setDailyDir } from "../lib/daily";

describe("reminders", () => {
  const now = new Date(2026, 9, 29, 10, 0).getTime(); // Thu 29 Oct 2026, 10:00
  const tasks = parseTasks("a.md", "- [ ] Call bank @due(2026-10-29)\n- [ ] Tomorrow @due(2026-10-30)\n- [ ] Friday @due(2026-10-31)\n- [ ] Later @due(2026-12-31)\n- [x] Done @due(2026-10-31)\n- [ ] No date\n");
  it("schedules open tasks in the horizon at the default time", () => {
    const r = planReminders(tasks, now, { ...DEFAULT_REMIND });
    expect(r.map((x) => x.title)).toEqual(["Tomorrow", "Friday"]); // today's 09:00 has passed, others are out of range or done
    expect(new Date(r[0].at).getHours()).toBe(9);
  });
  it("can remind a day before, and add the plan and review nudges", () => {
    const r = planReminders(tasks, now, { ...DEFAULT_REMIND, daysBefore: 1, dailyPlan: true, weeklyReview: true });
    expect(r.filter((x) => x.title === "Call bank")).toHaveLength(0); // yesterday has passed
    expect(r.find((x) => x.title === "Tomorrow")).toBeUndefined(); // its day-before 09:00 has already passed
    expect(r.find((x) => x.title === "Friday")?.body).toMatch(/^Due tomorrow/);
    expect(r.filter((x) => x.title === "Plan your day").length).toBeGreaterThan(10);
    const week = r.filter((x) => x.title === "Weekly review");
    expect(week.length).toBe(2);
    expect(new Date(week[0].at).getDay()).toBe(0);
  });
  it("is off when disabled and ids are stable", () => {
    expect(planReminders(tasks, now, { ...DEFAULT_REMIND, enabled: false })).toEqual([]);
    expect(hashId("x")).toBe(hashId("x"));
    expect(hashId("x")).toBeGreaterThan(0);
    expect(hashId("task|a|1")).not.toBe(hashId("task|a|2"));
  });
});

describe("settings that change the rules", () => {
  it("repeats from the completion date when asked", () => {
    const c = "- [ ] Water plants @due(2026-10-20) @repeat(weekly)\n";
    expect(toggleTask(c, 0, "2026-10-29", "completion").split("\n")[1]).toContain("@due(2026-11-05)");
    expect(toggleTask(c, 0, "2026-10-29", "due").split("\n")[1]).toContain("@due(2026-10-27)");
  });
  it("supports a custom daily notes folder and Sunday-first weeks", () => {
    setDailyDir("Journal/");
    expect(getDailyDir()).toBe("Journal");
    expect(dailyPath("2026-10-29")).toBe("Journal/2026-10-29.md");
    expect(isDailyPath("Journal/2026-10-29.md")).toBe(true);
    expect(isDailyPath("Daily notes/2026-10-29.md")).toBe(false);
    setDailyDir("");
    expect(getDailyDir()).toBe("Daily notes");
    expect([weekStart("2026-10-29", false), weekEnd("2026-10-29", false)]).toEqual(["2026-10-25", "2026-10-31"]);
  });
});

import { daysLeft, planTrashCleanup, stampName, stampPath, unstampName, unstampPath } from "../lib/trash";

describe("trash clock", () => {
  it("stamps and unstamps names, including dots and the old format", () => {
    expect(stampName("Plan.md", 1730200000)).toBe("Plan (trashed 1730200000).md");
    expect(unstampName("Plan (trashed 1730200000).md")).toEqual({ name: "Plan.md", deletedAt: 1730200000 });
    expect(unstampName("v1.2 notes (trashed 1730200000).md").name).toBe("v1.2 notes.md");
    expect(unstampName("1730200000-old.md")).toEqual({ name: "old.md", deletedAt: 1730200000 });
    expect(unstampName("My (trashed) idea.md")).toEqual({ name: "My (trashed) idea.md", deletedAt: null });
    expect(stampPath("Games/idea.md", 1730200000)).toBe("Games/idea (trashed 1730200000).md");
    expect(unstampPath("Games/idea (trashed 1730200000).md")).toEqual({ path: "Games/idea.md", deletedAt: 1730200000 });
  });
  it("plans what to delete and what to start timing", () => {
    const now = Date.UTC(2026, 9, 29) ;
    const sec = (daysAgo: number) => Math.floor(now / 1000) - daysAgo * 86400;
    const paths = [`a (trashed ${sec(40)}).md`, `b (trashed ${sec(5)}).md`, "c.md", `d/e (trashed ${sec(31)}).md`];
    expect(planTrashCleanup(paths, now, 30)).toEqual({ purge: [paths[0], paths[3]], stamp: ["c.md"] });
    expect(planTrashCleanup(paths, now, 0)).toEqual({ purge: [], stamp: [] }); // "never"
    expect(daysLeft(paths[1], now, 30)).toBe(25);
    expect(daysLeft("c.md", now, 30)).toBeNull();
  });
});

import { buildBoard, columnOf, columnsFor, moveInContent, slug } from "../lib/kanban";

describe("kanban board", () => {
  const cols = columnsFor(["Doing", "In review", "doing"]); // a repeated name is ignored
  const note = "- [ ] Plain\n- [ ] Started @status(doing)\n- [ ] Odd @status(unknown)\n- [x] Finished @done(2026-10-29)\n- [ ] Urgent !high @due(2026-10-30) @status(in-review)\n";
  const tasks = parseTasks("a.md", note);
  const move = (i: number, to: string, today = "2026-10-29") => moveInContent(note, tasks[i], cols.find((c) => c.id === to)!, today);

  it("builds columns and sorts tasks into them", () => {
    expect(cols.map((c) => [c.id, c.title])).toEqual([["todo", "To do"], ["doing", "Doing"], ["in-review", "In review"], ["done", "Done"]]);
    expect(slug("  In  Review! ")).toBe("in-review");
    expect(tasks[1]).toMatchObject({ status: "doing", title: "Started" }); // @status is not part of the title
    expect(tasks.map((t) => columnOf(t, cols))).toEqual(["todo", "doing", "todo", "done", "in-review"]); // an unknown status falls back to "to do"
    const b = buildBoard(tasks, cols);
    expect(b.map((c) => c.tasks.map((t) => t.title))).toEqual([["Plain", "Odd"], ["Started"], ["Urgent"], ["Finished"]]);
    expect(buildBoard(tasks, cols, { tag: "nothing" }).every((c) => c.tasks.length === 0)).toBe(true);
    expect(buildBoard(tasks, cols, { doneSince: "2026-10-30" })[3].tasks).toEqual([]); // finished before the cut-off
  });
  it("moves a task between columns by rewriting its line", () => {
    expect(move(0, "doing").split("\n")[0]).toBe("- [ ] Plain @status(doing)");
    expect(move(1, "in-review").split("\n")[1]).toBe("- [ ] Started @status(in-review)");
    expect(move(1, "todo").split("\n")[1]).toBe("- [ ] Started");
    expect(move(1, "done").split("\n")[1]).toBe("- [x] Started @done(2026-10-29)"); // checked, stamped, and the status is dropped
    expect(move(3, "doing").split("\n")[3]).toBe("- [ ] Finished @status(doing)"); // unchecked again, old @done removed
    expect(move(3, "todo").split("\n")[3]).toBe("- [ ] Finished");
    expect(move(4, "doing").split("\n")[4]).toBe("- [ ] Urgent @due(2026-10-30) @status(doing) !high");
    expect(move(3, "done")).toBe(note); // already done: nothing to do
  });
  it("a repeating task moved to Done starts its next round in To do", () => {
    const c = "- [ ] Water plants @due(2026-10-29) @repeat(weekly) @status(doing)\n";
    const t = parseTasks("a.md", c)[0];
    const out = moveInContent(c, t, cols.find((x) => x.id === "done")!, "2026-10-29").split("\n");
    expect(out[0]).toBe("- [x] Water plants @due(2026-10-29) @repeat(weekly) @done(2026-10-29)");
    expect(out[1]).toBe("- [ ] Water plants @due(2026-11-05) @repeat(weekly)");
  });
});

import { addCard, addColumn, deleteCard, deleteColumn, editCard, isKanbanNote, moveCard, newBoard, parseBoard, renameColumn } from "../lib/boardNote";

describe("project boards (Obsidian Kanban format)", () => {
  const sample = [
    "---", "", "kanban-plugin: basic", "", "---", "",
    "## Backlog", "", "- [ ] One", "- [ ] Two @due(2026-11-02) @repeat(weekly)", "  more about two", "",
    "## Doing", "", "- [ ] Three", "",
    "## Empty", "",
    "## Done", "", "**Complete**", "", "- [x] Four @done(2026-10-20)", "", "", "",
    "%% kanban:settings", "```", '{"kanban-plugin":"basic"}', "```", "%%", "",
  ].join("\n");
  const titles = (c: string) => parseBoard(c).columns.map((col) => [col.title, col.cards.map((x) => x.text)]);
  const ops = { today: "2026-10-29" };

  it("recognises and reads a board", () => {
    expect(isKanbanNote(sample)).toBe(true);
    expect(isKanbanNote("# Just a note\n- [ ] x")).toBe(false);
    expect(isKanbanNote("---\npinned: true\n---\n")).toBe(false);
    const p = parseBoard(sample);
    expect(p.columns.map((c) => [c.title, c.complete, c.cards.length])).toEqual([["Backlog", false, 2], ["Doing", false, 1], ["Empty", false, 0], ["Done", true, 1]]);
    expect(p.columns[0].cards[1]).toMatchObject({ text: "Two @due(2026-11-02) @repeat(weekly)", checkbox: true, done: false });
    expect(p.columns[0].cards[1].end - p.columns[0].cards[1].start).toBe(2); // the indented line belongs to the card
    expect(p.columns[3].cards[0].done).toBe(true);
    expect(p.lines.slice(p.tail)[0]).toBe("%% kanban:settings");
  });
  it("creates a new board the other app can open", () => {
    const b = newBoard(["Ideas", "Doing", "Done"]);
    expect(isKanbanNote(b)).toBe(true);
    expect(b).toContain("kanban-plugin: basic");
    expect(b).toContain('{"kanban-plugin":"basic"}');
    expect(titles(b)).toEqual([["Ideas", []], ["Doing", []], ["Done", []]]);
    expect(parseBoard(b).columns[2].complete).toBe(true);
    expect(b).toContain("**Complete**");
  });
  it("moves a card to another column, to an empty one, and keeps indented lines with it", () => {
    let c = moveCard(sample, { col: 0, card: 1 }, { col: 1, index: 0 }, ops);
    expect(titles(c)).toEqual([["Backlog", ["One"]], ["Doing", ["Two @due(2026-11-02) @repeat(weekly)", "Three"]], ["Empty", []], ["Done", ["Four @done(2026-10-20)"]]]);
    expect(c).toContain("  more about two"); // travelled with its card
    expect(c.indexOf("more about two")).toBeLessThan(c.indexOf("- [ ] Three"));
    c = moveCard(sample, { col: 1, card: 0 }, { col: 2, index: 0 }, ops);
    expect(titles(c)[1]).toEqual(["Doing", []]);
    expect(titles(c)[2]).toEqual(["Empty", ["Three"]]);
    expect(c).toMatch(/- \[ \] Three\n\n## Done/); // still a blank line before the next heading
    expect(c.endsWith(sample.slice(sample.indexOf("%% kanban:settings")))).toBe(true); // the settings footer is untouched
  });
  it("reorders within a column", () => {
    const down = moveCard(sample, { col: 0, card: 0 }, { col: 0, index: 2 }, ops); // below the last card
    expect(titles(down)[0]).toEqual(["Backlog", ["Two @due(2026-11-02) @repeat(weekly)", "One"]]);
    expect(down).toContain("- [ ] Two @due(2026-11-02) @repeat(weekly)\n  more about two\n- [ ] One");
    const up = moveCard(down, { col: 0, card: 1 }, { col: 0, index: 0 }, ops);
    expect(titles(up)[0]).toEqual(["Backlog", ["One", "Two @due(2026-11-02) @repeat(weekly)"]]);
    expect(moveCard(sample, { col: 0, card: 0 }, { col: 0, index: 0 }, ops)).toBe(sample); // dropped where it was
    expect(moveCard(sample, { col: 0, card: 0 }, { col: 0, index: 1 }, ops)).toBe(sample);
  });
  it("checks cards entering a complete column and unchecks them leaving it", () => {
    const done = moveCard(sample, { col: 1, card: 0 }, { col: 3, index: 0 }, ops);
    expect(done).toContain("- [x] Three @done(2026-10-29)\n- [x] Four @done(2026-10-20)");
    const back = moveCard(done, { col: 3, card: 1 }, { col: 1, index: 0 }, ops);
    expect(back).toContain("- [ ] Four");
    expect(back).not.toContain("Four @done");
  });
  it("a repeating card completed on the board starts its next round in the first column", () => {
    const c = moveCard(sample, { col: 0, card: 1 }, { col: 3, index: 0 }, ops);
    expect(titles(c)[0]).toEqual(["Backlog", ["One", "Two @due(2026-11-09) @repeat(weekly)"]]);
    expect(c).toContain("- [x] Two @due(2026-11-02) @repeat(weekly) @done(2026-10-29)");
  });
  it("adds, edits and deletes cards and columns", () => {
    let c = addCard(sample, 2, "Brand new");
    expect(titles(c)[2]).toEqual(["Empty", ["Brand new"]]);
    c = editCard(c, 2, 0, "Renamed card");
    expect(titles(c)[2]).toEqual(["Empty", ["Renamed card"]]);
    expect(editCard(sample, 0, 0, "   ")).toBe(sample); // blank text is ignored
    c = deleteCard(c, 2, 0);
    expect(titles(c)[2]).toEqual(["Empty", []]);
    expect(titles(addColumn(sample, "Blocked")).map((x) => x[0])).toEqual(["Backlog", "Doing", "Empty", "Done", "Blocked"]);
    expect(addColumn(sample, "doing")).toBe(sample); // names must be different
    expect(titles(renameColumn(sample, 1, "In progress"))[1][0]).toBe("In progress");
    expect(deleteColumn(sample, 0)).toBe(sample); // a column with cards stays
    expect(titles(deleteColumn(sample, 2)).map((x) => x[0])).toEqual(["Backlog", "Doing", "Done"]);
  });
  it("works with Windows line endings and plain bullet cards", () => {
    const crlf = "---\r\n\r\nkanban-plugin: basic\r\n\r\n---\r\n\r\n## A\r\n\r\n- plain card\r\n- [ ] checked card\r\n\r\n## Done\r\n\r\n**Complete**\r\n\r\n";
    const c = moveCard(crlf, { col: 0, card: 0 }, { col: 1, index: 0 }, ops);
    expect(c).not.toMatch(/[^\r]\n/); // every line ending stays CRLF
    expect(c).toContain("- plain card"); // no checkbox to tick, text left alone
    expect(titles(c)).toEqual([["A", ["checked card"]], ["Done", ["plain card"]]]);
  });
});

describe("board sort options", () => {
  const ts = parseTasks("b.md", "- [ ] Zed @due(2026-11-03)\n- [ ] Alpha !high\n- [ ] Mid @due(2026-11-01)\n").concat(parseTasks("a.md", "- [ ] Other\n"));
  const todo = (sort: "urgency" | "due" | "note" | "title") => buildBoard(ts, columnsFor([]), { sort })[0].tasks.map((t) => t.title);
  it("orders cards the way you ask", () => {
    expect(todo("urgency")).toEqual(["Alpha", "Mid", "Zed", "Other"]);
    expect(todo("due")).toEqual(["Mid", "Zed", "Alpha", "Other"]);
    expect(todo("note")).toEqual(["Other", "Zed", "Alpha", "Mid"]); // note a.md, then b.md in line order
    expect(todo("title")).toEqual(["Alpha", "Mid", "Other", "Zed"]);
  });
});

describe("folder counts for the sidebar", () => {
  it("counts the notes in each folder and its subfolders in one pass", () => {
    const counts = folderCounts(["Daily notes/2026-11-04.md", "Daily notes/2026-11-05.md", "Thesis/chapters/Intro.md", "Thesis/Notes.md", "Loose.md"]);
    expect(counts.get("Daily notes")).toBe(2);
    expect(counts.get("Thesis")).toBe(2); // its own note and the one a folder down
    expect(counts.get("Thesis/chapters")).toBe(1);
    expect(counts.get("Loose")).toBeUndefined(); // a note at the root is not a folder
  });
});

describe("pinning a note keeps its line endings", () => {
  it("writes CRLF front matter into a CRLF note and LF into an LF note", () => {
    const crlf = "---\r\nkanban-plugin: basic\r\n---\r\n\r\n## To do\r\n- [ ] a\r\n";
    const pinned = setPinned(crlf, true);
    expect(pinned).toBe("---\r\nkanban-plugin: basic\r\npinned: true\r\n---\r\n\r\n## To do\r\n- [ ] a\r\n");
    expect(pinned.includes("\n") && !pinned.replace(/\r\n/g, "").includes("\n")).toBe(true); // no bare LF left

    const lf = "# Note\n\ntext\n";
    expect(setPinned(lf, true)).toBe("---\npinned: true\n---\n# Note\n\ntext\n");
    expect(setPinned(pinned, false)).toBe("---\r\nkanban-plugin: basic\r\n---\r\n\r\n## To do\r\n- [ ] a\r\n");
  });
});
