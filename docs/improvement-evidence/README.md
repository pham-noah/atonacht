# Evidence for the items in `ATONACHT_IMPROVEMENT_SPEC.md`

Captured 2026-11-14 on `master` (after `bb734c7`, `66d795d`, `5839f45`, and for the last four rows the F/H/I pass) by
driving the real app in headless Chromium at **390×844, 2× DPR** against `npx vite` with the demo file layer, so each
picture is the app running, not a mock. Screenshots are full-viewport.

| File | What it proves |
|------|----------------|
| `preview-links.png` | `[Google](https://google.com)` renders as a link and `[bad](javascript:alert(1))` stays literal text; `[[Deep Work Notes]]` (title ≠ file name `deep-work.md`) renders as a live link. |
| `preview-title-link-followed.png` | Clicking that `[[Deep Work Notes]]` opened the note — the header changed from `Links` to `Deep Work Notes`. |
| `live-editor-links.png` | The live editor styles `[Google](…)` (`.cm-ext`) and `[[Deep Work Notes]]` (`.cm-wl`). |
| `live-wiki-link-followed.png` | Ctrl-clicking the wiki link in the live editor opened `Deep Work Notes`. |
| `done-first-100-show-more.png` | 120 done tasks → the Done list draws exactly 100 rows and ends in **Show 20 more** instead of stopping dead. |
| `done-all-120-end.png` | After one tap the list holds all 120 rows, the last one being `Finished task 119`, and there is no further button. |
| `tasks-search-rent.png` | Typing `rent` in **Search tasks** narrows three open tasks to `Pay rent`. |
| `tasks-search-with-tag.png` | A `#home` tag pill still applies on top of the search term. |
| `rename-undo-snack.png` | Renaming `Alpha.md` reported _Renamed to “Renamed Alpha” · …_, with Undo available; `Beta.md` was rewritten to `[[Renamed Alpha]]` (alias kept) and a neighbouring `[[Alphabet soup]]` was left alone. |
| `history-on-device.png` | With **no** GitHub repository or token, a note's History lists three local versions (newest first, each with its size) under **On this device**, and says where the repository history would appear. |
| `history-version-preview.png` | Tapping the oldest version shows its exact text (`- [ ] Take a shower`) with **Restore this version**. |
| `settings-clear-history.png` | Settings → Files & backup → **History on this device** → *Clear local version history*, next to the startup-cache rows. |
| `preview-rich-blocks.png` | A note with `> quote`, `1.`/`2.` numbered lines, `---` and a pipe table renders as a quote (accent border), a numbered list, a rule and a table with aligned columns — not four more paragraphs. |
| `attachment-photo-downscaled.png` | A 4032×3024 / 4.08 MB JPEG picked into a note was written at 2000×1500 / 0.90 MB and still renders in the preview (`img.naturalWidth` 2000, from the bytes the folder returned). |
| `attachment-written-line.png` | The line the attach wrote into the note: `![big.jpg](Attachments/2026-11-14-222112-big.jpg)` — the picture is a file in `Attachments/`, not inline data. |
| `search-hit-line.png` | Searching `rent` in a 41-line note shows `- [ ] Pay rent by Friday` with **rent** marked, not the note's opening line. |

## Seventh pass (2026-11-23) — words for dates, and today by default

Desktop 1280×800 and phone 390×844, demo file layer. See §0d of the spec.

| File | What it proves |
|------|----------------|
| `seventh-pass/01-words-become-a-date.png` | Typing `Buy milk tomorrow 5pm` in Home's quick add puts `tomorrow at 5:00 pm` under the box before anything is added. |
| `seventh-pass/02-tasks-dated-from-words.png` | The rows afterwards: `Buy milk` with `24 Nov, 5:00 pm`, `Call the bank` with `23 Nov` — the second was typed with no date at all. |
| `seventh-pass/03-capture-says-where-it-goes.png` | Phone capture dialog: `Draft the letter tomorrow 9am` → “Goes in under tomorrow at 9:00 am.” |
| `seventh-pass/04-words-in-the-tasks-box.png` | Tasks page: `Renew the passport on 3 jan` reads as `Sun 3 Jan` while typing, and the list below shows the dated rows. |

What the files themselves got, read back from the demo layer:

- `Buy milk tomorrow 5pm` → `- [ ] Buy milk @due(2026-11-24) @at(17:00)`
- `Call the bank` → `- [ ] Call the bank @due(2026-11-23)` (today)
- `Draft the letter tomorrow 9am` (capture dialog) → `- [ ] Draft the letter @due(2026-11-24) @at(09:00)`

## Sixth pass (2026-11-23) — dates and conflicts, read closely

Phone-width run (390×844, demo file layer) for the layout and accessibility audit, desktop for the task itself.
See §0c of the spec.

| File | What it proves |
|------|----------------|
| `sixth-pass/monthly-keeps-the-end-of-the-month.png` | Ticking `- [ ] Pay rent @due(2026-12-31) @repeat(monthly)` leaves the done line behind and writes the next as `@due(2027-01-31)` — the end of the month, not a date clamped down and stuck. |
| `sixth-pass/phone-home.png` | Home at 390 px: no clipping, no overlap, the five tab labels fit. |
| `sixth-pass/phone-notes.png` | Notes at 390 px: the list, the folder chips and the floating **+** all clear the tab bar; the chips row scrolls sideways rather than wrapping under the button. |
| `sixth-pass/phone-board.png` | The phone board is a column carousel on purpose — columns stack, and each column's cards scroll sideways with a snap and a right-edge fade, so a card is read one at a time instead of squeezed to 90 px. |

