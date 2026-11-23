# Atonacht — improvement spec

Written 2026-11-14 against `master` @ `629f0dd` (tree clean, 39 commits, 242 tracked files).
Audit method: read the source, then **built and tested for real** — `npx tsc --noEmit` clean,
`npx vitest run` **209/209 passing** (37 files, 62 s warm), `npm run build` clean. The UI was **not** driven
in a browser: the browser harness timed out on this machine, so no visual claims are made below that the code
does not prove. Nothing was changed in the app by this audit; only this file was added.

## 0. Status — what has been implemented (2026-11-14, fourth pass)

**All five items of §4 are done**, and so are the three §3 leftovers that were never in the top five (F, H, I).
Items 1-3 landed in the second pass (`bb734c7`, `66d795d`, `5839f45`), items 4 (local version history) and 5 (README
truth pass) in the third, and F/H/I in this one. The gate was run on the final tree:
`npx tsc --noEmit` clean, `npx vitest run` **247/247 passing** (42 files), `npm run build` clean (`index` 274.13 kB /
89.04 kB gzip). Nothing was version-bumped, tagged or released.

| # | Item | Status | Commit |
|---|------|--------|--------|
| 1 | Links that actually work (A) | done | `bb734c7` |
| 2 | Renaming a note keeps its backlinks (B) | done | `66d795d` |
| 3 | All tasks: search + a Done list that pages (C) | done | `5839f45` |
| 4 | Local version history (D) | done | `854e0d5` |
| 5 | README truth pass (E) | done | `c25e1d9` |
| 6 | Preview richness: quotes, ordered lists, rules, tables (F) | done | `a5af002` |
| 7 | Downscale a big photo before it is written (H) | done | `a5af002` |
| 8 | Search results show the matching line, marked (I) | done | `a5af002` |

The UI was driven **for real** this time in Chromium (headless, 390×844, 2× DPR) against `vite` with the demo
file layer, so the claims below have screenshots and DOM assertions behind them, not just unit tests. Evidence
files are in `docs/improvement-evidence/` (see the index there).

## 0b. Status — fifth pass (2026-11-23): ten bugs found by driving the app

Written against `master` with the app running in Chromium (`npx vite`, demo file layer, `localStorage` key
`atonacht.demo`) plus the code behind each one. Gate on the final tree: `npx tsc --noEmit` clean,
`npx vitest run` **257/257 passing** (45 files), `npm run build` clean. Nothing was version-bumped, tagged or released.
Evidence: `docs/improvement-evidence/fifth-pass/`.

