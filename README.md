# Atonacht

Daily notes and to-dos kept as plain Markdown files. Desktop and Android from one codebase (Tauri 2 + React).
Sync is done by Syncthing, so there is no server and your notes are never locked in.

## What it does

- **Home**: today's note (created automatically), quick add, carry-over of yesterday's unfinished tasks, "due today", pinned notes, folders you can create.
- **All tasks**: every `- [ ]` from every note, grouped Overdue / Today / This week / Later / No date. Check them off in place and it writes to the source note. Filter by tag. Tap a task to edit due date, priority and repeat.
- **Board (Kanban), drag and drop**: move cards by dragging them. Mouse and pen: press and move. Touchscreen: press and hold, then drag (swiping scrolls the board as usual, and holding near the screen edge scrolls it for you). Keyboard: focus a card, press Space, use the arrow keys, press Space again to drop (Escape cancels). There are no card menus. On a phone the columns stack down the page (To do, Doing, Done) and each column's cards scroll sideways, so you read one category at a time. A `+ Column` button adds a category from the board itself.
  - **All tasks board**: To do, Doing and Done (and any columns you add in Settings → Tasks). A card's column is stored in its line as `@status(doing)`; checked tasks are in Done (a repeating task dropped in Done starts its next round in To do). Sort cards by priority, due date, order in their notes, or A to Z. It shows tasks from every note that is not a project board.
  - **Project boards**: a board per project, saved as a note in `Boards/` in the format Obsidian's Kanban plugin uses (`kanban-plugin: basic`, columns are `##` headings, cards are list items), so the same file opens in both apps. The order of cards in the file is their order on the board, so dragging also **reorders** cards inside a column. Dropping a card in a column named Done (or marked `**Complete**`) checks it and stamps `@done`. Add, edit and delete cards, add columns, or open the board as a plain note.
- **Recurring tasks**: checking a repeating task adds the next one (`daily`, `weekdays`, `weekly`, `weekly:thu`, `monthly`, `monthly:29`, `yearly`), counted from the due date or the completion date.
- **Markdown editor**: the raw Markdown stays on screen on every line (`##`, `- [ ]`, `@due(…)`), with headings sized, `@due` / `!high` / `#tag` chips and `[[links]]` styled in place (CodeMirror). Click the `- [ ]` of a task to tick it off. Enter continues lists and Ctrl/Cmd + click a link opens it. Switching Live Markdown off in Settings gives plain text with no styling.
- **Preview with per-line editing**: the eye button renders the note, and a line can be edited where it stands — double-click it, change the Markdown, and Enter writes back just that line (Shift+Enter adds a line, Esc cancels).
- **Notes, folders, search, calendar.** A folder with thousands of notes draws a page at a time, with Show more. The calendar lists the tasks written in the selected day's note as well as the ones due that day. Rename or move a note, rename or delete a folder (its notes go to the trash), and a **Trash** screen to restore or delete for good.
- **Command palette** (Ctrl/Cmd + K): jump to any note or run an action.
- **Swipe actions on tasks** (phone): swipe right to complete, left to move to tomorrow. The bottom tabs can be hidden and reordered.
- **Backup**: export every note and your settings as one ZIP, or restore from one (existing notes are never overwritten).
- **App lock** (phone): fingerprint, face or screen lock when opening the app. On Android you can also hide the app in recent apps and block screenshots.
- **The trash empties itself** after 7, 30 or 90 days (or never). The deletion time is kept in the file name, e.g. `Plan (trashed 1730200000).md`, so it survives syncing.
- **Syncthing status**: devices and folder progress, read from Syncthing's local API with your API key. Settings → Sync walks through it as three numbered steps (install, share the folder, then optionally connect) and explains where the address and the key live, instead of dropping two bare fields on you.
- **Weekly review**: finished tasks, move each open task to next week / someday / drop, plan the week. Saves a summary note in `Weekly reviews/`.
- **Pinned notes and templates**: pin from the editor (stored as `pinned: true` front matter, so it syncs). Templates are plain notes in `Templates/` with `{{title}}`, `{{date}}`, `{{long_date}}`. Edit `Templates/Daily note.md` to change how each day starts.
- **Sync conflicts**: Syncthing's `*.sync-conflict-*` copies are detected, shown as a diff, and resolved with Keep this device / Keep other / Keep both. Nothing is deleted; it moves to `.trash`.
- **Reminders**: due-date reminders at a time you choose, an optional daily plan nudge and weekly review nudge. On Android they are scheduled with the system, so they fire when the app is closed. On desktop they fire while the app is running.
- **Android folder picker**: choose your notes folder with the system picker. No "all files" permission needed.
- **Android widgets and share sheet**: a "Today" widget listing overdue and due-today tasks (tap a task to open the app, + to capture), a quick-add bar widget, and "Add to Atonacht" in the share sheet.
- **About**: the version, a **check for updates** against the GitHub releases (it tells you when a newer APK or release exists), Made by Pham-Noah, Atonacht on GitHub, the open-source licences, and **Report a problem**, which opens a GitHub issue with your version and platform already in it.
- **Settings**: Appearance, Interface, Editor, Tasks, Daily note, Reminders, Sync, Files & backup, Privacy & lock, About.

