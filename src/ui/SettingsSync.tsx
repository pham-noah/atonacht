import { useEffect, useState } from "react";
import { fs } from "../lib/backend";
import { useNav } from "../nav";
import { usePrefs } from "../prefs";
import { useStore } from "../store";
import { Choice, Group, Row } from "./SettingsParts";
import { SyncSetup } from "./SettingsSyncthing";
import { GitHubSetup } from "./SettingsGitHub";

export function SyncPanel() {
  const { prefs, setPrefs } = usePrefs();
  const { root, error, notes, conflicts, refresh } = useStore();
  const { go } = useNav();
  const [path, setPath] = useState(prefs.root);
  const [label, setLabel] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState("");
  useEffect(() => {
    if (prefs.root && fs.describeRoot) fs.describeRoot(prefs.root).then(setLabel).catch(() => setLabel(""));
  }, [prefs.root]);
  return (
    <>
      <Group title="Notes folder">
        {path.startsWith("saf:") ? (
          <Row label="Folder" hint="Android only lets Atonacht see the folder you picked"><b>{label || "…"}</b></Row>
        ) : (
          <label className="field"><span>Folder on this device</span><input className="in mono" value={path} onChange={(e) => setPath(e.target.value)} spellCheck={false} /></label>
        )}
        <div className="btnrow start">
          {fs.pickFolder && <button className="btn" onClick={async () => { const r = await fs.pickFolder!(); if (r) { setPath(r); setPrefs({ root: r }); } }}>Choose folder…</button>}
          {!path.startsWith("saf:") && <button className={fs.pickFolder ? "pill" : "btn"} disabled={!path.trim() || path === root} onClick={() => setPrefs({ root: path.trim() })}>Use this folder</button>}
        </div>
        <p className="muted small">{Object.keys(notes).length} notes loaded. Atonacht only reads and writes Markdown files inside this folder. Deleted notes go to a hidden .trash folder.</p>
        {error && <p className="errtext">{error}</p>}
        {!fs.native && <p className="muted small">You are running the browser demo. Notes are kept in this browser, not in files.</p>}
      </Group>
      <Group title="Sync">
        <Choice
          label="This device syncs with"
          value={prefs.syncMethod}
          options={[["syncthing", "Syncthing"], ["github", "GitHub"], ["both", "Both"], ["none", "Off"]]}
          onChange={(v) => setPrefs({ syncMethod: v })}
        />
        <p className="muted small">
          {prefs.syncMethod === "none"
            ? "Nothing is copied off this device. Your notes stay in the folder above."
            : prefs.syncMethod === "both"
              ? "Syncthing keeps the folder live between devices; GitHub keeps a versioned copy. Each section below is only used when you press its buttons."
              : prefs.syncMethod === "github"
                ? "GitHub holds a versioned copy of the folder. Nothing is fetched until you press Pull, so this is a copy you can trust with history rather than a live sync."
                : "Syncthing keeps the folder identical on every device while it is running."}
        </p>
      </Group>
      {(prefs.syncMethod === "syncthing" || prefs.syncMethod === "both") && <SyncSetup folder={path.startsWith("saf:") ? label || path : path} />}
      {(prefs.syncMethod === "github" || prefs.syncMethod === "both") && <GitHubSetup />}
      <Group title="When something changes">
        <Row label="Conflicts" hint="Atonacht keeps both copies instead of choosing for you">{conflicts.length ? <button className="pill on" onClick={() => go({ name: "conflicts" })}>{conflicts.length} to review</button> : <span className="chip hi">None</span>}</Row>
        <Row label="Pick up changes now" hint="Atonacht watches the folder every few seconds; this forces a re-read now">
          <button
            className="pill"
            disabled={checking}
            onClick={async () => {
              setChecking(true);
              setCheckMsg("");
              try {
                const r = await refresh();
                const total = Object.keys(notes).length;
                setCheckMsg(
                  r.updated || r.removed
                    ? `${r.updated} note${r.updated === 1 ? "" : "s"} picked up${r.removed ? `, ${r.removed} gone` : ""}.`
                    : `Checked this folder — nothing changed${total ? ` in ${total} note${total === 1 ? "" : "s"}` : ""}.`,
                );
              } catch (e) {
                setCheckMsg(`Could not read the folder: ${e instanceof Error ? e.message : e}`);
              } finally {
                setChecking(false);
              }
            }}
          >
            {checking ? "Checking…" : "Check now"}
          </button>
        </Row>
        {checkMsg && <p className="muted small" role="status">{checkMsg}</p>}
        {!fs.native && <Row label="Demo notes" hint="Throw away what the browser demo stored"><button className="pill" onClick={() => { localStorage.removeItem("atonacht.demo"); location.reload(); }}>Reset</button></Row>}
      </Group>
    </>
  );
}

/** "just now" / "3 min ago" for a stamp Syncthing reported, so a stale reading cannot pass for a live one. */