| # | Bug | Why it happened | Fixed |
|---|-----|-----------------|-------|
| 1 | Renaming a note onto a name that was already taken **destroyed the note that was there** (browser demo), and did nothing at all with no message on desktop/Android | `Notes.tsx` built the target path from the typed name with no check and closed the sheet *before* awaiting the rename. The three file layers then disagreed: `memFs.rename` replaced the existing file, `rename_note` returned `"{to} already exists"` and SAF refused — and nobody showed that error | store's `renameNote` refuses an existing destination; the sheet validates the name, disables **Rename** and says why; it stays open until the rename resolves and shows a failure in place; `memFs.rename` now throws on an existing destination like the real layers |
| 2 | Ticking a task in the reading view **lost the day it was done**: the task disappeared from *Done* and from the weekly review | the preview's checkbox handler called `toggleTask(text, line)` with no date and no repeat config, so no `@done(…)` was written — and every list filters on that stamp | the handler now passes `today()` and `prefs.repeatFrom`, the same call every other checkbox makes |
| 3 | A save that failed said **nothing**: the text stayed on screen, the file did not change, closing the app lost it | `save()` had no `catch`, and the one error banner is cleared by the next successful folder poll 4 s later | a separate `saveError` shows the path and the reason, and stays until that note saves or the user dismisses it |
| 4 | The reading view showed the raw `@done(2026-11-23)` tag, struck through, inside a finished task | `inline()` chipped `@due`/`@repeat`/tags/priority but not `@done` | `@done(…)` renders as a muted `done 23 Nov` chip that is not struck through by `.md-task.done` |
| 5 | On a desktop window a search filtered the notes list with **no sign of the filter and no way to clear it** | the search field is only drawn on narrow screens (`{!wide && …}`), and the query arrives from the sidebar, which the list does not clear | a query-hint row on both widths: `“rent” · 3 notes` plus **Clear** |
| 6 | `tag:thesis` matched `#thesis-2` and `#thesis2026` | the tag test was `new RegExp("#" + tag + "\\b")`, and `-` is a non-word character, so the boundary sat between `thesis` and `-2` | `(?![\\w-])` after the tag |
| 7 | **Clear local version history** threw away every earlier version on one click | no confirmation, unlike the other destructive rows | a `confirm()` naming what is lost, and what is not (the notes) |
| 8 | A backup was **notes only**: restoring one brought the notes back with every picture and file they link broken | `buildBackup` zipped the note texts and nothing else, so `Attachments/…` never travelled; restore had nothing to write back | export reads each linked file through the folder layer and stores it at its own path; restore writes the bytes back, skipping a file that is already there |
| 9 | The browser demo listed **pictures as notes** — a shot in `Attachments/` appeared in Notes and Library, in the folder counts, and in “N notes” | `memFs.list` returned every file, while the desktop (`is_markdown`) and Android (`isNote`) layers list only notes, and the store trusts the layer | the demo layer applies the same `.md` filter as the real ones; a test pins all three |
| 10 | A GitHub-sync copy (`Note (github).md`) sat in the notes list as an ordinary note: the conflicts screen only knew Syncthing's naming, so the second version was never merged — and went back up on the next push | `parseConflict` only matched Syncthing's name pattern | the copy parses as a conflict with `source: "github"`; the screen names where it came from, dates it from its mtime, and “keep both” keeps it as `Note (conflict YYYY-MM-DD).md` |

Reproduced live before the fix (same demo file layer, 1100×760): renaming `Zeta` to the existing `Packing list`
left `Personal/Packing list.md` holding `# Zeta`, with the note it replaced gone; ticking the only task in a note
wrote `- [x] Buy milk` with no `@done` in the `.md` file. After the fix: the sheet reads *A note called “Packing
list” is already here.* with **Rename** disabled and both files untouched (`fifth-pass/02-rename-clash-refused.png`),
and the tick wrote `- [x] Buy milk @done(2026-11-23)` (`fifth-pass/01-done-chip-in-preview.png`).

## 0c. Status — sixth pass (2026-11-23): two more, found by re-reading dates and conflicts

The fifth pass ended with two known gaps. Fixing them meant touching the conflict code, so this pass read the
date arithmetic and the rest of the conflict path line by line instead of driving the UI blind. Two bugs, both
silent, both reproduced in the browser demo before and after:

| # | Bug | Why it happened | Fixed |
|---|---|---|---|
| 11 | A task repeating **`monthly`** from the 31st was quietly on the 28th forever after one February — rent, invoices, month-end reviews all drifted | `addMonths` clamps to the target month's last day, and the *next* run starts from the clamped date, which then has no memory of the 31st | a due date on the **last day of its month** now means *the end of every month*: `2026-01-31 → 2026-02-28 → 2026-03-31`. A mid-month day stays put, and `@repeat(monthly:31)` still pins the 31st |
| 12 | Resolving two conflicts of the same note on the **same day** overwrote the copy kept first — `X (conflict 2026-11-23).md` was the fixed name every time | `resolve("both")` built the copy path from the date alone and saved over whatever was there | `freeCopyPath` takes the first free name (`… (conflict 2026-11-23) 2.md`), and the fallback day for a copy with no date is the **local** day, not UTC's (`toISOString()` is still yesterday until 02:00 at UTC+2) |

Verified live: ticking `- [ ] Pay rent @due(2026-12-31) @repeat(monthly)` wrote the next one as
`@due(2027-01-31)` in `Personal/Rent.md` (`sixth-pass/monthly-keeps-the-end-of-the-month.png`), and the
same-day copy case is pinned by a test that keeps an earlier `Plan (conflict <today>).md` and resolves
another conflict of `Plan` — it lands as `Plan (conflict <today>) 2.md` with the earlier copy's text intact.

