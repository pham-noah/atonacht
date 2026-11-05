import { memo, useMemo, useState } from "react";
import { BoardOps, addCard, addColumn, boardTitle, deleteCard, editCard, moveCard, newBoard, parseBoard } from "../lib/boardNote";
import { dateOfDaily, isDailyPath } from "../lib/daily";
import { addDays, shortDate, today } from "../lib/dates";
import { BoardSort, Column, buildBoard, columnsFor } from "../lib/kanban";
import { plural } from "../lib/plural";
import { Task, parseTaskLine } from "../lib/tasks";
import { useNav } from "../nav";
import { usePrefs } from "../prefs";
import { useActions, useStore } from "../store";
import { Modal, PageHead, TaskDialog } from "./common";
import { Source, useBoardDnd } from "./useBoardDnd";

const PAGE = 60; // cards drawn per column before "Show more"

type DragHandlers = Pick<ReturnType<typeof useBoardDnd>, "pointerDown" | "keyDown">;

/** Spoken to screen readers while a card is moved with the keyboard. */
const Live = ({ text }: { text: string }) => <div className="sr-only" role="status" aria-live="polite">{text}</div>;

const Hint = () => {
  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  return <p className="muted small kdhint">{touch ? "Press and hold a card, then drag it." : "Drag a card to move it. With a keyboard, focus a card and press Space, then the arrow keys."}</p>;
};

// ---------------------------------------------------------------------------------------------------------------------
// All-tasks board: columns come from each task's @status. Cards are sorted automatically.
// ---------------------------------------------------------------------------------------------------------------------

