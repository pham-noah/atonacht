import { useEffect, useMemo, useState } from "react";
import { longDate, today } from "../lib/dates";
import { applyCarryOver, dailyPath, findCarryOver } from "../lib/daily";
import { noteTitle, snippet } from "../lib/markdown";
import { plural } from "../lib/plural";
import { useNav } from "../nav";
import { usePrefs } from "../prefs";
import { useStore } from "../store";
import { Icon, NewFolderDialog, PageHead, TaskRow } from "./common";

export function Home() {
  const { notes, tasks, dirs, ready, error, conflicts, pinned, openDaily, save, addTaskToToday } = useStore();
  const { prefs, setPrefs } = usePrefs();
  const { go } = useNav();
  const [text, setText] = useState("");
  const [addErr, setAddErr] = useState("");
  const [newFolder, setNewFolder] = useState(false);
  const t = today();
  const p = dailyPath(t);

  // Creating today's note when the app opens is the "daily note" feature.
  useEffect(() => {
    if (ready && !error && prefs.autoCreateDaily) openDaily(t);
  }, [ready, error, t, openDaily, prefs.autoCreateDaily]);

  const todays = tasks.filter((x) => x.path === p && !x.done);
  const dueToday = tasks.filter((x) => x.due === t && !x.done && x.path !== p);
  const carry = useMemo(() => findCarryOver(notes, t), [notes, t]);
  const showCarry = carry && prefs.carryOver === "ask" && prefs.carryDismissed !== t && notes[p] !== undefined;
  const folders = dirs.filter((d) => !d.includes("/"));
  const count = (f: string) => Object.keys(notes).filter((n) => n.startsWith(f + "/")).length;

  const doCarry = async () => {
    if (!carry) return;
    const r = applyCarryOver(notes[p], notes[carry.from], carry.tasks);
    await save(p, r.today);
    await save(carry.from, r.prev);
  };
  // "Carry over automatically" does it once per day, as soon as today's note exists.
  useEffect(() => {
    if (prefs.carryOver === "auto" && carry && notes[p] !== undefined && prefs.carryDismissed !== t) {
      setPrefs({ carryDismissed: t });
      void doCarry();
    }
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const add = async () => {
    if (!text.trim()) return;
    try {
      await addTaskToToday(text.trim());
      setText("");
      setAddErr("");
    } catch (e) {
      // On a phone the write can fail (the folder lost its permission, the sync app is mid-swap); say so instead of
      // leaving the input sitting there with nothing happening.
      setAddErr(`Could not save the task: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <>
      <PageHead sub={longDate(t)} title="Home" />
      {conflicts.length > 0 && (
        <button className="banner warnb" onClick={() => go({ name: "conflicts" })}>
          <Icon name="alert" size={20} /><span className="grow">{conflicts.length} sync conflict{conflicts.length > 1 ? "s" : ""} to review</span><span className="chip">Review</span>
        </button>
      )}
      {showCarry && (
        <div className="banner quiet">
          <Icon name="clock" size={18} />
          <span className="grow">{carry.tasks.length} unfinished task{carry.tasks.length > 1 ? "s" : ""} from {longDate(carry.date)}</span>
          <button className="pill" onClick={() => setPrefs({ carryDismissed: t })}>Dismiss</button>
          <button className="pill on" onClick={doCarry}>Carry over</button>
        </div>
      )}
      <section className="card stack">
        <div className="rowhead"><h2 className="h2 grow">Today’s note</h2><button className="btn" onClick={() => go({ name: "editor", path: p })}>Open note</button></div>
        {notes[p] === undefined && ready && <button className="btn" onClick={() => openDaily(t)}>Create today’s note</button>}
        {notes[p] !== undefined && todays.length === 0 && <p className="muted">Nothing planned yet. The night is over, so begin.</p>}
        {todays.map((x) => <TaskRow key={x.id} task={x} source={false} />)}
        <form className="addrow" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <input className="in" placeholder="Add a task to today" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn" type="submit">Add</button>
        </form>
        {addErr && <p className="errtext" role="alert">{addErr}</p>}
        {notes[p] && snippet(notes[p], 140) && <p className="muted small">{snippet(notes[p], 140)}</p>}
      </section>
      {dueToday.length > 0 && (
        <section className="card stack">
          <div className="cap">Due today</div>
          {dueToday.map((x) => <TaskRow key={x.id} task={x} />)}
        </section>
      )}
      {pinned.length > 0 && (
        <>
          <div className="cap">Pinned</div>
          <div className="grid">
            {pinned.slice(0, 6).map((n) => (
              <button key={n} className="fold" onClick={() => go({ name: "editor", path: n })}>
                <Icon name="pin" size={18} /><span className="fname">{noteTitle(n, notes[n])}</span><span className="muted small">{snippet(notes[n], 50)}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="cap">Folders</div>
      <div className="grid">
        {folders.map((f) => (
          <button key={f} className="fold" onClick={() => go({ name: "notes", folder: f })}>
            <Icon name="folder" /><span className="fname">{f}</span><span className="muted small">{plural(count(f), "note")}</span>
          </button>
        ))}
        <button className="fold new" onClick={() => setNewFolder(true)}>+ New folder</button>
      </div>
      {newFolder && <NewFolderDialog onClose={() => setNewFolder(false)} />}
    </>
  );
}
