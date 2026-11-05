import { useState } from "react";
import { diffLines } from "../lib/diff";
import { noteTitle } from "../lib/markdown";
import { Resolution, useStore } from "../store";
import { BackBar, PageHead } from "./common";

export function Conflicts() {
  const { conflicts, all, resolve } = useStore();
  const [busy, setBusy] = useState(false);
  const c = conflicts[0];

  if (!c) {
    return <><BackBar label="Home" /><PageHead title="Sync conflicts" /><section className="card"><p className="muted">No conflicts. Everything is in sync.</p></section></>;
  }
  const mine = all[c.original] ?? "";
  const theirs = all[c.path] ?? "";
  const diff = diffLines(mine, theirs);
  const left = diff.filter((l) => l.type !== "add");
  const right = diff.filter((l) => l.type !== "del");
  const act = async (how: Resolution) => {
    setBusy(true);
    try { await resolve(c, how); } finally { setBusy(false); }
  };
  const col = (rows: typeof diff, title: string, sub: string) => (
    <div className="card diffcol">
      <h2 className="h2">{title}</h2><div className="muted small">{sub}</div>
      {rows.map((l, i) => <div key={i} className={`dl ${l.type}`}><span aria-hidden="true">{l.type === "add" ? "+" : l.type === "del" ? "−" : ""}</span><span>{l.text || "\u00a0"}</span></div>)}
    </div>
  );
  return (
    <>
      <BackBar label="Home" right={<span className="chip hi">1 of {conflicts.length}</span>} />
      <PageHead sub={`${c.original} · edited on two devices`} title="Sync conflict" />
      <p className="muted">Syncthing kept both versions of “{noteTitle(c.original, mine)}” because two devices changed it at the same time.</p>
      <div className="diffs">
        {col(left, "On this device", "The version you have now")}
        {col(right, "From another device", `${c.stamp} · ${c.device}`)}
      </div>
      <p className="muted small">“Keep both” saves the other version as a separate note, so nothing is lost. Whatever you don’t keep goes to the .trash folder.</p>
      <div className="btnrow">
        <button className="pill" disabled={busy} onClick={() => act("mine")}>Keep this device</button>
        <button className="pill" disabled={busy} onClick={() => act("theirs")}>Keep other device</button>
        <button className="btn" disabled={busy} onClick={() => act("both")}>Keep both</button>
      </div>
    </>
  );
}
