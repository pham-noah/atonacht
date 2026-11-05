import { useState } from "react";
import { diffLines } from "../lib/diff";
import { MergeRow, Pick, hunkCount, mergeRows, mergeWith } from "../lib/merge";
import { noteTitle } from "../lib/markdown";
import { Resolution, useStore } from "../store";
import { BackBar, PageHead } from "./common";

const PICK_LABEL: Record<Pick, string> = { mine: "This device", theirs: "Other device", both: "Both" };

/**
 * Two versions of one note, with three ways out: take one side, keep both as separate notes, or merge line by line.
 *
 * Syncthing cannot merge anything — it only stores files — so merging has to happen here. It is the only option that
 * leaves one note holding both people's work, so it gets its own screen: one decision per place the versions disagree.
 */
export function Conflicts() {
  const { conflicts, all, resolve, resolveMerged } = useStore();
  const [busy, setBusy] = useState(false);
  const [merging, setMerging] = useState(false);
  const [picks, setPicks] = useState<Record<number, Pick>>({});
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
  const rows = merging ? mergeRows(mine, theirs) : [];
  const hunks = hunkCount(rows);
  const pickOf = (id: number): Pick => picks[id] ?? "both";
  const merged = merging ? mergeWith(rows, pickOf) : "";

  if (merging) {
    const save = async () => {
      setBusy(true);
      try { await resolveMerged(c, merged); setMerging(false); setPicks({}); } finally { setBusy(false); }
    };
    return (
      <>
        <BackBar label="Conflicts" onBack={() => setMerging(false)} right={<span className="chip hi">{hunks} to decide</span>} />
        <PageHead sub={`${c.original} · merged by hand`} title="Merge" />
        <p className="muted small">
          {hunks === 0
            ? "The two versions are already identical — saving keeps one note."
            : `${hunks} place${hunks === 1 ? "" : "s"} where they differ. “Both” keeps this device's lines first, then the other device's.`}
        </p>
        <div className="merge">
          {rows.map((row, i) => row.kind === "same"
            ? <RowSame key={i} row={row} />
            : (
              <div key={i} className="mhunk">
                <div className="mpick">
                  {(["mine", "theirs", "both"] as Pick[]).map((how) => (
                    <button key={how} className={`pill${pickOf(row.id) === how ? " on" : ""}`} onClick={() => setPicks((p) => ({ ...p, [row.id]: how }))}>
                      {PICK_LABEL[how]}
                    </button>
                  ))}
                </div>
                <div className="msides">
                  <div className="dldel">{row.mine.map((l, j) => <div key={j} className="dl del"><span aria-hidden="true">−</span><span>{l || "\u00a0"}</span></div>)}</div>
                  <div className="dladd">{row.theirs.map((l, j) => <div key={j} className="dl add"><span aria-hidden="true">+</span><span>{l || "\u00a0"}</span></div>)}</div>
                </div>
              </div>
            ))}
        </div>
        <div className="btnrow">
          <button className="btn" disabled={busy} onClick={save}>{busy ? "Saving…" : hunks ? "Save merged note" : "Save"}</button>
          <button className="pill" disabled={busy} onClick={() => setMerging(false)}>Back to choices</button>
        </div>
      </>
    );
  }

  return (
    <>
      <BackBar label="Home" right={<span className="chip hi">1 of {conflicts.length}</span>} />
      <PageHead sub={`${c.original} · edited on two devices`} title="Sync conflict" />
      <p className="muted">Syncthing kept both versions of “{noteTitle(c.original, mine)}” because two devices changed it at the same time. Syncthing cannot merge them — it only stores files — so pick one, keep both, or merge them here.</p>
      <div className="diffs">
        {col(left, "On this device", "The version you have now")}
        {col(right, "From another device", `${c.stamp} · ${c.device}`)}
      </div>
      {/* Two columns do not fit a phone: there, one column with both sides interleaved compares at a glance. */}
      <div className="unified card">
        <div className="mlegend"><span className="legendchip del">− this device</span><span className="legendchip add">+ other device</span></div>
        {diff.map((l, i) => (
          <div key={i} className={`dl ${l.type}`}>
            <span aria-hidden="true">{l.type === "add" ? "+" : l.type === "del" ? "−" : ""}</span>
            <span>{l.text || " "}</span>
          </div>
        ))}
      </div>
      <p className="muted small">“Keep both” saves the other version as a separate note, so nothing is lost. Whatever you don’t keep goes to the .trash folder.</p>
      <div className="btnrow">
        <button className="btn" disabled={busy} onClick={() => setMerging(true)}>Merge by hand</button>
        <button className="pill" disabled={busy} onClick={() => act("mine")}>Keep this device</button>
        <button className="pill" disabled={busy} onClick={() => act("theirs")}>Keep other device</button>
        <button className="pill" disabled={busy} onClick={() => act("both")}>Keep both</button>
      </div>
    </>
  );
}

/** Long stretches of agreement are noise in a merge; one line of context each side is enough to place a hunk. */
function RowSame({ row }: { row: Extract<MergeRow, { kind: "same" }> }) {
  const lines = row.lines;
  if (lines.length <= 3) {
    return <div className="msame">{lines.map((l, i) => <div key={i} className="dl"><span aria-hidden="true" /><span>{l || "\u00a0"}</span></div>)}</div>;
  }
  return (
    <div className="msame">
      <div className="dl"><span aria-hidden="true" /><span>{lines[0] || "\u00a0"}</span></div>
      <div className="dl gap"><span aria-hidden="true" /><span>{`… ${lines.length - 2} lines the same`}</span></div>
      <div className="dl"><span aria-hidden="true" /><span>{lines[lines.length - 1] || "\u00a0"}</span></div>
    </div>
  );
}
