import { useState } from "react";
import { fs } from "../lib/backend";
import { DAILY_TEMPLATE, STARTERS } from "../lib/templates";
import { useNav } from "../nav";
import { usePrefs } from "../prefs";
import { useStore } from "../store";
import { Choice, Group, Row, Slider, TimeField, Toggle } from "./SettingsParts";

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
        <Choice label="Default due date for new tasks" value={prefs.defaultDue} onChange={(v) => setPrefs({ defaultDue: v })} options={[["today", "Today"], ["tomorrow", "Tomorrow"], ["none", "No date"]]} />
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
        <TimeField label="Stay quiet from" value={r.quietFrom} onChange={(v) => set({ quietFrom: v })} />
        <TimeField label="Until" value={r.quietTo} onChange={(v) => set({ quietTo: v })} />
        <p className="muted small">Anything that would arrive inside this window waits until it ends, so a task due at 23:00 is announced in the morning instead of at midnight.</p>
      </Group>
      <p className="muted small">
        {fs.native
          ? "On Android, reminders are handed to the system, so they fire even when the app is closed. On desktop they fire while Atonacht is running. If reminders arrive late on Android, allow Atonacht under “Alarms & reminders” in system settings."
          : "Reminders need the installed app. The browser demo can’t send notifications."}
      </p>
    </>
  );
}
