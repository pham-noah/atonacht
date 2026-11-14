import { useMemo, useState } from "react";
import { addDays, today } from "../lib/dates";
import { usePrefs } from "../prefs";
import { groupTasks } from "../lib/tasks";
import { describeQuery, parseQuery, taskMatches } from "../lib/search";
import { useStore } from "../store";
import { PageHead, TaskRow } from "./common";

const PAGE = 100; // rows drawn per section before "Show more"

export function Tasks() {
  const { tasks, addTaskToToday } = useStore();
  const { prefs } = usePrefs();
  const [status, setStatus] = useState<"open" | "done">("open");
  const [tag, setTag] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [more, setMore] = useState<Record<string, number>>({}); // extra rows revealed per section
  const day = today();
  // The same search a note takes (tag:, due:, is:), read against the tasks themselves: this screen is where a task
  // buried in a folder of notes has to be findable without knowing which note it is in.
  const parsed = useMemo(() => parseQuery(q), [q]);
  const matched = useMemo(() => tasks.filter((x) => taskMatches(parsed, x, day)), [tasks, parsed, day]);
  const base = useMemo(() => (tag ? matched.filter((x) => x.tags.includes(tag)) : matched), [matched, tag]);
  const tags = [...new Set(tasks.flatMap((x) => x.tags))].sort();
  const g = groupTasks(base, day);
  const open = base.filter((x) => !x.done).length;
  const sections: [string, typeof base][] = [["Overdue", g.overdue], ["Today", g.today], ["This week", g.week], ["Later", g.later], ["No date", g.nodate]];
  const done = base.filter((x) => x.done && (prefs.doneDays === 0 || (x.doneOn && x.doneOn >= addDays(day, -prefs.doneDays))));
  const doneShown = done.slice(0, PAGE + (more.Done ?? 0));
  // One "Show more" for every list, so Done pages like the Open sections instead of stopping dead at 100 rows.
  const showMore = (key: string, left: number) => (
    <button className="pill" onClick={() => setMore({ ...more, [key]: (more[key] ?? 0) + PAGE })}>Show {Math.min(PAGE, left)} more</button>
  );
  const searching = !!(q.trim() || tag);

  return (
    <>
      <PageHead sub={`${open} open across ${new Set(tasks.filter((t) => !t.done).map((t) => t.path)).size} notes`} title="All tasks" />
      <input
        className="in"
        type="search"
        placeholder="Search tasks — a word, #tag, due:overdue"
        aria-label="Search tasks"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {parsed.filtered && <p className="muted small queryhint">{describeQuery(parsed)} · {matched.length} task{matched.length === 1 ? "" : "s"}</p>}
      <div className="pills">
        <button className={`pill${status === "open" ? " on" : ""}`} onClick={() => setStatus("open")}>Open</button>
        <button className={`pill${status === "done" ? " on" : ""}`} onClick={() => setStatus("done")}>Done{done.length ? ` · ${done.length}` : ""}</button>
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
              {list.length > PAGE + (more[title] ?? 0) && showMore(title, list.length - PAGE - (more[title] ?? 0))}
            </div>
          ))
        ) : (
          <>
            {doneShown.map((t) => <TaskRow key={t.id} task={t} />)}
            {done.length > doneShown.length && showMore("Done", done.length - doneShown.length)}
          </>
        )}
        {(status === "open" ? open === 0 : done.length === 0) && <p className="muted">{searching ? "Nothing matches this search." : "Nothing here."}</p>}
      </section>
    </>
  );
}