Audited this pass and found sound, so nothing changed: every `button`/`link` on Home, Notes, Tasks, Board and
Calendar has an accessible name (CDP accessibility tree, phone width); the phone board is a deliberate
column carousel (columns stack, cards scroll sideways with a snap and a fade), not a squeezed desktop board;
reminders do not re-notify on every poll (the plan's signature is compared before timers are set), and a
rename already rewrites `[[links]]` in every other note, aliases and `#headings` included.

Gate on the final tree: `npx tsc --noEmit` clean, `npx vitest run` **258/258 passing** (45 files), `npm run build`
clean. Evidence: `docs/improvement-evidence/sixth-pass/`.

## 0d. Status — seventh pass (2026-11-23): tasks read the way you'd say them

The two things the fifth pass listed as gaps are now features rather than gaps.

**Words are a date.** Every box that adds a task — Home's quick add, Tasks' quick add, and the capture dialog —
reads the day and the time out of what was typed and takes them out of the title:

| Typed | Becomes |
|---|---|
| `Buy milk tomorrow 5pm` | Buy milk · **24 Nov, 5:00 pm** |
| `Call the bank` | Call the bank · **today** (the default) |
| `gym fri` / `next friday` / `monday` (typed on a Monday) | the next one, never the one gone by |
| `pay rent on 31 dec`, `renew 5/12`, `ship 2026-12-31` | that day; a day already past this year means next year |
| `water plants in 3 days`, `in 2 weeks`, `next week`, `day after tomorrow` | the arithmetic |
| `standup 9:30`, `call 5pm`, `lunch 12pm`, `call 5 o'clock`, `breakfast noon` | the time; **a time with no day means today** |
| `buy 2 apples`, `read chapter 1`, `open 24/7` | left exactly as typed — no day is guessed |
| `pay rent @due(2026-12-31) tomorrow` | the hand-typed tag wins; nothing is rewritten |

A hint under the box says what was understood (`tomorrow at 5:00 pm`) before it is added, and the task chip
carries the time (`24 Nov, 5:00 pm`). Both are one function, `parseWhen` in `src/lib/natural.ts`, with the
reading in words handled by `describeWhen`/`atLabel` — so the box and the chip can never disagree.

**No date means today.** Tasks with nothing in their words are due today: the default in Settings changed from
*No date* to *Today* (and the options now read Today / Tomorrow / No date). A stored default is migrated once
(`prefs.version`), except for anyone who had deliberately chosen *Tomorrow*; a deliberate *No date* stays *No
date* after the migration. `@repeat(monthly)` from the end of the month also keeps to the end of the month —
that was bug 11 in §0c, and it now shares the same date path.

Gate on the final tree: `npx tsc --noEmit` clean, `npx vitest run` **270/270 passing** (47 files, `natural.test.ts`
covering 20 readings and `naturaladd.test.tsx` covering the boxes and the migration), `npm run build` clean.
Evidence: `docs/improvement-evidence/seventh-pass/`.

### Item 1 — links (done)

- `renderMarkdown("see [Google](https://google.com)")` → one `a.ext` with `href`/`data-href` and
  `rel="noopener noreferrer"`; `externalHref("javascript:alert(1)")` is `null`, and the note text
  `[bad](javascript:alert(1))` stays literal in the rendered preview (checked in the live DOM, not just a test).
- Clicking `Google` in the preview calls `openExternal` → the system hand-off path (`window.open` in the browser
  demo recorded `https://google.com`; under Tauri it goes through `plugin-opener`, already initialised in
  `lib.rs` with `opener:default` in `capabilities/default.json`).
- `[[Deep Work Notes]]` in a note whose file is `deep-work.md` navigates to that note. Verified in the preview
  (h1 `Links` → `Deep Work Notes`) and in the live editor (`Ctrl/Cmd`-click on `.cm-wl`).
- Deviation from the plan: in the **live editor** a link follows on `Ctrl/Cmd`-click, not a plain click — a plain
  click in a text editor has to place the caret, and the editor already used that gesture for `[[wiki]]` links.
  The preview keeps plain click.

### Item 2 — rename keeps backlinks (done)
Live run: `Beta.md` holding `See [[Alpha]] and [[Alpha|the other one]].`, rename `Alpha.md → Renamed Alpha.md` →
`Beta.md` becomes `See [[Renamed Alpha]] and [[Renamed Alpha|the other one]].`, the snack reads
_Renamed to “Renamed Alpha” · 1 note updated_, and Undo restores both the file name and the exact original link
text. A neighbouring `[[Alphabet soup]]` is left alone. If the rename itself throws, the rewritten notes are put
back before the error propagates.
- Deviation from the plan: the rewrite matches the **old file name** rather than `noteKeys(from, oldTitle)`. A
  title comes from the note's `# H1`, so it survives a rename untouched — a `[[Title]]` link still resolves after
  the file is renamed and rewriting it would change text without fixing anything. Only the file-name key can be
  broken by a rename, so only that key is rewritten.

### Item 3 — tasks search + paging (done)
At 390×844 with 120 done tasks: the Done list draws 100 rows, offers _Show 20 more_, and after one tap draws all
120 with the oldest row (`Finished task 119`) on screen and no further button. Typing `rent` in _Search tasks_
narrows 3 open rows to `Pay rent`, `#shopping` typed in the box filters too and reports what it understood
(`tag #shopping · 1 task`), and a tag pill still applies on top of the search.

### Item 4 — local version history (done)
`src/lib/noteHistory.ts` (new) is an IndexedDB store next to `noteCache.ts`: `record()` keeps the text a save replaces,
prunes to `MAX_VERSIONS = 5` per note, skips a repeat of the newest version, skips notes over `MAX_VERSION_BYTES =
200 000`, and never fails a save (the call is fire-and-forget and catches). `store.save()` records the previous content
before writing it, which is exactly the text Android truncates and an outside editor destroys. `History.tsx` now always
lists **On this device** (newest first, with each version's size) with the same preview and *Restore this version* as
the repository list, and the GitHub section only appears when a repository and token are set. Settings → Files & backup
gained *Clear local version history* next to the startup-cache rows.
- Deviation from the plan: the editor's clock button used to render only when `prefs.githubRepo && prefs.githubToken`
  were set — that guard is gone, so History is reachable on a device with nothing configured.
- Deviation from the plan: versions are ordered by `(at, seq)`, a per-note counter, because six saves inside the same
  millisecond sorted by timestamp alone come back in an arbitrary order (the `v1…v6` test caught it).
- Verified live in Chromium at 390×844 against the demo file layer: three task renames gave three versions in
  `atonacht-history-v1`; History listed them without any repository; restoring the oldest (44 bytes) wrote
  `# Today\n\n- [ ] Take a shower\n- [ ] Buy milk\n` back into the note and kept the replaced text as a fourth version;
  *Clear local version history* reported success and left 0 rows. Tests: `src/tests/notehistory.test.tsx` (5 store tests
  plus an app-level "a save keeps the text it replaced, and History restores it").

### Item 5 — README truth pass (done)
`README.md` now says **228** tests (was 148, twice), **88 kB** gzip on first load (was 72 KB; 272.20 kB raw `index`
chunk), documents the three behaviours from items 1-3 (links and their scheme allow-list, links by title, rename that
rewrites inbound links, task search and the paged Done list) and the local version history, and moves the Android
truncation gap from "unrecoverable" to "recoverable from History". The Chromium verification line now names the History
run. Every number was reproduced from the command next to it.

### Gate, run on the final tree
```
npx tsc --noEmit   → clean
npx vitest run     → 42 files, 247 tests, all passing
npm run build      → clean (index 274.13 kB / 89.04 kB gzip)
```

### Item 6 — preview richness (F, §3) (done)
`src/lib/markdown.ts` gained three block rules and a table rule, all of them still carrying the source line range so
**double-click-to-edit keeps working**: `> quote` lines collect into one `<blockquote>` spanning every quoted line, a
`1.`/`1)` line becomes `div.md-li.md-ol` with the number as written in a `.num` chip (the list does not renumber your
note), `---` / `***` / `___` become `<hr>`, and a `| pipe |` header followed by a `|---|:--:|` rule becomes a real
`<table>` with `thead`, `tbody` and the column alignment in `text-align`. CSS for the quote (accent left border), the
rule, the table (borders, header background, sideways scroll on a phone) and the numbers lives beside the existing
`.md-li` rule.
- Deviation from §3: a table is **one block**, not one per row, so double-clicking any cell edits the whole table — the
  only honest choice, since a row alone is not valid Markdown. Verified live: the editor opened with all four lines.
- Deliberately not done: nested quotes, nested tables in list items, and inline `|` escapes (`\|`). None is common in
  these notes, and each would have cost more than the whole feature.
- Tests: `lib.test.ts` (blocks, alignment, the whole-table range, pipe text that is not a table, front matter that must
  not become a rule, and a quote and a paragraph not swallowing each other) and `inline.test.tsx` (the four blocks in
  the rendered preview).

### Item 7 — a big photo is written smaller (H, §3) (done)
`src/lib/attachments.ts` now has `fitWithin()` (long edge capped at `MAX_PHOTO_EDGE = 2000` px, never enlarged),
`shrinkPhoto()` (decide → decode → redraw at `PHOTO_QUALITY = 0.85` → keep the result only when it is actually
smaller), and one `Raster` interface with the browser implementation (`createImageBitmap` + canvas) behind it, which is
what makes the whole thing testable in jsdom. `Editor.tsx` runs a picked or pasted file through it before
`fs.writeBytes`. `photoName()` also stops a JPEG that the clipboard calls `image.png` from being written as a `.png`.
- Deviation from §3: only JPEG and WebP are re-encoded. PNG is left byte-for-byte alone because PNG is the format
  people use for transparency, and a canvas re-encode of PNG saves little while risking that alpha channel; GIF, SVG and
  AVIF are left alone for the same reason (SVG is text, AVIF needs a different encoder). Any failure — an undecodable
  file, a canvas that returns nothing, an encode that comes back bigger — keeps the original bytes, so a note never
  loses its picture to a resize.
- Verified live at 390×844 with a real 4,080,531-byte, 4032×3024 JPEG: written at **895,869 bytes / 2000×1500** (22 % of
  the original), and `img.naturalWidth` in the preview was 2000 — the picture still renders.
- Tests: `attachments.test.ts` — a fake 4032×3024 bitmap asserts the redraw is asked for exactly 2000×1500 at quality
  0.85 and that the written bytes are smaller, plus portrait, already-small (never decoded), PNG untouched (the same
  bytes object back), encode-bigger, undecodable, the `fitWithin` arithmetic and the `photoName` rename.

### Item 8 — the line that matched, marked (I, §3) (done)
`matchSnippet()` in `markdown.ts` returns the first line holding the term cut into `before` / `hit` / `after`, windowed
around the hit when the line is long (so the term is never the part that gets cut). `Notes.tsx` renders that for a
result row and falls back to `snippet()` when the match was in the file name only. The `<mark>` styling is one CSS rule.
- Verified live: a 41-line note that mentions rent only on its last line, searched with `rent` at 390×844, showed
  `- [ ] Pay rent by Friday` with **rent** marked, and not the opening line.
- Tests: `lib.test.ts` (line 41 of a note, the long-line window, no match, blank term) and a new
  `searchline.test.tsx` (three app-level runs: the matched line, the file-name fallback, and the note's own casing).

## 1. What it is

Atonacht is a Markdown notes + to-do app for desktop and Android: one Tauri 2 + React 18 + TypeScript
codebase, plain `.md` files in a folder the user picks, synced by Syncthing (or GitHub as a second remote).
No server, no database. Tasks live inside note text as `- [ ] … @due(…) !high #tag [[Link]]` lines, and
the app is really a careful set of views over those files: Home, All tasks, Board (Obsidian Kanban format),
Calendar, Notes/Library/Tags, weekly review, reminders, conflicts, trash, ZIP backup, update check.

- **Version** 0.2.0 (`package.json`, `tauri.conf.json`), tags `v0.1.0`, `v0.1.5`, `v0.2.0`.
- **Size** 7,791 lines TS/TSX in `src/` (3,392 of them tests), 981 lines of Rust in `src-tauri/src/`.
- **Quality signals that are genuinely good**: 209 JS tests + 12 Rust tests; focus-trapping `Modal` with
  focus restore; every file layer (desktop / SAF / in-memory demo) behind one `NotesFs` interface; atomic
  saves on desktop; incremental `TaskIndex`; note cache in IndexedDB; conflict diff/resolve; the README is
  honest about what is *not* verified.
- **Known gaps it already admits** (README → "Known gaps"): Android cannot swap a file into place, so a save
  briefly empties the note; Android polls every 8 s; no iOS.

## 2. What works, what is thin

Works (verified by code + tests): note CRUD, folders, rename/move, trash with retention, templates, pins,
backlinks + tag index, `tag:/in:/due:/is:/has:` search, tasks parsed out of notes with repeats and
carry-over, swipe gestures, board drag on mouse/pen/touch/keyboard, Kanban round-trip, conflict detection
and resolution, GitHub sync with per-note history, reminders with quiet hours, app lock, widgets/share
target on Android, backup/restore, update check.

Thin / broken at audit time — the top five below are since fixed (§0); everything listed here was measured against
`629f0dd`: external links are dead text; wiki links are only clickable in preview mode
and resolve by file name only; renaming a note silently breaks every inbound `[[link]]`; All tasks has no
text search and its Done list is a hard dead end at 100 rows; there is no local version history, so a bad
write can only be undone if GitHub is configured; README numbers have drifted.

## 3. Candidate improvements (full list, unordered)

| # | Candidate | Effort | Value |
|---|-----------|--------|-------|
| A | `[text](url)` links render and open the system browser; wiki links clickable in the live editor too, and resolved by title as well as file name | S/M | high |
| B | Rename rewrites inbound `[[old]]` / `[[old|alias]]` / `[[old#heading]]` links | S/M | high |
| C | All tasks: text search box; page the Done list instead of stopping at 100 | S | high |
| D | Local per-note version history (last N saves) restorable from History, no GitHub needed | M | high |
| E | README/docs truth pass (test counts, bundle size, what is verified) | S | medium |
| F | Preview: tables, ordered lists, blockquotes, `---` (today everything but `-` lists and headings is a paragraph) — **done, §0 item 6** | M | medium |
| G | Split `src/ui/SettingsPanels.tsx` (833 lines, the largest file in `src/`) into one file per panel | M | low (churn risk) |
| H | Attachments: downscale large pasted photos before writing (a 12 MP phone photo lands at full size) — **done, §0 item 7** | M | medium |
| I | Search: highlight the matching line in results instead of the note's opening line — **done, §0 item 8** | S | medium |

## 4. Top 5, in order

### 1. Links that actually work (A) — **DONE** (`bb734c7`)
**Problem.** `src/lib/markdown.ts` `inline()` handles images and `[[wiki]]` links but has no rule for
`[text](url)`: a normal Markdown link is rendered as literal `[text](url)`. Nothing in `src/` calls
`openUrl` except `src/lib/update.ts` (the update button), even though `@tauri-apps/plugin-opener` is
initialised in `src-tauri/src/lib.rs` and `opener:default` is already in `src-tauri/capabilities/default.json`.
In the live editor (`src/ui/live.ts` `INLINE`) `[[…]]` is styled but has no click handler at all — you can
only follow a link in preview mode. And `onPreviewClick` (`src/ui/Editor.tsx:115-123`) resolves a wiki link by
file name only, while `buildLinks` (`src/lib/backlinks.ts`) also matches by **title** — so `[[My Note Title]]`
is a working backlink that does nothing when clicked.

**Change.** 1) In `markdown.ts`, after the image rule, render `[text](url)` as
`<a class="ext" data-href="…" rel="noopener noreferrer">text</a>` (input is already `esc()`-escaped).
2) New `src/lib/links.ts`: `externalHref(raw)` returns the URL only for `http:`, `https:`, `mailto:` — reject
everything else — and `openExternal(href)` calls `openUrl` under Tauri, `window.open` in the browser demo.
3) `Editor.tsx`: in `onPreviewClick`, handle `[data-href]` → `openExternal`; make wiki-link resolution use
`noteKeys()` from `backlinks.ts` so title links resolve. 4) `LiveEditor.tsx`: same delegation on `cm-wl`
clicks (Ctrl/Cmd-click or plain click, matching the preview).

