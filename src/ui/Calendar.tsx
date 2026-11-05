import { useState } from "react";
import { MONTHS, longDate, pad, parseDate, shortLongDate, today } from "../lib/dates";
import { useWide } from "../useWide";
import { dailyPath } from "../lib/daily";
import { snippet } from "../lib/markdown";
import { useNav } from "../nav";
import { usePrefs } from "../prefs";
import { useStore } from "../store";
import { Icon, TaskRow } from "./common";

export function Calendar({ date }: { date?: string }) {
  const { notes, tasks, openDaily, ready } = useStore();
  const { go } = useNav();
  const { prefs } = usePrefs();
  const mon = prefs.weekStart === "mon";
  const wide = useWide();
  const [sel, setSel] = useState(date ?? today());
  const [view, setView] = useState(() => {
    const d = parseDate(date ?? today());
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const lead = (new Date(view.y, view.m, 1).getDay() + (mon ? 6 : 0)) % 7;
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const shift = (n: number) => setView(({ y, m }) => {
    const d = new Date(y, m + n, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const dayPath = dailyPath(sel);
  const note = notes[dayPath];
  // Tasks written in that day's note (no due date needed) plus tasks elsewhere that fall due on it.
  const inNote = tasks.filter((t) => t.path === dayPath);
  const dueOn = tasks.filter((t) => t.due === sel && t.path !== dayPath);

  const openIn = new Set(tasks.filter((t) => !t.done).map((t) => t.path));
  const dueDays = new Set(tasks.filter((t) => !t.done && t.due).map((t) => t.due!));

  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(<span key={`b${i}`} />);
  for (let d = 1; d <= days; d++) {
    const key = `${view.y}-${pad(view.m + 1)}-${pad(d)}`;
    const open = dueDays.has(key) || openIn.has(dailyPath(key));
    const has = notes[dailyPath(key)] !== undefined;
    cells.push(
      <button key={key} className={`d${key === sel ? " on" : ""}${open ? " o" : has ? " n" : ""}`} onClick={() => setSel(key)} aria-label={longDate(key)} aria-pressed={key === sel}>{d}</button>,
    );
  }

  return (
    <>
      <div className="pagehead">
        <h1 className="ttl calttl grow">{MONTHS[view.m]} {view.y}</h1>
        <button className="ib" onClick={() => shift(-1)} aria-label="Previous month"><Icon name="back" /></button>
        <button className="ib" onClick={() => shift(1)} aria-label="Next month"><Icon name="fwd" /></button>
      </div>
      <div className="cal">
        {(mon ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]).map((x) => <b key={x}>{x}</b>)}
        {cells}
      </div>
      <p className="muted small legend">Blue dot: open tasks due. Grey dot: a daily note exists.</p>
      <section className="card stack">
        <div className="rowhead"><h2 className="h2 dayttl grow">{wide ? longDate(sel) : shortLongDate(sel)}</h2>
          <button className="btn" onClick={async () => go({ name: "editor", path: await openDaily(sel) })}>{note ? "Open note" : "Create note"}</button>
        </div>
        {note && snippet(note, 160) && <p className="muted">{snippet(note, 160)}</p>}
        {inNote.length > 0 && <div className="cap">Tasks in this note</div>}
        {inNote.map((t) => <TaskRow key={t.id} task={t} source={false} />)}
        {dueOn.length > 0 && <div className="cap">{inNote.length ? "Also due" : "Due"}</div>}
        {dueOn.map((t) => <TaskRow key={t.id} task={t} />)}
        {/* while the folder is still being read, "nothing on this day" would be a lie that flashes on screen */}
        {!ready && <p className="muted">Reading your notes…</p>}
        {ready && !note && dueOn.length === 0 && <p className="muted">Nothing on this day.</p>}
        {note && inNote.length === 0 && dueOn.length === 0 && <p className="muted">Nothing planned on this day.</p>}
      </section>
    </>
  );
}

