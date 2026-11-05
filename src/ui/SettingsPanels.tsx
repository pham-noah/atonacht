import { useEffect, useState } from "react";
import { saveBytes } from "../lib/exportFile";
import { Fetcher, SyncStatus, fetchSyncStatus } from "../lib/syncthing";
import { noteCache } from "../lib/noteCache";
import { fs, isTauri } from "../lib/backend";
import { DAILY_TEMPLATE, STARTERS } from "../lib/templates";
import { useNav } from "../nav";
import { ACCENTS, Theme, usePrefs } from "../prefs";
import { useStore } from "../store";
import { openExternal } from "../lib/update";
import { Choice, Group, Row, Slider, TimeField, Toggle } from "./SettingsParts";

const THEMES: [Theme, string, string][] = [
  ["glass", "Liquid Glass", "Translucent panels over a night sky"],
  ["solid", "Solid", "Flat, high-contrast surfaces"],
  ["light", "Light", "Bright glass for daytime"],
];

export function AppearancePanel() {
  const { prefs, setPrefs } = usePrefs();
  const light = prefs.theme === "light";
  return (
    <>
      <div className="themes">
        {THEMES.map(([id, name, desc]) => (
          <label key={id} className={`themecard${prefs.theme === id ? " picked" : ""}`}>
            <span className={`mini mini-${id}`}><span /></span>
            <span className="tn"><input type="radio" name="theme" checked={prefs.theme === id} onChange={() => setPrefs({ theme: id })} />{name}</span>
            <span className="muted small">{desc}</span>
          </label>
        ))}
      </div>
      <Group>
        <Row label="Accent colour">
          <span className="swatches">
            {Object.entries(ACCENTS).map(([name, [dark, lt]]) => (
              <button key={name} className={`sw${prefs.accent === name ? " sel" : ""}`} style={{ background: light ? lt : dark }} onClick={() => setPrefs({ accent: name })} aria-label={`${name} accent`} aria-pressed={prefs.accent === name} />
            ))}
          </span>
        </Row>
        <Slider label="Text size" value={prefs.textSize} min={13} max={20} onChange={(v) => setPrefs({ textSize: v })} show={`${prefs.textSize}px`} />
        <Toggle label="Reduce transparency" hint="Turns glass panels into solid ones" value={prefs.reduceTransparency} onChange={(v) => setPrefs({ reduceTransparency: v })} />
      </Group>
    </>
  );
}

export function InterfacePanel() {
  const { prefs, setPrefs } = usePrefs();
  return (
    <>
    <Group>
      <Choice label="Start screen" value={prefs.startScreen} onChange={(v) => setPrefs({ startScreen: v })} options={[["home", "Home"], ["tasks", "Tasks"], ["board", "Board"], ["notes", "Notes"], ["calendar", "Calendar"]]} />
      <Toggle label="Open today’s note on launch" value={prefs.openTodayOnLaunch} onChange={(v) => setPrefs({ openTodayOnLaunch: v })} />
      <Choice label="Week starts on" value={prefs.weekStart} onChange={(v) => setPrefs({ weekStart: v })} options={[["mon", "Monday"], ["sun", "Sunday"]]} />
      <Choice label="Density" value={prefs.density} onChange={(v) => setPrefs({ density: v })} options={[["comfortable", "Comfortable"], ["compact", "Compact"]]} />
    </Group>
    <TabOrder />
    <Group title="Swipe actions on tasks (phone)">
      <Choice label="Swipe right" value={prefs.swipeRight} onChange={(v) => setPrefs({ swipeRight: v })} options={[["complete", "Complete"], ["none", "Nothing"]]} />
      <p className="muted small">Swipe a task all the way across, then let go. A swipe never opens the rename sheet.</p>
      <Choice label="Swipe left" value={prefs.swipeLeft} onChange={(v) => setPrefs({ swipeLeft: v })} options={[["tomorrow", "Tomorrow"], ["delete", "Delete"], ["none", "Nothing"]]} />
    </Group>
    </>
  );
}

const TAB_LABELS: Record<string, string> = { home: "Home", tasks: "Tasks", board: "Board", notes: "Notes", calendar: "Calendar" };

