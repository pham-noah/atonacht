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
