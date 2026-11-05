import { useEffect, useMemo, useState } from "react";
import { today } from "../lib/dates";
import { fillTemplate } from "../lib/templates";
import { noteTitle, snippet } from "../lib/markdown";
import { plural } from "../lib/plural";
import { useNav } from "../nav";
import { useStore } from "../store";
import { BackBar, Modal, PageHead } from "./common";

const PAGE = 100; // rows drawn before "Show more", like the task list

const when = (mtime: number) => (new Date(mtime).toLocaleDateString("sv") === today() ? "Today" : new Date(mtime).toLocaleDateString("en-GB", { day: "numeric", month: "short" }));

export function Notes({ folder, query = "" }: { folder?: string; query?: string }) {
  const { notes, mtimes, dirs, tasks, save, templates, renameFolder, deleteFolder } = useStore();
  const [folderOp, setFolderOp] = useState<"rename" | "delete" | null>(null);
  const [newName, setNewName] = useState(folder ?? "");
  const [opErr, setOpErr] = useState("");
  const [tpl, setTpl] = useState("");
  const { go, replace, back } = useNav();
  const [q, setQ] = useState(query);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [where, setWhere] = useState(folder ?? "");
  const [shown, setShown] = useState(PAGE);
  const needle = q.trim().toLowerCase();
  // Building this list scans every note's text, so it only happens when the notes or the search actually change.
  const list = useMemo(
    () => Object.entries(notes)
      .filter(([p]) => !folder || p.startsWith(folder + "/"))
      .filter(([p, c]) => !needle || p.toLowerCase().includes(needle) || c.toLowerCase().includes(needle))
      .sort(([a], [b]) => (mtimes[b] ?? 0) - (mtimes[a] ?? 0)),
    [notes, mtimes, folder, needle],
  );
  // A new search or folder starts from the top again.
  useEffect(() => setShown(PAGE), [needle, folder]);
  const visible = list.slice(0, shown);
  const folders = dirs.filter((d) => !d.includes("/"));
  const open = folder ? tasks.filter((t) => !t.done && t.path.startsWith(folder + "/")).length : 0;
  const safe = /^[^/\\.][^/\\]*$/.test(name.trim());

  const create = async () => {
    if (!safe) return;
    const path = `${where ? where + "/" : ""}${name.trim()}.md`;
    if (notes[path] === undefined) await save(path, tpl && templates[tpl] ? fillTemplate(templates[tpl], { title: name.trim(), date: today() }) : `# ${name.trim()}\n\n`);
    setCreating(false);
    setName("");
    go({ name: "editor", path });
  };

  return (
    <>
      {folder && <BackBar label="Folders" />}
      <PageHead sub={folder ? `${plural(list.length, "note")} · ${plural(open, "open task")}` : `${plural(Object.keys(notes).length, "note")} in ${plural(folders.length, "folder")}`} title={folder ?? "Notes"} right={<>{folder && <><button className="pill" onClick={() => { setNewName(folder); setOpErr(""); setFolderOp("rename"); }}>Rename</button><button className="pill" onClick={() => { setOpErr(""); setFolderOp("delete"); }}>Delete</button></>}<button className="btn" onClick={() => setCreating(true)}>New note</button></>} />
      <input className="in" type="search" placeholder="Search notes" aria-label="Search notes" value={q} onChange={(e) => setQ(e.target.value)} />
      {!folder && (
        <div className="pills">
          <button className="pill on">All</button>
          {folders.map((f) => <button key={f} className="pill" onClick={() => go({ name: "notes", folder: f })}>{f}</button>)}
        </div>
      )}
      <section className="card list">
        {list.length === 0 && <p className="muted">No notes found.</p>}
        {visible.map(([p, c]) => (
          <button key={p} className="noterow" onClick={() => go({ name: "editor", path: p })}>
            <span className="nt">{noteTitle(p, c)}</span>
            <span className="muted small">{snippet(c)}</span>
            <span className="meta"><span className="chip">{p.includes("/") ? p.split("/")[0] : "Notes"}</span><span className="muted small">{when(mtimes[p] ?? 0)}</span></span>
          </button>
        ))}
        {list.length > shown && (
          <button className="pill" onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, list.length - shown)} more of {list.length}</button>
        )}
      </section>
      {folderOp === "rename" && folder && (
        <Modal title="Rename folder" onClose={() => setFolderOp(null)}>
          <input className="in" autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="Folder name" />
          {opErr && <p className="errtext">{opErr}</p>}
          <div className="btnrow"><button className="pill" onClick={() => setFolderOp(null)}>Cancel</button>
            <button className="btn" disabled={!newName.trim() || newName.trim() === folder} onClick={async () => { try { await renameFolder(folder, newName.trim()); setFolderOp(null); replace({ name: "notes", folder: newName.trim() }); } catch (e) { setOpErr(String(e instanceof Error ? e.message : e)); } }}>Rename</button></div>
        </Modal>
      )}
      {folderOp === "delete" && folder && (
        <Modal title={`Delete “${folder}”?`} onClose={() => setFolderOp(null)}>
          <p className="muted">Its {list.length} notes move to the trash, where you can restore them.</p>
          {opErr && <p className="errtext">{opErr}</p>}
          <div className="btnrow"><button className="pill" onClick={() => setFolderOp(null)}>Cancel</button>
            <button className="btn" onClick={async () => { try { await deleteFolder(folder); setFolderOp(null); back(); } catch (e) { setOpErr(String(e instanceof Error ? e.message : e)); } }}>Delete folder</button></div>
        </Modal>
      )}
      {creating && (
        <Modal title="New note" onClose={() => setCreating(false)}>
          <input className="in" autoFocus placeholder="Note name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
          <label className="field"><span>Folder</span>
            <select className="in" value={where} onChange={(e) => setWhere(e.target.value)}>
              <option value="">No folder</option>
              {folders.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          {Object.keys(templates).length > 0 && (
            <label className="field"><span>Template</span>
              <select className="in" value={tpl} onChange={(e) => setTpl(e.target.value)}>
                <option value="">Blank note</option>
                {Object.keys(templates).sort().map((t) => <option key={t} value={t}>{t.slice(10, -3)}</option>)}
              </select>
            </label>
          )}
          <div className="btnrow"><button className="pill" onClick={() => setCreating(false)}>Cancel</button><button className="btn" disabled={!safe} onClick={create}>Create</button></div>
        </Modal>
      )}
    </>
  );
}
