import { useState } from "react";
import { today } from "../lib/dates";
import { fillTemplate, TEMPLATES_DIR } from "../lib/templates";
import { noteTitle, snippet } from "../lib/markdown";
import { useNav } from "../nav";
import { useStore } from "../store";
import { BackBar, Icon, Modal, PageHead } from "./common";

export function Library() {
  const { notes, templates, pinned, save, addStarterTemplates, dirs } = useStore();
  const { go } = useNav();
  const [use, setUse] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [where, setWhere] = useState("");
  const safe = /^[^/\\.][^/\\]*$/.test(name.trim());
  const names = Object.keys(templates).sort();

  const create = async () => {
    if (!use || !safe) return;
    const path = `${where ? where + "/" : ""}${name.trim()}.md`;
    if (notes[path] === undefined) await save(path, fillTemplate(templates[use], { title: name.trim(), date: today() }));
    setUse(null);
    setName("");
    go({ name: "editor", path });
  };

  return (
    <>
      <BackBar label="Sidebar" />
      <PageHead title="Library" />
      <div className="cap">Pinned</div>
      <section className="card list">
        {pinned.length === 0 && <p className="muted">Pin a note from its editor and it shows up here and on Home.</p>}
        {pinned.map((p) => (
          <button key={p} className="noterow" onClick={() => go({ name: "editor", path: p })}>
            <span className="nt rowhead"><span className="grow">{noteTitle(p, notes[p])}</span><Icon name="pin" size={16} /></span>
            <span className="muted small">{snippet(notes[p])}</span>
            <span className="meta"><span className="chip">{p.includes("/") ? p.split("/")[0] : "Notes"}</span></span>
          </button>
        ))}
      </section>
      <div className="cap">Templates</div>
      <div className="grid">
        {names.map((p) => (
          <div key={p} className="fold">
            <span className="fname">{p.slice(TEMPLATES_DIR.length + 1, -3)}</span>
            <span className="muted small">{snippet(templates[p], 60) || "Headings only"}</span>
            <span className="btnrow start"><button className="pill" onClick={() => { setUse(p); setName(""); }}>Use</button><button className="pill" onClick={() => go({ name: "editor", path: p })}>Edit</button></span>
          </div>
        ))}
        {names.length === 0 && <button className="fold new" onClick={addStarterTemplates}>Add starter templates</button>}
      </div>
      <p className="muted small">Templates are plain notes in the Templates folder. Use {"{{title}}"}, {"{{date}}"} and {"{{long_date}}"}. Edit “Daily note” to change how each day starts.</p>
      {use && (
        <Modal title={`New note from “${use.slice(TEMPLATES_DIR.length + 1, -3)}”`} onClose={() => setUse(null)}>
          <input className="in" autoFocus placeholder="Note name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
          <label className="field"><span>Folder</span>
            <select className="in" value={where} onChange={(e) => setWhere(e.target.value)}>
              <option value="">No folder</option>
              {dirs.filter((d) => !d.includes("/") && d !== TEMPLATES_DIR).map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <div className="btnrow"><button className="pill" onClick={() => setUse(null)}>Cancel</button><button className="btn" disabled={!safe} onClick={create}>Create</button></div>
        </Modal>
      )}
    </>
  );
}
