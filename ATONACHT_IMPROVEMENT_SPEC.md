# Atonacht — improvement spec

Written 2026-11-14 against `master` @ `629f0dd` (tree clean, 39 commits, 242 tracked files).
Audit method: read the source, then **built and tested for real** — `npx tsc --noEmit` clean,
`npx vitest run` **209/209 passing** (37 files, 62 s warm), `npm run build` clean. The UI was **not** driven
in a browser: the browser harness timed out on this machine, so no visual claims are made below that the code
does not prove. Nothing was changed in the app by this audit; only this file was added.

## 0. Status — what has been implemented (2026-11-14, third pass)

**All five items of §4 are done** on `master`. Items 1-3 landed in the second pass (`bb734c7`, `66d795d`, `5839f45`),
item 4 (local version history) and item 5 (README truth pass) in this one. The gate was run on the final tree:
`npx tsc --noEmit` clean, `npx vitest run` **228/228 passing** (41 files), `npm run build` clean (`index` 272.20 kB /
88.32 kB gzip). Nothing was version-bumped, tagged or released.

| # | Item | Status | Commit |
|---|------|--------|--------|
| 1 | Links that actually work (A) | done | `bb734c7` |
| 2 | Renaming a note keeps its backlinks (B) | done | `66d795d` |
| 3 | All tasks: search + a Done list that pages (C) | done | `5839f45` |
| 4 | Local version history (D) | done | `854e0d5` |
| 5 | README truth pass (E) | done | this commit |

The UI was driven **for real** this time in Chromium (headless, 390×844, 2× DPR) against `vite` with the demo
file layer, so the claims below have screenshots and DOM assertions behind them, not just unit tests. Evidence
files are in `docs/improvement-evidence/` (see the index there).

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
npx vitest run     → 41 files, 228 tests, all passing
npm run build      → clean (index 272.20 kB / 88.32 kB gzip)
```

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
| F | Preview: tables, ordered lists, blockquotes, `---` (today everything but `-` lists and headings is a paragraph) | M | medium |
| G | Split `src/ui/SettingsPanels.tsx` (833 lines, the largest file in `src/`) into one file per panel | M | low (churn risk) |
| H | Attachments: downscale large pasted photos before writing (a 12 MP phone photo lands at full size) | M | medium |
| I | Search: highlight the matching line in results instead of the note's opening line | S | medium |

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

Nothing from the top 5 is deferred any more: items 1-5 of §4 are done. What is deliberately untouched:

- **§3 candidates F (preview blockquotes/tables/ordered lists), H (photo downscaling before writing), I (highlight the
  matching line in search results).** None of them was in the top 5; they are the natural next three if this file is
  worked again, F being the one a user notices (today everything but heading and `-` lists is a paragraph).
- **§3 G (split `SettingsPanels.tsx`)** and bundle trimming stay unproposed for the reasons in §5.

Two things the local history deliberately does *not* do, so nobody reads them into the code:

- It is **per device and per notes root**: versions are never synced, and switching the notes folder gives that folder
  its own list. GitHub commits remain the cross-device answer.
- It keeps **five versions of the text being replaced**, not five snapshots taken on a timer; a note saved once has no
  history until it is saved a second time, and a note over 200 kB keeps none.

Evidence for all five items: `docs/improvement-evidence/` (README index + the 390×844 screenshots of the preview links,
the live editor links, the Done paging, the task search, the rename snack, and now the local History list, its version
preview and the Settings row that clears it).
