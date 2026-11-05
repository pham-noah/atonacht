import { useState } from "react";
import { addDays, today } from "../lib/dates";
import { usePrefs } from "../prefs";
import { groupTasks } from "../lib/tasks";
import { useStore } from "../store";
import { PageHead, TaskRow } from "./common";

const PAGE = 100; // rows drawn per section before "Show more"

export function Tasks() {
  const { tasks, addTaskToToday } = useStore();
  const { prefs } = usePrefs();
  const [status, setStatus] = useState<"open" | "done">("open");
  const [tag, setTag] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [more, setMore] = useState<Record<string, number>>({}); // extra rows revealed per section
  const base = tag ? tasks.filter((t) => t.tags.includes(tag)) : tasks;
  const tags = [...new Set(tasks.flatMap((t) => t.tags))].sort();
  const g = groupTasks(base, today());
  const open = base.filter((t) => !t.done).length;
  const sections: [string, typeof base][] = [["Overdue", g.overdue], ["Today", g.today], ["This week", g.week], ["Later", g.later], ["No date", g.nodate]];

  return (
    <>
      <PageHead sub={`${open} open across ${new Set(tasks.filter((t) => !t.done).map((t) => t.path)).size} notes`} title="All tasks" />
      <div className="pills">
        <button className={`pill${status === "open" ? " on" : ""}`} onClick={() => setStatus("open")}>Open</button>
        <button className={`pill${status === "done" ? " on" : ""}`} onClick={() => setStatus("done")}>Done</button>
        {tags.map((x) => (
          <button key={x} className={`pill${tag === x ? " on" : ""}`} onClick={() => setTag(tag === x ? null : x)}>#{x}</button>
        ))}
      </div>
      <form className="addrow" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { addTaskToToday(text.trim()); setText(""); } }}>
        <input className="in" placeholder="Add a task to today’s note" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn" type="submit">Add</button>
      </form>
      <section className="card">
        {status === "open" ? (
          sections.map(([title, list]) => list.length > 0 && (
            <div key={title}><div className="cap">{title}{list.length > PAGE && <span className="muted"> · {list.length}</span>}</div>
              {list.slice(0, PAGE + (more[title] ?? 0)).map((t) => <TaskRow key={t.id} task={t} />)}
              {list.length > PAGE + (more[title] ?? 0) && <button className="pill" onClick={() => setMore({ ...more, [title]: (more[title] ?? 0) + PAGE })}>Show {Math.min(PAGE, list.length - PAGE - (more[title] ?? 0))} more</button>}
            </div>
          ))
        ) : (
          base.filter((t) => t.done && (prefs.doneDays === 0 || (t.doneOn && t.doneOn >= addDays(today(), -prefs.doneDays)))).slice(0, 100).map((t) => <TaskRow key={t.id} task={t} />)
        )}
        {(status === "open" ? open === 0 : base.filter((t) => t.done && (prefs.doneDays === 0 || (t.doneOn && t.doneOn >= addDays(today(), -prefs.doneDays)))).length === 0) && <p className="muted">Nothing here.</p>}
      </section>
    </>
  );
}