**Files.** `src/lib/markdown.ts`, `src/lib/links.ts` (new), `src/lib/backlinks.ts`, `src/ui/Editor.tsx`,
`src/ui/LiveEditor.tsx`, `src/styles.css` (`a.ext`), `src/tests/lib.test.ts`, `src/tests/inline.test.tsx`.

**Success.** `renderMarkdown("see [Google](https://google.com)")` contains `data-href="https://google.com"`;
`externalHref("javascript:alert(1)")` is `null`; a note with `[[Note Title]]` navigates when the title
differs from the file name (test in `inline.test.tsx`); clicking a link in `npm run tauri dev` opens the
default browser. Gate: `npx vitest run` still 209+ passing, `tsc --noEmit` clean.

### 2. Renaming a note keeps its backlinks (B) — **DONE** (`66d795d`)
**Problem.** `store.tsx` `renameNote` is `fs.rename` + `refresh`. Links match by file base name or title, so
after `Idea.md → Ideas.md` every note containing `[[Idea]]` shows it as a missing link. No test covers this.
**Change.** New `rewriteLinks(content, fromKeys: string[], toName: string)` in `backlinks.ts` that rewrites
`[[from]]`, `[[from|alias]]`, `[[from#heading]]` case-insensitively, preserving alias/heading. In
`renameNote`, before `fs.rename`: collect notes whose content contains any of the old keys (`noteKeys(from,
oldTitle)`), save each rewritten, then rename, then `setUndo` with the previous contents of every touched
note so one tap restores everything. Skip conflict copies.
**Files.** `src/lib/backlinks.ts`, `src/store.tsx` (`renameNote`), `src/ui/Notes.tsx` + `src/ui/Editor.tsx`
(the rename callers, to surface "3 notes updated" in the existing snack), `src/tests/backlinks.test.ts`,
`src/tests/files.test.tsx`.
**Success.** Test: `Beta.md` contains `[[Alpha]]`; rename `Alpha.md → Gamma.md`; `Beta.md` now has
`[[Gamma]]`, `buildLinks` shows no missing link, and Undo restores `[[Alpha]]` plus the old file name.
Manual: rename in the Notes context menu, reopen the linked note, the link is live.