## Note format

Plain Markdown. A task is a checkbox line, with optional plain-text metadata:

```
- [ ] Draft methods section @due(2026-10-30) !high #thesis [[Thesis outline]]
- [ ] Renew bus pass @due(2026-11-01) @repeat(monthly)
- [ ] Draft methods section @status(doing)
- [x] Pay rent @done(2026-10-29)
- [>] Moved to another day (written by carry-over)
- [-] Dropped in the weekly review
```

Daily notes are `Daily notes/YYYY-MM-DD.md` (folder configurable). Anything starting with `.` (`.trash`, `.stfolder`, `.stversions`) is ignored.

## Run it

```bash
npm install
npm test              # 148 unit and UI tests
npm run dev           # browser demo with sample notes (no real files, no notifications)
```

Desktop app (needs Rust >= 1.77 and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)):

```bash
npm run tauri dev
npm run tauri build
```

On first run you pick the notes folder (default `~/Documents/Atonacht`). Share that folder in Syncthing.

### Android

```bash
npm run android:setup     # tauri android init, then installs the widget, share receiver and permissions
npm run tauri android dev
```

1. On first run, tap **Choose folder** and pick the folder Syncthing syncs (for example `Documents/Atonacht`). Android asks once; Atonacht can only see that folder.
2. Use Syncthing-Fork or BasicSync to share the same folder with your desktop.
3. Reminders: allow notifications when asked. If they arrive late, allow Atonacht under "Alarms & reminders" in system settings.
4. Add the widgets from the home screen widget picker ("Atonacht"). Share any text to "Add to Atonacht".
5. The widget list is refreshed whenever the app is open. If you add the widget before opening the app once, it shows "Nothing due today" until then.

## Performance

Measured in the build sandbox (not on a phone):

| | Before | Now |
| --- | --- | --- |
| First download (JavaScript, compressed) | 265 KB | 72 KB. The editor, settings, weekly review and the ZIP code load when first used |
| Saving a note in a 5,000-note folder (work done after each save) | about 300 ms | about 30 ms. Only the note you changed is parsed again |
| Task list with thousands of open tasks | drew every row | draws 100 per section, with "Show more" |
| Saving a note while the task list is open | every task row redrew | only the rows of the note you changed redraw |
| Typing in a 20,000-line note | about 60 to 75 ms per keystroke of styling work | about 5 ms. Only the lines on screen are styled |
| Starting the app with a big folder | read every note, every time | shows last time's notes at once and reads only notes that changed (see below) |
| First tap on a note or Settings | waited for the editor to download | the editor and Settings are fetched in the background once the app is idle |

**Fast startup cache.** Atonacht keeps a copy of your notes in its own app storage (IndexedDB) so the next start can show them immediately and read only what changed. It is not in your notes folder and does not sync. Turn it off or clear it in Settings → Files & backup. Until the first check against the folder finishes (a moment), a note changed on another device can still show its older text.

Parsing 70,000 tasks from scratch takes about a quarter of a second, and listing 3,000 notes on desktop takes well under a second. Phone speeds will be lower; Android's folder access is slower than a normal disk, which is why it checks for changes every 8 seconds.

## Layout

```
src/lib/        pure logic (tasks, repeats, daily notes, carry-over, conflicts, diff, markdown, reminders, weekly)
src/lib/        file layers: tauriFs (desktop), safFs (Android folder picker), memFs (browser demo)
src/store.tsx   loads all notes, polls for changes, writes through the file layer
src/ui/         screens, live editor (live.ts + LiveEditor.tsx), settings
src-tauri/src/notes_fs.rs   desktop file layer (path safety, atomic saves, trash, watcher filter), unit tested
.github/ RELEASING.md fastlane/   CI, release builds, signing and store text
android/ scripts/           widget, share receiver, manifest patch (apply-android.sh)
```