DOM assertions from the same runs:

- `Accessibility.getFullAXTree` at 390×844 on Home, Notes, All tasks, Board and Calendar: **0** `button`/`link`
  nodes without an accessible name.
- The conflict copy: with `Personal/Plan (conflict <today>).md` already present, resolving another conflict of
  `Personal/Plan` with **Keep both** wrote `Personal/Plan (conflict <today>) 2.md` and left the earlier copy's text alone.
- `nextOccurrence` over a year of month-ends: `2026-01-31 → 2026-02-28 → 2026-03-31 → 2026-04-30 → 2026-05-31`,
  while `2026-03-15` keeps the 15th and `monthly:31` keeps its own anchor.

## Fifth pass (2026-11-23) — bugs found by driving the app

Same setup (`npx vite`, demo file layer), 1100×760 desktop window this time. See §0b of the spec for the cause of
each one.

| File | What it proves |
|------|----------------|
| `fifth-pass/01-done-chip-in-preview.png` | A task ticked in the reading view is written as `- [x] Buy milk @done(2026-11-23)` — so it reaches *Done* and the weekly review — and the date shows as an unstruck `done 23 Nov` chip instead of a raw tag. |
| `fifth-pass/02-rename-clash-refused.png` | Renaming `Zeta` to the existing `Packing list`: the sheet stays open with *A note called “Packing list” is already here.* in red and **Rename** disabled; both files are untouched. |
| `fifth-pass/03-desktop-search-hint.png` | A search run from the sidebar at desktop width now shows `“passport” · 1 note` with a **Clear** button above the filtered list. |
| `fifth-pass/04-github-conflict-home.png` | A GitHub-sync copy is a conflict, not a stray note: Home offers `1 sync conflict to review` while `Personal` counts one note, not two. |
| `fifth-pass/05-github-conflict-screen.png` | The conflict screen for a GitHub copy: `edited here and on GitHub`, a `From GitHub` column stamped with the day it arrived, and **Keep GitHub’s** among the choices. |
| `fifth-pass/06-backup-with-attachment.png` | After the fix: *Saved a backup of 3 notes and 1 attachment.* — and the ZIP itself contains `Attachments/2026-11-23-120000-shot.png` beside the note that links it (`size=1399`). The picture is not counted as a note (§0b #9). |

DOM assertions from the same runs (not visible in a still):

- `[...document.querySelectorAll('a.ext')]` → `[["Google","https://google.com"]]`, `rel="noopener noreferrer"`.
- Clicking that anchor called the outbound path with `https://google.com` (in the browser demo `openExternal`
  falls back to `window.open`; under Tauri it is `plugin-opener`, already initialised in `lib.rs`).
- Ctrl-click on `.cm-ext` in the editor → `[Google](https://google.com)` with the same URL handed out.
- After the rename: `Beta.md` = `# Beta\n\nSee [[Renamed Alpha]] and [[Renamed Alpha|the other one]].\n`;
  after Undo: `# Beta\n\nSee [[Alpha]] and [[Alpha|the other one]].\n` and `Alpha.md` back.

From the History run (2026-11-14, `master` after the local-version change, same 390×844 setup, demo file layer):

- Three task renames in `Daily notes/2026-11-14.md` produced three rows in IndexedDB (`atonacht-history-v1`), newest
  `seq` last and each holding the text the save replaced — `# Today\n\n- [ ] Take a shower\n- [ ] Buy milk\n` is the oldest.
- The History screen rendered `On this device` with **44 / 51 / 55 bytes** and no error, with no repository configured;
  the editor's clock button now shows without GitHub (it used to be hidden behind `prefs.githubRepo && …`).
- Tapping the 44-byte row rendered that text in a `pre` and **Restore this version** wrote it back: the demo file's
  content was `# Today\n\n- [ ] Take a shower\n- [ ] Buy milk\n` again, and the replaced text was kept as a fourth version,
  so the restore itself can be undone.
- *Clear local version history* reported _Cleared the version history on this device._ and the IndexedDB store then held
  **0** rows.

From the §3-leftovers run (2026-11-14, same 390×844 setup, demo file layer, `npx vite`):

- Preview: `.preview blockquote` → `Ship it on Friday and tell nobody`; `<hr>` present; `.md-ol` texts `1.Draft the letter`
  and `2.Send it` with `.num` chips; `th` = `Item:left`, `Cost:right` (the `:--` / `--:` alignment) and `td` =
  `Venue|200|Cake|35`. Double-clicking a cell opened the line editor with the **whole table** (`| Item | Cost |\n|:--|--:|…`),
  because a table is one block — line editing still writes back exactly what it read.
- Attachments: `DOM.setFileInputFiles` handed the app a 4032×3024, 4,080,531-byte JPEG. The folder then held
  `Attachments/2026-11-14-222112-big.jpg` at **895,869 bytes** (0.90 MB, 22 % of the original), and the note gained
  `![big.jpg](Attachments/2026-11-14-222112-big.jpg)`; in preview `img.naturalWidth/Height` were **2000×1500** and the
  picture drew (the demo layer stores bytes as a data URL, so this is the real written file, read back through `readBytes`).
- Search: the note `Notes/Meeting.md` is 41 lines and mentions rent only on the last one. Typing `rent` gave **one** row
  whose second line is `- [ ] Pay rent by Friday` with `<mark>rent</mark>` — the opening line (`line 1 of the meeting
  notes …`) is not shown. A note whose only match is its file name (`Notes/Rent ledger.md`) still falls back to the
  opening line and has no `mark`.