function TabOrder() {
  const { prefs, setPrefs } = usePrefs();
  const all = Object.keys(TAB_LABELS);
  const shown = prefs.tabs.filter((t) => all.includes(t));
  const rows = [...shown, ...all.filter((t) => !shown.includes(t))];
  const move = (i: number, d: number) => {
    const next = [...shown];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setPrefs({ tabs: next });
  };
  return (
    <Group title="Bottom bar (phone)">
      {rows.map((t) => {
        const on = shown.includes(t);
        const i = shown.indexOf(t);
        return (
          <div key={t} className="srow">
            <span className="grow">{TAB_LABELS[t]}</span>
            <input type="checkbox" checked={on} disabled={t === "home" || (on && shown.length <= 2)} aria-label={`Show ${TAB_LABELS[t]}`} onChange={(e) => setPrefs({ tabs: e.target.checked ? [...shown, t] : shown.filter((x) => x !== t) })} />
            <span className="movebtns">
              <button className="ib" disabled={!on || i === 0} onClick={() => move(i, -1)} aria-label={`Move ${TAB_LABELS[t]} up`}>▲</button>
              <button className="ib" disabled={!on || i === shown.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${TAB_LABELS[t]} down`}>▼</button>
            </span>
          </div>
        );
      })}
    </Group>
  );
}

export function EditorPanel() {
  const { prefs, setPrefs } = usePrefs();
  return (
    <>
      <Group>
        <Choice label="Font" value={prefs.editorFont} onChange={(v) => setPrefs({ editorFont: v })} options={[["sans", "Sans"], ["serif", "Serif"], ["mono", "Mono"]]} />
        <Slider label="Text size" value={prefs.editorSize} min={13} max={24} onChange={(v) => setPrefs({ editorSize: v })} show={`${prefs.editorSize}px`} />
        <Slider label="Line spacing" value={prefs.lineHeight} min={1.3} max={2.1} step={0.1} onChange={(v) => setPrefs({ lineHeight: Math.round(v * 10) / 10 })} show={prefs.lineHeight.toFixed(1)} />
      </Group>
      <Group>
        <Toggle label="Live Markdown" hint="Show checkboxes and headings as you type. Off shows the raw characters." value={prefs.livePreview} onChange={(v) => setPrefs({ livePreview: v })} />
        <Toggle label="Spellcheck" value={prefs.spellcheck} onChange={(v) => setPrefs({ spellcheck: v })} />
      </Group>
      <p className="muted small">Tip: Ctrl or Cmd + click a [[link]] to open that note. Pressing Enter in a list continues it.</p>
    </>
  );
}

export function TasksPanel() {
  const { prefs, setPrefs } = usePrefs();
  return (
    <>
      <Group>
        <Choice label="Default due date for new tasks" value={prefs.defaultDue} onChange={(v) => setPrefs({ defaultDue: v })} options={[["none", "None"], ["today", "Today"], ["tomorrow", "Tomorrow"]]} />
        <Choice label="Unfinished tasks from yesterday" value={prefs.carryOver} onChange={(v) => setPrefs({ carryOver: v })} options={[["ask", "Ask me"], ["auto", "Carry over"], ["off", "Leave"]]} />
        <Choice label="Show completed tasks for" value={prefs.doneDays} onChange={(v) => setPrefs({ doneDays: v })} options={[[7, "7 days"], [30, "30 days"], [0, "Always"]]} />
      </Group>
      <Group title="Board">
        <label className="field"><span>Columns between “To do” and “Done” (separate with commas)</span>
          <input className="in" aria-label="Board columns" defaultValue={prefs.kanbanColumns.join(", ")} spellCheck={false}
            onBlur={(e) => setPrefs({ kanbanColumns: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
        </label>
        <p className="muted small">A task is in a column when its line says @status(name). Checked tasks are in Done.</p>
      </Group>
      <Group title="Repeating tasks">
        <Choice label="Next task is made from the" value={prefs.repeatFrom} onChange={(v) => setPrefs({ repeatFrom: v })} options={[["due", "Due date"], ["completion", "Completion date"]]} />
      </Group>
      <p className="muted small mono">Task syntax in your notes: - [ ] Title @due(2026-11-01) @repeat(weekly) !high #tag</p>
    </>
  );
}

export function DailyPanel() {
  const { prefs, setPrefs } = usePrefs();
  const { templates, addStarterTemplates, save, moveDailyNotes, notes } = useStore();
  const [moved, setMoved] = useState<number | null>(null);
  const { go } = useNav();
  const [dir, setDir] = useState(prefs.dailyDir);
  const edit = async () => {
    if (templates[DAILY_TEMPLATE] === undefined) await save(DAILY_TEMPLATE, STARTERS[DAILY_TEMPLATE]);
    else await addStarterTemplates();
    go({ name: "editor", path: DAILY_TEMPLATE });
  };
  return (
    <>
      <Group>
        <label className="field"><span>Folder</span>
          <input className="in" value={dir} onChange={(e) => setDir(e.target.value)} spellCheck={false} aria-label="Daily notes folder" />
        </label>
        <div className="btnrow start"><button className="btn" disabled={!dir.trim() || dir.trim() === prefs.dailyDir} onClick={() => setPrefs({ dailyDir: dir.trim() })}>Save folder</button></div>
        <Row label="File name" hint="Always the date, so notes sort and sync cleanly"><span className="muted mono small">YYYY-MM-DD.md</span></Row>
        <Toggle label="Create today’s note when I open the app" value={prefs.autoCreateDaily} onChange={(v) => setPrefs({ autoCreateDaily: v })} />
      </Group>
      <Group title="Template">
        <Row label="Daily note template" hint="A normal note in Templates/. Edit it to change the sections each day starts with."><button className="pill" onClick={edit}>Edit template</button></Row>
      </Group>
      <Group title="Existing daily notes">
        <Row label="Move notes from another folder" hint="Moves every dated note from the folder below into the one above. Names already taken are left alone.">
          <button className="pill" onClick={async () => { const from = prompt("Move daily notes from which folder?", "Daily notes"); if (from && from !== prefs.dailyDir) setMoved(await moveDailyNotes(from.trim(), prefs.dailyDir)); }}>Move…</button>
        </Row>
        {moved !== null && <p className="muted small">Moved {moved} note{moved === 1 ? "" : "s"}. {Object.keys(notes).length} notes in total.</p>}
      </Group>
    </>
  );
}

export function RemindersPanel() {
  const { prefs, setPrefs } = usePrefs();
  const r = prefs.remind;
  const set = (p: Partial<typeof r>) => setPrefs({ remind: { ...r, ...p } });
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return (
    <>
      <Group>
        <Toggle label="Task reminders" hint="Notify when a task with a due date is due" value={r.enabled} onChange={(v) => set({ enabled: v })} />
        {r.enabled && (
          <>
            <TimeField label="Reminder time" value={r.time} onChange={(v) => set({ time: v })} />
            <Choice label="Remind me" value={r.daysBefore} onChange={(v) => set({ daysBefore: v })} options={[[0, "On the day"], [1, "A day before"]]} />
          </>
        )}
      </Group>
      <Group title="Nudges">
        <Toggle label="Daily plan" hint="A prompt to open today’s note" value={r.dailyPlan} onChange={(v) => set({ dailyPlan: v })} />
        {r.dailyPlan && <TimeField label="Daily plan time" value={r.planTime} onChange={(v) => set({ planTime: v })} />}
        <Toggle label="Weekly review" value={r.weeklyReview} onChange={(v) => set({ weeklyReview: v })} />
        {r.weeklyReview && (
          <>
            <Row label="Day"><select className="sel" aria-label="Weekly review day" value={r.reviewDay} onChange={(e) => set({ reviewDay: Number(e.target.value) })}>{days.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></Row>
            <TimeField label="Weekly review time" value={r.reviewTime} onChange={(v) => set({ reviewTime: v })} />
          </>
        )}
      </Group>
      <p className="muted small">
        {fs.native
          ? "On Android, reminders are handed to the system, so they fire even when the app is closed. On desktop they fire while Atonacht is running. If reminders arrive late on Android, allow Atonacht under “Alarms & reminders” in system settings."
          : "Reminders need the installed app. The browser demo can’t send notifications."}
      </p>
    </>
  );
}

export function SyncPanel() {
  const { prefs, setPrefs } = usePrefs();
  const { root, error, notes, conflicts, refresh } = useStore();
  const { go } = useNav();
  const [path, setPath] = useState(prefs.root);
  const [label, setLabel] = useState("");
  useEffect(() => {
    if (prefs.root && fs.describeRoot) fs.describeRoot(prefs.root).then(setLabel).catch(() => setLabel(""));
  }, [prefs.root]);
  return (
    <>
      <Group title="Notes folder">
        {path.startsWith("saf:") ? (
          <Row label="Folder" hint="Android only lets Atonacht see the folder you picked"><b>{label || "…"}</b></Row>
        ) : (
          <label className="field"><span>Folder on this device</span><input className="in mono" value={path} onChange={(e) => setPath(e.target.value)} spellCheck={false} /></label>
        )}
        <div className="btnrow start">
          {fs.pickFolder && <button className="btn" onClick={async () => { const r = await fs.pickFolder!(); if (r) { setPath(r); setPrefs({ root: r }); } }}>Choose folder…</button>}
          {!path.startsWith("saf:") && <button className={fs.pickFolder ? "pill" : "btn"} disabled={!path.trim() || path === root} onClick={() => setPrefs({ root: path.trim() })}>Use this folder</button>}
        </div>
        <p className="muted small">{Object.keys(notes).length} notes loaded. Atonacht only reads and writes Markdown files inside this folder. Deleted notes go to a hidden .trash folder.</p>
        {error && <p className="errtext">{error}</p>}
        {!fs.native && <p className="muted small">You are running the browser demo. Notes are kept in this browser, not in files.</p>}
      </Group>
      <SyncSetup folder={path.startsWith("saf:") ? label || path : path} />
      <Group title="When something changes">
        <Row label="Conflicts" hint="Atonacht keeps both copies instead of choosing for you">{conflicts.length ? <button className="pill on" onClick={() => go({ name: "conflicts" })}>{conflicts.length} to review</button> : <span className="chip hi">None</span>}</Row>
        <Row label="Pick up changes now" hint="Atonacht watches the folder; this forces a re-read"><button className="pill" onClick={refresh}>Check now</button></Row>
        {!fs.native && <Row label="Demo notes" hint="Throw away what the browser demo stored"><button className="pill" onClick={() => { localStorage.removeItem("atonacht.demo"); location.reload(); }}>Reset</button></Row>}
      </Group>
    </>
  );
}

/**
 * Syncthing setup, written for someone who has never used Syncthing.
 *
 * The old panel dropped two bare inputs ("address", "API key") on the reader with a one-line hint, which is useless
 * unless you already know that Syncthing runs a web interface on port 8384 and hides a key in its settings. This walks
 * through install -> share the folder -> connect, and says what each part is for.
 */
function SyncSetup({ folder }: { folder: string }) {
  const [copied, setCopied] = useState("");
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(""), 1600);
    } catch {
      setCopied("");
    }
  };
  return (
    <Group title="Sync with Syncthing">
      <p className="muted small">
        Atonacht never uploads anything. <b>Syncthing</b> copies the notes folder between your own devices, and Atonacht
        reloads the files as they arrive. Make the folder the same on both devices first; the status read-out below is
        optional.
      </p>

      <div className="step">
        <span className="stepn">1</span>
        <div className="grow">
          <b>Install Syncthing on both devices</b>
          <p className="muted small">
            On Android use <b>Syncthing-Fork</b>. On a computer, syncthing.net. You do not need an account: the two devices
            find each other by device ID.
          </p>
          <div className="btnrow start">
            <button className="pill" onClick={() => openExternal("https://syncthing.net/downloads/")}>Downloads</button>
            <button className="pill" onClick={() => openExternal("https://github.com/Catfriend1/syncthing-android/releases")}>Android build</button>
          </div>
        </div>
      </div>

      <div className="step">
        <span className="stepn">2</span>
        <div className="grow">
          <b>Share this notes folder</b>
          <p className="muted small">
            In Syncthing choose <b>Add Folder</b>, point it at the folder Atonacht uses, then accept the share on the other
            device and pick the same folder there. Do not place it inside another synced folder.
          </p>
          <div className="btnrow start">
            <button className="pill" onClick={() => copy(folder)}>{copied === folder ? "Copied" : "Copy folder path"}</button>
          </div>
          <p className="muted small">
            Only Markdown files matter; everything else in the folder is ignored. The hidden <span className="mono">.trash</span> folder
            is safe to sync.
          </p>
        </div>
      </div>

      <div className="step">
        <span className="stepn">3</span>
        <div className="grow">
          <b>Optional: see Syncthing's status here</b>
          <p className="muted small">
            This is a read-out, not the sync itself. Syncthing runs a small web interface; Atonacht asks it which devices
            are connected and how far the folder has synced.
          </p>
          <details className="howto">
            <summary>Where do I find the address and the key?</summary>
            <p className="muted small">
              <b>Address</b>: on the same device it is <span className="mono">http://127.0.0.1:8384</span>. To watch another
              device use its address, e.g. <span className="mono">http://192.168.1.20:8384</span>.
            </p>
            <p className="muted small">
              <b>API key</b>: open Syncthing's web interface, then <b>Actions</b> (top right) → <b>Settings</b> → <b>General</b>
              → the field called <b>API Key</b>. In the Android app, the same menu entry opens that web interface.
            </p>
          </details>
          <SyncthingStatus />
        </div>
      </div>
    </Group>
  );
}

function SyncthingStatus() {
  const { prefs, setPrefs } = usePrefs();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const check = async () => {
    setBusy(true);
    setErr("");
    try {
      // Inside the app the request goes through Tauri's HTTP plugin (limited to localhost); a browser would be blocked by CORS.
      const f = (isTauri() ? (await import("@tauri-apps/plugin-http")).fetch : window.fetch.bind(window)) as unknown as Fetcher;
      setStatus(await fetchSyncStatus(prefs.syncthingUrl, prefs.syncthingKey, f));
    } catch (e) {
      setStatus(null);
      const raw = e instanceof Error ? e.message : String(e);
      // say what to do, instead of repeating what the browser said
      if (/rejected the API key|401|403/i.test(raw)) setErr("Syncthing answered, but it did not accept that key. Copy the API key again from Settings → General.");
      else if (/Failed to fetch|NetworkError|load failed|CORS/i.test(raw)) setErr(`Nothing answered at ${prefs.syncthingUrl}. Is Syncthing running on that device, and is the address right? (The browser demo cannot reach it at all.)`);
      else setErr(`Could not read Syncthing: ${raw}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="syncbox">
      {/* A form keeps the password field from being offered to the browser's password manager as a login. */}
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (!busy && prefs.syncthingKey) void check(); }}>
        <label className="field"><span>Address</span><input className="in mono" value={prefs.syncthingUrl} onChange={(e) => setPrefs({ syncthingUrl: e.target.value })} spellCheck={false} placeholder="http://127.0.0.1:8384" /></label>
        <label className="field"><span>API key</span><input className="in mono" type="password" value={prefs.syncthingKey} onChange={(e) => setPrefs({ syncthingKey: e.target.value })} spellCheck={false} autoComplete="off" placeholder="Paste the key" /></label>
        <div className="btnrow start"><button className="btn" type="submit" disabled={busy || !prefs.syncthingKey}>{busy ? "Checking…" : "Test connection"}</button></div>
      </form>
      {err && <p className="errtext">{err}</p>}
      {status && (
        <>
          <div className="cap">Devices</div>
          {status.devices.length === 0 && <p className="muted small">No other devices are set up yet.</p>}
          {status.devices.map((d) => <Row key={d.id} label={d.name}>{d.connected ? <span className="chip hi">Connected</span> : <span className="chip">Offline</span>}</Row>)}
          <div className="cap">Folders</div>
          {status.folders.length === 0 && <p className="muted small">Syncthing has no folders yet. Add the notes folder in Syncthing first.</p>}
          {status.folders.map((f) => <Row key={f.id} label={f.label} hint={f.path}><span className={`chip${f.state === "idle" && f.completion === 100 ? " hi" : ""}`}>{f.state === "idle" && f.completion === 100 ? "Up to date" : `${f.completion}% · ${f.state}`}</span></Row>)}
        </>
      )}
      <p className="muted small">The key stays on this device and is only sent to the address above.</p>
    </div>
  );
}

export function FilesPanel() {
  const { prefs, setPrefs } = usePrefs();
  const { all, save } = useStore();
  const [msg, setMsg] = useState("");
  const [withSettings, setWithSettings] = useState(false);
  const exportAll = async () => {
    setMsg("");
    try {
      const { root: _r, syncthingKey: _k, ...settings } = prefs; // never export the folder handle or the API key
      void _r; void _k;
      const { backupName, buildBackup } = await import("../lib/backup"); // the ZIP library loads only when you use it
      const ok = await saveBytes(backupName(), buildBackup(all, settings));
      setMsg(ok ? `Saved a backup of ${Object.keys(all).length} notes.` : "Cancelled.");
    } catch (e) {
      setMsg(`Could not save the backup: ${e instanceof Error ? e.message : e}`);
    }
  };
  const restore = async (file: File) => {
    setMsg("");
    try {
      const { readBackup } = await import("../lib/backup");
      const { notes, settings } = readBackup(new Uint8Array(await file.arrayBuffer()));
      let added = 0;
      let skipped = 0;
      for (const [p, c] of Object.entries(notes)) {
        if (all[p] !== undefined) skipped++;
        else { await save(p, c); added++; }
      }
      if (withSettings && settings && typeof settings === "object") {
        const { root: _r, syncthingKey: _k, onboarded: _o, ...rest } = settings as Record<string, unknown>;
        void _r; void _k; void _o;
        setPrefs(rest as Partial<typeof prefs>);
      }
      setMsg(`Restored ${added} note${added === 1 ? "" : "s"}. ${skipped} already existed and were left alone.`);
    } catch (e) {
      setMsg(`That doesn’t look like an Atonacht backup: ${e instanceof Error ? e.message : e}`);
    }
  };
  return (
    <>
      <Group title="Back up">
        <Row label="Export all notes" hint={`${Object.keys(all).length} notes and your settings, as one ZIP file`}><button className="btn" onClick={exportAll}>Export…</button></Row>
        <p className="muted small">Your notes are already plain files in your notes folder. A ZIP is a convenient copy to keep somewhere else.</p>
      </Group>
      <Group title="Restore">
        <label className="srow"><span className="grow">Restore settings too</span><input type="checkbox" checked={withSettings} onChange={(e) => setWithSettings(e.target.checked)} /></label>
        <div className="field">
          <span>Choose a backup ZIP. Notes that already exist are never overwritten.</span>
          <label className="filepick">
            <input type="file" accept=".zip,application/zip" aria-label="Backup file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void restore(f); e.target.value = ""; }} />
            <span className="pill">Choose file…</span>
          </label>
        </div>
      </Group>
      {msg && <p className="muted" role="status">{msg}</p>}
      <Group title="Fast startup">
        <Toggle label="Keep a copy of my notes for faster starts" hint="Stored in Atonacht's own app storage. The app then reads only notes that changed since last time." value={prefs.startupCache} onChange={(v) => { setPrefs({ startupCache: v }); if (!v) void noteCache.clear(); }} />
        <Row label="Clear the cached copy" hint="Your notes are untouched. The next start just takes a little longer."><button className="pill" onClick={async () => { await noteCache.clear(); setMsg("Cleared the cached copy."); }}>Clear</button></Row>
      </Group>
      <FolderCheck />
      <Group title="Trash">
        <Choice label="Delete trashed notes after" value={prefs.trashDays} onChange={(v) => setPrefs({ trashDays: v })} options={[[7, "7 days"], [30, "30 days"], [90, "90 days"], [0, "Never"]]} />
      </Group>
      <p className="muted small">Deleted notes wait in Trash, then are deleted for good after the time above. Choose “Never” to empty it yourself.</p>
    </>
  );
}

/**
 * Turns "it doesn't work on my phone" into something the person can read out: which step of the folder fails.
 * Runs the four things the app does with the notes folder, in order, and says what each one returned.
 */
function FolderCheck() {
  const { prefs } = usePrefs();
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const out: string[] = [];
    const step = async (label: string, fn: () => Promise<string>) => {
      try {
        out.push(`${label}: ${await fn()}`);
      } catch (e) {
        out.push(`${label}: failed — ${e instanceof Error ? e.message : String(e)}`);
      }
    };
    const root = prefs.root;
    await step("folder", async () => (fs.describeRoot ? await fs.describeRoot(root) : root || "(none chosen)"));
    let first = "";
    await step("listed", async () => {
      const entries = await fs.list(root);
      const notes = entries.filter((e) => e.kind === "file");
      first = notes[0]?.path ?? "";
      return `${notes.length} notes and ${entries.filter((e) => e.kind === "dir").length} folders`;
    });
    await step("read", async () => {
      if (!first) return "no note to read";
      const text = await fs.read(root, first);
      return `${first}: ${text.length} characters${text ? ` (“${text.slice(0, 40).replace(/\s+/g, " ")}”)` : " — EMPTY"}`;
    });
    await step("daily template", async () => {
      const t = await fs.read(root, "Templates/Daily note.md").catch(() => null);
      return t === null ? "no Templates/Daily note.md here — new days use the built-in template" : `Templates/Daily note.md found (${t.length} characters)`;
    });
    await step("write", async () => {
      const probe = `# Atonacht folder check\n\nWritten ${new Date().toISOString()}\n`;
      await fs.write(root, "Atonacht check.md", probe);
      const back = await fs.read(root, "Atonacht check.md");
      return back === probe ? "wrote a note and read the same text back" : `wrote ${probe.length} characters, read back ${back.length}`;
    });
    await step("clean up", async () => {
      if (!first) return "nothing to tidy";
      await fs.remove(root, "Atonacht check.md");
      return "the test note is in the trash";
    });
    setLines(out);
    setBusy(false);
  };
  return (
    <Group title="Notes folder">
      <Row label="Test the notes folder" hint="Lists it, reads a note, writes one and reads it back.">
        <button className="btn" onClick={run} disabled={busy}>{busy ? "Testing…" : "Run test"}</button>
      </Row>
      {lines.length > 0 && <ul className="checklines" role="status">{lines.map((l) => <li key={l}>{l}</li>)}</ul>}
    </Group>
  );
}

export function PrivacyPanel({ available, android = false }: { available: boolean; android?: boolean }) {
  const { prefs, setPrefs } = usePrefs();
  return (
    <>
      <Group>
        <Toggle label="App lock" hint={available ? "Ask for your fingerprint, face or screen lock when opening the app" : "Available in the phone app"} value={prefs.appLock && available} onChange={(v) => available && setPrefs({ appLock: v })} />
        {available && prefs.appLock && <Choice label="Lock after" value={prefs.lockAfter} onChange={(v) => setPrefs({ lockAfter: v })} options={[[0, "Right away"], [60_000, "1 minute"], [300_000, "5 minutes"]]} />}
      </Group>
      {android && (
        <Group title="On screen">
          <Toggle label="Hide content in recent apps" hint="The recent-apps card shows a blank instead of your notes" value={prefs.hideInRecents} onChange={(v) => setPrefs({ hideInRecents: v })} />
          <Toggle label="Block screenshots and screen recording" hint="Also hides the app in recent apps on Android 12 and older" value={prefs.blockScreenshots} onChange={(v) => setPrefs({ blockScreenshots: v })} />
        </Group>
      )}
      <Group><p className="muted small">App lock protects the app, not the files. Your notes are plain Markdown in your notes folder, so use device encryption to protect them if the phone is lost. For faster starts Atonacht also keeps a copy of your notes in its own app storage; you can turn that off in Files &amp; backup.</p></Group>
    </>
  );
}