## What has been checked, and what has not

Checked in the build sandbox:
- TypeScript type-check and production web build.
- 148 tests: task parsing, repeat rules, carry-over, conflicts and diff, pins, templates, week maths, reminder planning, the editor's decorations and typing/sync behaviour, editing one line of the preview, the calendar listing a day's tasks, the update check and its release parsing, a save that cannot land whole (including two saves of one note at once), folder counts, the startup cache retrying after IndexedDB refuses, a page of a big notes folder at a time, the Android folder-picker layer against a fake document provider (including recovering when a sync app replaces a file), and UI flows (carry over, check off, resolve a conflict, pin, templates, weekly review, settings changing behaviour).
- The Rust shell compiles on Linux **and on Windows** (`cargo check`, Tauri 2.12 with the notification, deep-link, dialog and Android file-system plugins registered), and the desktop file layer's **12 unit tests pass** (`cargo test`).
- The Android install script runs cleanly (twice) against a stand-in project and produces valid XML.
- The Android Kotlin files compile with a real Kotlin compiler against **stand-in** Android classes I wrote from memory, and the Rust-to-Kotlin bridge type-checks for the `aarch64-linux-android` target. That catches typos and type errors, not wrong Android API details.
- Saving on Android is verified by reading the note back and retrying (tested with a fake provider that tears writes).

**Not checked** (no device, emulator or Android SDK here, and the app was never launched):
- Running the desktop app, or any screen's actual look and feel.
- The phone-only fingerprint plugin (it is not built on Linux), the Syncthing status against a real Syncthing, and the GitHub release workflows (the YAML parses, but they have never run).
- Android: the system folder picker and real document providers (Syncthing-Fork's folder behaves like any other, but providers differ), scheduled notifications, both widgets, the share sheet, the `atonacht://` links, the screenshot and recents options, the Rust-to-Kotlin calls at runtime (they rely on the app's context being available to native code), and Gradle building the Kotlin files.
- Google Play: the widget and notification permissions are standard, but you'd still need a store listing and signing.

The app was also opened in headless Chromium at desktop (1280×800) and phone (390×844) sizes to look at the main screens, in the Glass, Solid and Light themes. That found and fixed several layout problems. It is not an Android WebView, so real phones may still differ.

Expect small fixes on the first real Android run.

## Known gaps

- Android can't swap a finished file into place, so a save briefly empties the note before writing it. Atonacht reads it back and rewrites if it isn't right, and never checks for changes mid-save, but a sync app could still catch a half-written note in rare cases. In Syncthing, leave the folder's "Watcher delay" at its default (10 s) or higher.
- Android checks for changes every 8 seconds; only desktop has a file watcher.
- You can't tick tasks off from the widget; tapping one opens the app.
- "Hide content in recent apps" uses an Android 13+ setting. On older Android it falls back to blocking screenshots too (a limit of Android).
- Notes deleted before this version have no deletion time; their 30-day clock starts the first time the app sees them.
- No quiet hours for reminders, no per-task reminder times (only a date), no iOS build.

See `RELEASING.md` for versioning, signing and where to publish.

## On a phone

- **Back gesture**: it closes whatever you opened last - a sheet, the sidebar drawer, a Settings section - then walks back to the screen you came from, then to Home, and only then leaves the app.
- **Pressing a task** renames it (one small sheet). **Holding** it opens the whole editor: due date, priority, repeat, board column.
- **Full screen**: the status bar and the navigation bar stay hidden, like a reader in a book. Swipe from an edge to pull them in for a moment.

## Publishing and the Play Store

- **Licence**: Apache-2.0 (`LICENSE`). The bundled fonts are SIL OFL 1.1 (`licences/`), the libraries are listed in `THIRD-PARTY.md`.
- **Android signing**: the release key lives in `Atonacht-keys/` (git-ignored, never committed). `scripts/sign-release.sh` signs an APK with it; the CI workflow expects it as the secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_ALIAS=atonacht`. An APK signed with a different key cannot update an installed one — keep that file.
- **Backups**: `android:allowBackup` is `false`. The notes folder is the user's own (Syncthing copies it); the app's internal cache should not become a second, invisible copy in Google's cloud.
- **Exact alarms**: reminders use `SCHEDULE_EXACT_ALARM`, which Google Play only allows with a declared, justified use (a reminder that fires at the minute the user chose). Publishing on Play means either documenting that use in the listing or accepting inexact delivery.
