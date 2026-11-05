import { useEffect, useState } from "react";
import { fs } from "../lib/backend";
import { usePrefs } from "../prefs";
import { Logo } from "./common";

export function FirstRun() {
  const { setPrefs } = usePrefs();
  const [path, setPath] = useState("");
  const [label, setLabel] = useState("");
  const [err, setErr] = useState("");
  const picker = !!fs.pickFolder;
  const typed = !path.startsWith("saf:"); // Android roots are folder handles, not paths you can type

  useEffect(() => { fs.defaultRoot().then(setPath); }, []);
  useEffect(() => {
    if (path && fs.describeRoot) fs.describeRoot(path).then(setLabel).catch(() => setLabel(""));
  }, [path]);

  const pick = async () => {
    setErr("");
    try {
      const r = await fs.pickFolder!();
      if (r) setPath(r);
    } catch (e) {
      setErr(String(e));
    }
  };
  const start = async () => {
    try {
      await fs.ensureRoot(path.trim());
      setPrefs({ root: path.trim(), onboarded: true });
    } catch (e) {
      setErr(String(e));
    }
  };
  return (
    <div className="firstrun">
      <Logo size={96} />
      <div className="brandname">Atonacht</div>
      <div className="tag">after night</div>
      <p className="muted lead">Daily notes and to-dos, kept as plain Markdown files that stay yours.</p>
      <div className="field wide"><span>Where should your notes live?</span>
        {typed && <input className="in mono" aria-label="Notes folder" value={path} onChange={(e) => setPath(e.target.value)} spellCheck={false} disabled={!fs.native} />}
        {!typed && <div className="card chosen"><span className="muted small">Chosen folder</span><b>{label || "…"}</b></div>}
      </div>
      {picker && <button className="btn big" onClick={pick}>{path.trim() ? "Choose a different folder" : "Choose folder"}</button>}
      {fs.native && !picker && <p className="muted small">Pick a folder that Syncthing can reach, like Documents. You can set up sync afterwards in Settings.</p>}
      {fs.native && picker && <p className="muted small">The folder picker opens on <b>Documents/Atonacht</b>: make that folder there and choose it, or pick any folder you like. Android asks you to approve it once, and Atonacht can only see that folder.</p>}
      {!fs.native && <p className="muted small">Browser demo: notes are kept in this browser. Run the Tauri app to use real files.</p>}
      {err && <p className="errtext">{err}</p>}
      {(!picker || path.trim()) && <button className="btn big" onClick={start} disabled={!path.trim()}>Get started</button>}
    </div>
  );
}
