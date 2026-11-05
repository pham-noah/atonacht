import { useCallback, useEffect, useState } from "react";
import type { Entry } from "../lib/fs";
import { daysLeft, unstampPath } from "../lib/trash";
import { usePrefs } from "../prefs";
import { useStore } from "../store";
import { BackBar, PageHead } from "./common";

const label = (p: string) => unstampPath(p).path.split("/").pop()!.replace(/\.md$/, "");
const ago = (secs: number | null) => {
  if (secs === null) return "";
  const d = Math.floor((Date.now() - secs * 1000) / 864e5);
  return d <= 0 ? "deleted today" : d === 1 ? "deleted yesterday" : `deleted ${d} days ago`;
};

export function Trash() {
  const { loadTrash, restore, purge, emptyTrash } = useStore();
  const { prefs } = usePrefs();
  const [items, setItems] = useState<Entry[] | null>(null);
  const [msg, setMsg] = useState("");
  const load = useCallback(() => loadTrash().then(setItems).catch((e) => setMsg(String(e))), [loadTrash]);
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <BackBar label="Sidebar" />
      <PageHead sub="Deleted notes are kept here until you delete them for good" title="Trash" right={items && items.length > 0 ? <button className="pill" onClick={async () => { if (confirm(`Delete ${items.length} notes for good?`)) { await emptyTrash(); await load(); } }}>Empty trash</button> : undefined} />
      {msg && <p className="muted">{msg}</p>}
      <section className="card list">
        {items?.length === 0 && <p className="muted">The trash is empty.</p>}
        {items?.map((e) => (
          <div key={e.path} className="row">
            <span className="grow"><span className="block">{label(e.path)}</span><span className="muted small">{e.path.includes("/") ? e.path.slice(0, e.path.lastIndexOf("/")) : "No folder"}{ago(unstampPath(e.path).deletedAt) && ` · ${ago(unstampPath(e.path).deletedAt)}`}{daysLeft(e.path, Date.now(), prefs.trashDays) !== null && ` · deleted for good in ${daysLeft(e.path, Date.now(), prefs.trashDays)} days`}</span></span>
            <button className="pill" onClick={async () => { const to = await restore(e.path); setMsg(`Restored to ${to}`); await load(); }}>Restore</button>
            <button className="pill" onClick={async () => { await purge(e.path); await load(); }}>Delete forever</button>
          </div>
        ))}
      </section>
    </>
  );
}