### 3. All tasks: search, and a Done list that ends honestly (C) — **DONE** (`5839f45`)
**Problem.** `src/ui/Tasks.tsx` filters by status and tag pills only — no text search, in an app whose point
is tasks buried in many notes. The Done branch is
`base.filter(done…).slice(0, 100)` with no "Show more" and no "that's all" message, so done work older than
the most recent 100 rows is unreachable from this screen (the Open sections below it *do* page via `PAGE`).
**Change.** Add a search field to the `pills` row that filters `base` by title (same `parseQuery`/
`noteMatches` helpers used by `Notes.tsx`, text only — `tag:`/`due:` come free). Extract the done list into
a `doneList` const and page it with the same `more` counter as the Open sections, keeping the
`prefs.doneDays` window.
**Files.** `src/ui/Tasks.tsx`, `src/tests/homedone.test.tsx` or a new `src/tests/taskssearch.test.tsx`.
**Success.** Test: 120 done tasks → "Show 20 more" appears and reveals them; typing `rent` narrows to the
one matching row while tag pills still apply. Screenshot at 390×844 with a search term active.

### 4. Local version history, so a bad write is recoverable (D) — **DONE** (`854e0d5`)
**Problem.** The only per-note history is GitHub commits (`History.tsx`), which needs a token and a repo.
On Android the file layer truncates before writing (`safFs.ts` `writeVerified` — the README's known gap #1),
and an outside editor/Syncthing can also replace a note. There is no local undo beyond `.trash`.
**Change.** Add a small version store next to `src/lib/noteCache.ts` (IndexedDB, keyed by notes root + path,
last 5 versions with timestamp, size-capped, pruned), written from `store.save()` **only when the previous
content differs**. Extend `History.tsx` with a "This device" section listing those versions with a Restore
button (same interaction as the GitHub list) when no GitHub remote is configured.
**Files.** `src/lib/noteHistory.ts` (new), `src/store.tsx` (`save`), `src/ui/History.tsx`,
`src/ui/SettingsPanels.tsx` (a "Clear local history" row next to the startup-cache switch),
`src/tests/notecache.test.ts` (or new `notehistory.test.ts`), `src/fake-indexeddb` already in devDeps.
**Success.** Test: save `v1`…`v6`; history holds 5 entries in order; restore of `v3` writes its text back and
the note is reloaded; nothing is written when a save is a no-op. Manual: edit a note in Notepad while the app
is closed, reopen, restore the previous version from History.

### 5. README truth pass (E) — **DONE**
**Problem.** Measured now vs. what the README says: **209** JS tests (README: 148, twice), **86.7 kB** gzip in
the initial `index` chunk (README: 72 KB), and the "Known gaps" list will be out of date once items 1-4 land.
**Change.** Update the three numbers, add the new History/version behaviour, and move any fixed gap out of
"Known gaps" into "What is verified" with the test that proves it.
**Files.** `README.md`, `RELEASING.md` if the version step changed.
**Success.** Every number in the README can be reproduced by the command next to it
(`npx vitest run | tail -3`, `npm run build` gzip column); no claim in the README is contradicted by the code.

## 5. Deliberately not proposed

- **iOS** and **a real file watcher on Android** are product decisions with platform work, not audit fixes.
- **Splitting `SettingsPanels.tsx`** (G) is real debt but pure churn while the feature list is still moving.
- **Bundle trimming**: the 511 kB `Editor` chunk is CodeMirror, already lazy-loaded after first paint; the
  86.7 kB initial payload is fine for a Tauri app that ships its own assets.

## 6. Gate for anything implemented from this file

```
npx tsc --noEmit && npx vitest run && npm run build
```
All three green, plus the per-item success check above, plus a screenshot of the touched screen at
390×844. No version bump, tag or release as part of this work.

## 7. What is left, and why

Nothing from the top 5 is deferred, and the three §3 candidates worth doing are done too: F (preview blockquotes,
numbered lists, rules and tables), H (photo downscaling before writing) and I (the matching line in search results).
Items 1-5 of §4 landed in the second and third pass, F/H/I in the fourth (§0 items 6-8).

What is deliberately untouched:

- **§3 G (split `SettingsPanels.tsx`)** and bundle trimming stay unproposed for the reasons in §5: real debt, pure churn
  while the feature list is still moving.
- **The long tail of Markdown** that F does not cover: nested quotes, tables inside list items, `\|` escapes, setext
  headings (`Title` under `===`), reference links and footnotes. Each is rare in these notes, and the renderer's job is
  the shapes people write, not CommonMark conformance; a real parser would be the answer if that ever changes.

Two things the local history deliberately does *not* do, so nobody reads them into the code:

- It is **per device and per notes root**: versions are never synced, and switching the notes folder gives that folder
  its own list. GitHub commits remain the cross-device answer.
- It keeps **five versions of the text being replaced**, not five snapshots taken on a timer; a note saved once has no
  history until it is saved a second time, and a note over 200 kB keeps none.

Evidence for all eight items: `docs/improvement-evidence/` (README index + the 390×844 screenshots of the preview links,
the live editor links, the Done paging, the task search, the rename snack, the local History list, its version preview,
the Settings row that clears it, the preview's quote/numbered list/rule/table, the downscaled photo and the search
result that shows its matching line).
