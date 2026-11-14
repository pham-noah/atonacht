# Evidence for the items in `ATONACHT_IMPROVEMENT_SPEC.md`

Captured 2026-11-14 on `master` (after `bb734c7`, `66d795d`, `5839f45`) by driving the real app in headless
Chromium at **390×844, 2× DPR** against `npx vite` with the demo file layer, so each picture is the app running,
not a mock. Screenshots are full-viewport.

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
