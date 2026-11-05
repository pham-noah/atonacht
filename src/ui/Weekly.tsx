import { useState } from "react";
import { today } from "../lib/dates";
import { Task } from "../lib/tasks";
import { doneThisWeek, nextMonday, reviewNote, weekEnd, weekLabel, weeklyPath } from "../lib/weekly";
import { useNav } from "../nav";
import { usePrefs } from "../prefs";
import { useStore } from "../store";
import { BackBar, PageHead, TaskRow } from "./common";

const STEPS = ["Finished", "Still open", "Plan next week"];

export function Weekly() {
  const { tasks, updateTask, drop, someday, addTaskToToday, save } = useStore();
  const { go } = useNav();
  const mf = usePrefs().prefs.weekStart === "mon";
  const [step, setStep] = useState(0);
  const [text, setText] = useState("");
  const t = today();
  const next = nextMonday(t, mf);
  const done = doneThisWeek(tasks, t, mf);
  const open = tasks.filter((x) => !x.done);
  const review = open.filter((x) => x.due && x.due <= weekEnd(t, mf));
  const upcoming = open.filter((x) => x.due && x.due >= next && x.due <= weekEnd(next, mf));

  const finish = async () => {
    await save(weeklyPath(t), reviewNote(t, done, open.filter((x) => !x.due || x.due <= weekEnd(next, mf))));
    go({ name: "home" });
  };
  const move = (x: Task) => (
    <div key={x.id} className="reviewrow">
      <TaskRow task={x} />
      <div className="btnrow start">
        <button className="pill on" onClick={() => updateTask(x, { due: next })}>Next week</button>
        <button className="pill" onClick={() => someday(x)}>Someday</button>
        <button className="pill" onClick={() => drop(x)}>Drop</button>
      </div>
    </div>
  );

  return (
    <>
      <BackBar label="Sidebar" right={<span className="chip">{weekLabel(t, mf)}</span>} />
      <PageHead sub={`Step ${step + 1} of 3`} title={["What got done", "What’s still open?", "Plan next week"][step]} />
      <div className="steps">{STEPS.map((s, i) => <span key={s} className={i <= step ? "on" : ""} />)}</div>
      <section className="card stack">
        {step === 0 && (
          <>
            {done.length === 0 && <p className="muted">Tasks you check off are stamped with the date, so they appear here. Nothing finished yet this week.</p>}
            {done.map((x) => <TaskRow key={x.id} task={x} />)}
          </>
        )}
        {step === 1 && (
          <>
            {review.length === 0 && <p className="muted">Nothing overdue or due this week. Nicely done.</p>}
            {review.map(move)}
          </>
        )}
        {step === 2 && (
          <>
            <p className="muted">Due {weekLabel(next, mf)}</p>
            {upcoming.map((x) => <TaskRow key={x.id} task={x} />)}
            <form className="addrow" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { addTaskToToday(text.trim(), next); setText(""); } }}>
              <input className="in" placeholder="Add a task for next week" value={text} onChange={(e) => setText(e.target.value)} />
              <button className="btn" type="submit">Add</button>
            </form>
          </>
        )}
      </section>
      <div className="btnrow">
        {step > 0 && <button className="pill" onClick={() => setStep(step - 1)}>Back</button>}
        {step < 2 ? <button className="btn" onClick={() => setStep(step + 1)}>{step === 0 ? "Next: still open" : "Next: plan the week"}</button> : <button className="btn" onClick={finish}>Finish review</button>}
      </div>
      {step === 2 && <p className="muted small">Finishing saves a summary note at {weeklyPath(t)}.</p>}
    </>
  );
}