const Card = memo(function Card({ task, col, index, dragging, pointerDown, keyDown }: { task: Task; col: number; index: number; dragging: boolean } & DragHandlers) {
  const { go } = useNav();
  const [edit, setEdit] = useState(false);
  const overdue = !task.done && task.due && task.due < today();
  return (
    <article
      className={`kcard${task.done ? " done" : ""}${dragging ? " dragging" : ""}`}
      data-card={index}
      tabIndex={0}
      aria-roledescription="draggable card"
      onPointerDown={(e) => pointerDown(e, col, index)}
      onKeyDown={(e) => keyDown(e, col, index)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button className="link ktitle" onClick={() => setEdit(true)}>{task.title}</button>
      <span className="taskmeta">
        {task.priority === "high" && <span className="chip hi">high</span>}
        {task.due && <span className={`chip${overdue ? " warn" : ""}`}>{shortDate(task.due)}</span>}
        {task.repeat && <span className="chip">↻ {task.repeat}</span>}
        <button className="chip chipbtn" onClick={() => go({ name: "editor", path: task.path })}>
          {isDailyPath(task.path) ? `Daily · ${shortDate(dateOfDaily(task.path))}` : task.path.split("/").pop()!.replace(/\.md$/, "")}
        </button>
      </span>
      {edit && <TaskDialog task={task} onClose={() => setEdit(false)} />}
    </article>
  );
});

function GlobalBoard() {
  const { tasks: all, boards } = useStore();
  const tasks = useMemo(() => all.filter((t) => !boards.includes(t.path)), [all, boards]); // cards in project boards are managed there
  const { moveTask } = useActions();
  const { prefs, setPrefs } = usePrefs();
  const [tag, setTag] = useState<string | null>(null);
  const [more, setMore] = useState<Record<string, number>>({});
  const [newColOpen, setNewColOpen] = useState(false);
  const [colName, setColName] = useState("");
  const columns = useMemo(() => columnsFor(prefs.kanbanColumns), [prefs.kanbanColumns]);
  const doneSince = prefs.doneDays > 0 ? addDays(today(), -prefs.doneDays) : undefined;
  const board = useMemo(() => buildBoard(tasks, columns, { tag, doneSince, sort: prefs.boardSort }), [tasks, columns, tag, doneSince, prefs.boardSort]);
  const tags = useMemo(() => [...new Set(tasks.flatMap((t) => t.tags))].sort(), [tasks]);

  const dnd = useBoardDnd({
    positional: false,
    columnName: (c) => columns[c]?.title ?? "",
    cardName: (f: Source) => board[f.col]?.tasks[f.card]?.title ?? "card",
    onDrop: (from, to) => {
      const t = board[from.col]?.tasks[from.card];
      const target: Column | undefined = columns[to.col];
      if (t && target && to.col !== from.col) void moveTask(t, target);
    },
  });

  return (
    <>
      <div className="pills boardbar">
        {tags.length > 0 && (
          <>
            <button className={`pill${tag === null ? " on" : ""}`} onClick={() => setTag(null)}>All</button>
            {tags.map((x) => <button key={x} className={`pill${tag === x ? " on" : ""}`} onClick={() => setTag(tag === x ? null : x)}>#{x}</button>)}
          </>
        )}
        <button className="pill" onClick={() => setNewColOpen(true)}>+ Column</button>
        <label className="movesel">
          <span className="muted small">Sort cards by</span>
          <select aria-label="Sort cards by" value={prefs.boardSort} onChange={(e) => setPrefs({ boardSort: e.target.value as BoardSort })}>
            <option value="urgency">Priority, then due date</option><option value="due">Due date</option><option value="note">Order in their notes</option><option value="title">A to Z</option>
          </select>
        </label>
      </div>
      <Hint />
      <div className="board" role="list">
        {board.map(({ column, tasks: list }, ci) => {
          const shown = list.slice(0, PAGE + (more[column.id] ?? 0));
          return (
            <section key={column.id} role="listitem" aria-label={column.title} data-col-drop={ci} className={`kcol${dnd.over?.col === ci && dnd.drag ? " over" : ""}`}>
              <header className="khead"><h2 className="h2 grow">{column.title}</h2><span className="chip">{list.length}</span></header>
              <div className="kbody">
                {shown.map((t, i) => (
                  <div className="kcardwrap" key={t.id}>
                    <Card task={t} col={ci} index={i} dragging={dnd.drag?.col === ci && dnd.drag.card === i} pointerDown={dnd.pointerDown} keyDown={dnd.keyDown} />
                  </div>
                ))}
                {list.length === 0 && <p className="muted small kempty">{column.kind === "done" ? "Finished tasks show up here." : "Nothing here."}</p>}
              </div>
              {list.length > shown.length && <button className="pill" onClick={() => setMore({ ...more, [column.id]: (more[column.id] ?? 0) + PAGE })}>Show more</button>}
            </section>
          );
        })}
      </div>
      <Live text={dnd.say} />
      {newColOpen && (
        <Modal
          title="New column"
          onClose={() => setNewColOpen(false)}
          footer={
            <div className="btnrow">
              <button className="pill" onClick={() => setNewColOpen(false)}>Cancel</button>
              <button
                className="btn"
                disabled={!colName.trim()}
                onClick={() => { setPrefs({ kanbanColumns: [...new Set([...prefs.kanbanColumns, colName.trim()])] }); setColName(""); setNewColOpen(false); }}
              >Add column</button>
            </div>
          }
        >
          <label className="field"><span>Name</span>
            <input className="in titlein" autoFocus value={colName} onChange={(e) => setColName(e.target.value)} placeholder="In review" aria-label="New column name"
              onKeyDown={(e) => { if (e.key === "Enter" && colName.trim()) { setPrefs({ kanbanColumns: [...new Set([...prefs.kanbanColumns, colName.trim()])] }); setColName(""); setNewColOpen(false); } }} />
          </label>
          <p className="muted small">Columns sit between To do and Done. A task is in a column when its note says <span className="mono">@status(name)</span>.</p>
        </Modal>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Project boards: a note in the Obsidian Kanban format. Card order is the order of lines in the file.
// ---------------------------------------------------------------------------------------------------------------------

function ProjectBoard({ path }: { path: string }) {
  const { notes, edit } = useStore();
  const { prefs } = usePrefs();
  const { go } = useNav();
  const content = notes[path] ?? "";
  const board = useMemo(() => parseBoard(content), [content]);
  const ops: BoardOps = { today: today(), repeatFrom: prefs.repeatFrom };
  const [adding, setAdding] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<Source | null>(null);
  const [newCol, setNewCol] = useState("");
  const apply = (fn: (c: string) => string) => edit(path, fn);
  const cardLabel = (f: Source) => {
    const c = board.columns[f.col]?.cards[f.card];
    return c ? parseTaskLine("", 0, `- [ ] ${c.text}`)?.title ?? c.text : "card";
  };

  const dnd = useBoardDnd({
    positional: true,
    columnName: (c) => board.columns[c]?.title ?? "",
    cardName: cardLabel,
    onDrop: (from, to) => void apply((c) => moveCard(c, from, to, ops)),
  });
  // Where the drop line shows. Hidden when the card would stay exactly where it is.
  const line = dnd.drag && dnd.over && !(dnd.over.col === dnd.drag.col && (dnd.over.index === dnd.drag.card || dnd.over.index === dnd.drag.card + 1)) ? dnd.over : null;

  return (
    <>
      <Hint />
      <div className="board" role="list">
        {board.columns.map((col, ci) => (
          <section key={`${ci}-${col.title}`} role="listitem" aria-label={col.title} data-col-drop={ci} className={`kcol${line?.col === ci ? " over" : ""}`}>
            <header className="khead"><h2 className="h2 grow">{col.title}</h2><span className="chip">{col.cards.length}</span></header>
            <div className="kbody">
            {col.cards.map((card, i) => {
              const t = parseTaskLine("", 0, `- [ ] ${card.text}`);
              return (
                <div className="kcardwrap" key={card.start}>
                  {line?.col === ci && line.index === i && <div className="kdrop" />}
                  <article
                    className={`kcard${card.done ? " done" : ""}${dnd.drag?.col === ci && dnd.drag.card === i ? " dragging" : ""}`}
                    data-card={i}
                    tabIndex={0}
                    aria-roledescription="draggable card"
                    onPointerDown={(e) => dnd.pointerDown(e, ci, i)}
                    onKeyDown={(e) => dnd.keyDown(e, ci, i)}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    <button className="link ktitle" onClick={() => setEditing({ col: ci, card: i })}>{t?.title ?? card.text}</button>
                    <span className="taskmeta">
                      {t?.priority === "high" && <span className="chip hi">high</span>}
                      {t?.due && <span className={`chip${!card.done && t.due < today() ? " warn" : ""}`}>{shortDate(t.due)}</span>}
                      {t?.repeat && <span className="chip">↻ {t.repeat}</span>}
                    </span>
                  </article>
                </div>
              );
            })}
            {col.cards.length === 0 && <p className="muted small kempty">{col.complete ? "Finished cards show up here." : "Nothing here."}</p>}
            </div>
            {line?.col === ci && line.index === col.cards.length && <div className="kdrop" />}
            {adding === ci ? (
              <form className="addrow" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void apply((c) => addCard(c, ci, text)); setText(""); setAdding(null); }}>
                <input className="in" autoFocus aria-label={`New card in ${col.title}`} placeholder="Card title" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setAdding(null)} />
                <button className="btn" type="submit">Add</button>
              </form>
            ) : (
              <button className="pill" onClick={() => { setText(""); setAdding(ci); }}>+ Add a card</button>
            )}
          </section>
        ))}
        <form className="kcol kadd" onSubmit={(e) => { e.preventDefault(); void apply((c) => addColumn(c, newCol)); setNewCol(""); }}>
          <input className="in" aria-label="New column name" placeholder="New column" value={newCol} onChange={(e) => setNewCol(e.target.value)} />
          <button className="pill" type="submit" disabled={!newCol.trim()}>+ Add column</button>
        </form>
      </div>
      <Live text={dnd.say} />
      <div className="btnrow start"><button className="pill" onClick={() => go({ name: "editor", path })}>Open as a note</button></div>
      {editing && board.columns[editing.col]?.cards[editing.card] && (
        <EditCard
          text={board.columns[editing.col].cards[editing.card].text}
          onClose={() => setEditing(null)}
          onSave={(v) => { void apply((c) => editCard(c, editing.col, editing.card, v)); setEditing(null); }}
          onDelete={() => { void apply((c) => deleteCard(c, editing.col, editing.card)); setEditing(null); }}
        />
      )}
    </>
  );
}

function EditCard({ text, onClose, onSave, onDelete }: { text: string; onClose: () => void; onSave: (t: string) => void; onDelete: () => void }) {
  const [v, setV] = useState(text);
  return (
    <Modal title="Edit card" onClose={onClose}>
      <input className="in" autoFocus aria-label="Card text" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && v.trim() && onSave(v)} />
      <p className="muted small mono">Dates and tags work here: @due(2026-11-01) !high #tag</p>
      <div className="btnrow">
        <button className="pill" onClick={() => { if (confirm("Delete this card?")) onDelete(); }}>Delete card</button>
        <button className="btn" disabled={!v.trim()} onClick={() => onSave(v)}>Save</button>
      </div>
    </Modal>
  );
}

function NewBoardDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (path: string) => void }) {
  const { save, notes } = useStore();
  const [name, setName] = useState("");
  const [cols, setCols] = useState("To do, Doing, Done");
  const [err, setErr] = useState("");
  const ok = /^[^/\\.][^/\\]*$/.test(name.trim()) && cols.split(",").some((c) => c.trim());
  const create = async () => {
    const path = `Boards/${name.trim()}.md`;
    if (notes[path] !== undefined) return setErr("A board with that name already exists.");
    await save(path, newBoard(cols.split(",").map((c) => c.trim()).filter(Boolean)));
    onCreate(path);
  };
  return (
    <Modal title="New board" onClose={onClose}>
      <input className="in" autoFocus aria-label="Board name" placeholder="Board name, e.g. Thesis" value={name} onChange={(e) => setName(e.target.value)} />
      <label className="field"><span>Columns (separate with commas)</span><input className="in" aria-label="Columns" value={cols} onChange={(e) => setCols(e.target.value)} /></label>
      <p className="muted small">Saved as a note in the Boards folder, in the format Obsidian’s Kanban plugin uses. A column named Done checks cards off.</p>
      {err && <p className="errtext">{err}</p>}
      <div className="btnrow"><button className="pill" onClick={onClose}>Cancel</button><button className="btn" disabled={!ok} onClick={create}>Create board</button></div>
    </Modal>
  );
}

export function Board({ path }: { path?: string }) {
  const { boards, tasks, notes } = useStore();
  const { go } = useNav();
  const [creating, setCreating] = useState(false);
  const project = path && boards.includes(path) ? path : undefined;
  const open = tasks.filter((t) => !t.done && !boards.includes(t.path)).length;
  const cards = project ? parseBoard(notes[project]).columns.reduce((n, c) => n + c.cards.length, 0) : 0;

  return (
    <>
      <PageHead sub={project ? plural(cards, "card") : `${open} open`} title={project ? boardTitle(project) : "Board"} />
      <div className="pills" role="tablist" aria-label="Boards">
        <button role="tab" aria-selected={!project} className={`pill${!project ? " on" : ""}`} onClick={() => go({ name: "board" })}>All tasks</button>
        {boards.map((b) => <button key={b} role="tab" aria-selected={b === project} className={`pill${b === project ? " on" : ""}`} onClick={() => go({ name: "board", path: b })}>{boardTitle(b)}</button>)}
        <button className="pill" onClick={() => setCreating(true)}>+ New board</button>
      </div>
      {project ? <ProjectBoard key={project} path={project} /> : <GlobalBoard />}
      {creating && <NewBoardDialog onClose={() => setCreating(false)} onCreate={(p) => { setCreating(false); go({ name: "board", path: p }); }} />}
    </>
  );
}
