import { useEffect, useRef, useState } from "react";
import { Fetcher, Probe, SyncStatus, alternateLoopback, describeSyncError, fetchSyncStatus, probeCandidates, probeUrl, scanSyncthing } from "../lib/syncthing";
import { isTauri } from "../lib/backend";
import { usePrefs } from "../prefs";
import { openExternal } from "../lib/update";
import { syncthingFetcher } from "../lib/syncthingFetch";
import { Group, Row } from "./SettingsParts";

function shortAgo(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "recently";
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 10) return "just now";
  if (secs < 90) return `${secs} seconds ago`;
  const mins = Math.round(secs / 60);
  if (mins < 90) return `${mins} min ago`;
  return `${Math.round(mins / 60)} h ago`;
}

/**
 * GitHub as a remote for the notes folder.
 *
 * It is not Syncthing and does not pretend to be: nothing arrives until the app asks, and two devices editing at once
 * produce a conflict to resolve, not a merge. What it gives is the folder in version control, off this device.
 */
export function SyncSetup({ folder }: { folder: string }) {
  const [copied, setCopied] = useState("");
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(""), 1600);
    } catch {
      setCopied("");
    }
  };
  return (
    <Group title="Sync with Syncthing">
      <p className="muted small">
        Atonacht never uploads anything. <b>Syncthing</b> copies the notes folder between your own devices, and Atonacht
        reloads the files as they arrive. Make the folder the same on both devices first; the status read-out below is
        optional.
      </p>

      <div className="step">
        <span className="stepn">1</span>
        <div className="grow">
          <b>Install Syncthing on both devices</b>
          <p className="muted small">
            On Android use <b>Syncthing-Fork</b>. On a computer, syncthing.net. You do not need an account: the two devices
            find each other by device ID.
          </p>
          <div className="btnrow start">
            <button className="pill" onClick={() => openExternal("https://syncthing.net/downloads/")}>Downloads</button>
            <button className="pill" onClick={() => openExternal("https://github.com/Catfriend1/syncthing-android/releases")}>Android build</button>
          </div>
        </div>
      </div>

      <div className="step">
        <span className="stepn">2</span>
        <div className="grow">
          <b>Share this notes folder</b>
          <p className="muted small">
            In Syncthing choose <b>Add Folder</b>, point it at the folder Atonacht uses, then accept the share on the other
            device and pick the same folder there. Do not place it inside another synced folder.
          </p>
          <div className="btnrow start">
            <button className="pill" onClick={() => copy(folder)}>{copied === folder ? "Copied" : "Copy folder path"}</button>
          </div>
          <p className="muted small">
            Only Markdown files matter; everything else in the folder is ignored. The hidden <span className="mono">.trash</span> folder
            is safe to sync.
          </p>
        </div>
      </div>

      <div className="step">
        <span className="stepn">3</span>
        <div className="grow">
          <b>Optional: see Syncthing's status here</b>
          <p className="muted small">
            This is a read-out, not the sync itself. Syncthing runs a small web interface; Atonacht asks it which devices
            are connected and how far the folder has synced.
          </p>
          <details className="howto">
            <summary>Where do I find the address and the key?</summary>
            <p className="muted small">
              <b>Address</b>: on the same device it is <span className="mono">http://127.0.0.1:8384</span>. To watch another
              device use its address, e.g. <span className="mono">http://192.168.1.20:8384</span>.
            </p>
            <p className="muted small">
              <b>API key</b>: open Syncthing's web interface, then <b>Actions</b> (top right) → <b>Settings</b> → <b>General</b>
              → the field called <b>API Key</b>. In the Android app, the same menu entry opens that web interface.
            </p>
          </details>
          <SyncthingStatus />
        </div>
      </div>
    </Group>
  );
}

function SyncthingStatus() {
  const { prefs, setPrefs } = usePrefs();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [probes, setProbes] = useState<Probe[]>([]);
  const [scan, setScan] = useState<Probe[] | null>(null);
  const [ips, setIps] = useState<string[]>([]);
  const [selfTest, setSelfTest] = useState("");
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const lastCheck = useRef<(() => void) | null>(null);
  const [, tick] = useState(0);

  const check = async (silent = false) => {
    if (!silent) {
      setBusy(true);
      setErr("");
      setNote("");
      setProbes([]);
    }
    // In the app this runs in Rust, so there is no plugin scope and no CORS to get wrong; the browser demo uses fetch.
    const f: Fetcher = await syncthingFetcher();
    // 127.0.0.1 and localhost are the same machine but not always the same listener, so try the other spelling before
    // giving up, and keep whichever answered.
    const tries = [prefs.syncthingUrl];
    const alt = alternateLoopback(prefs.syncthingUrl);
    if (alt) tries.push(alt);
    let last = "";
    try {
      for (const url of tries) {
        try {
          setStatus(await fetchSyncStatus(url, prefs.syncthingKey, f));
          setCheckedAt(Date.now());
          setErr("");
          if (url !== prefs.syncthingUrl) {
            setPrefs({ syncthingUrl: url });
            setNote(`Syncthing answered at ${url.replace(/\/+$/, "")} — that address is saved now.`);
          }
          return;
        } catch (e) {
          last = e instanceof Error ? e.message : String(e);
          // a rejected key will be rejected everywhere: no point trying the other spelling
          if (/rejected the API key|401|403/i.test(last)) break;
        }
      }
      setStatus(null);
      setErr(describeSyncError(last, prefs.syncthingUrl) + (isTauri() ? "" : " The browser demo cannot reach Syncthing at all."));
      if (silent) return; // the re-check says it broke; leave the diagnosis to a deliberate Test
      // What answered where: this is the difference between "no Syncthing", "wrong key" and "the GUI speaks HTTPS".
      const seen = await Promise.all(probeCandidates(prefs.syncthingUrl).map((u) => probeUrl(u, prefs.syncthingKey, f)));
      setProbes(seen);
      const working = seen.find((p) => p.health === "ok" && p.key === "accepted");
      if (working && working.url !== prefs.syncthingUrl) {
        setPrefs({ syncthingUrl: working.url });
        setNote(`That address works, so it is saved: ${working.url}`);
      }
    } finally {
      if (!silent) setBusy(false);
    }
  };

  lastCheck.current = () => { if (!busy) void check(true); };

  useEffect(() => {
    if (!status) return;
    // A status that never changes looks the same whether it is live or stale, so re-read it while the panel is open.
    const beat = setInterval(() => { lastCheck.current?.(); tick((n) => n + 1); }, 10000);
    return () => clearInterval(beat);
  }, [status]);

  const runSelfTest = async () => {
    setSelfTest("Running…");
    if (!isTauri()) { setSelfTest("Only the installed app can run this."); return; }
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      setSelfTest((await invoke<string>("sync_selftest")) as string);
    } catch (e) {
      setSelfTest(String(e instanceof Error ? e.message : e));
    }
  };

  const runScan = async () => {
    setBusy(true);
    setScan(null);
    try {
      const f: Fetcher = await syncthingFetcher();
      let ips: string[] = [];
      if (isTauri()) {
        const { invoke } = await import("@tauri-apps/api/core");
        ips = (await invoke<string[]>("local_ips").catch(() => [])) ?? [];
      }
      setIps(ips);
      setScan(await scanSyncthing(prefs.syncthingUrl, ips, f));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="syncbox">
      {/* A form keeps the password field from being offered to the browser's password manager as a login. */}
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (!busy && prefs.syncthingKey) void check(); }}>
        <label className="field"><span>Address</span><input className="in mono" value={prefs.syncthingUrl} onChange={(e) => setPrefs({ syncthingUrl: e.target.value })} spellCheck={false} placeholder="http://127.0.0.1:8384" /></label>
        <label className="field"><span>API key</span><input className="in mono" type="password" value={prefs.syncthingKey} onChange={(e) => setPrefs({ syncthingKey: e.target.value })} spellCheck={false} autoComplete="off" placeholder="Paste the key" /></label>
        <div className="btnrow start">
          <button className="btn" type="submit" disabled={busy || !prefs.syncthingKey}>{busy ? "Checking…" : "Test connection"}</button>
          <button className="pill" type="button" onClick={runScan} disabled={busy}>Scan this device</button>
          <button className="pill" type="button" onClick={runSelfTest} disabled={busy}>Self-test</button>
        </div>
      </form>
      {note && <p className="muted small">{note}</p>}
      {selfTest && <p className="muted small">Self-test: {selfTest}</p>}
      {scan && (
        <div className="probes">
          <div className="cap">Scan of this device</div>
          <p className="muted small">This device: {ips.length ? ips.join(", ") : "Rust side did not report an address"}</p>
          {scan.every((p) => p.health === "unreachable") && (
            <p className="muted small">
              Nothing answered on any of these — loopback, IPv6 loopback and this device's own address, on 8384 and 8385.
              If Syncthing-Fork says its web GUI is running, open that same address in Chrome on the phone: if Chrome loads
              it and this list stays empty, the app cannot reach it and the reason is on this side, not in the address.
            </p>
          )}
          {scan.filter((p) => p.health !== "unreachable").map((p) => (
            <div key={p.url} className="probe">
              <span className="mono grow">{p.url}</span>
              <span className={`chip${p.health === "ok" ? " hi" : ""}`}>
                {p.health === "ok" ? "Answers" : p.health === "tls" ? "HTTPS only" : "Request failed"}
              </span>
              {(p.health === "ok" || p.health === "tls") && <button className="pill" onClick={() => setPrefs({ syncthingUrl: p.url })}>Use</button>}
            </div>
          ))}
          {scan.filter((p) => p.detail).slice(0, 4).map((p) => (
            <p key={p.url + "detail"} className="mono small muted">{p.url}: {(p.detail || "").slice(0, 150)}</p>
          ))}
          <p className="muted small">{scan.length} addresses tried.</p>
        </div>
      )}
      {probes.length > 0 && (
        <div className="probes">
          <div className="cap">What answered</div>
          {probes.map((p) => (
            <div key={p.url} className="probe">
              <span className="mono grow">{p.url}</span>
              <span className={`chip${p.health === "ok" && p.key === "accepted" ? " hi" : ""}`}>
                {p.health === "tls" ? "HTTPS only" : p.health === "ok" ? (p.key === "accepted" ? "Working" : "Key rejected") : p.health === "unreachable" ? "Nothing there" : "No answer"}
              </span>
            </div>
          ))}
        </div>
      )}
      {err && <p className="errtext">{err}</p>}
      {status && (
        <>
          <div className="cap">Devices</div>
          {status.devices.length === 0 && <p className="muted small">No other devices are set up yet.</p>}
          {status.devices.map((d) => (
            <Row key={d.id} label={d.name} hint={d.lastSeen ? `last seen ${shortAgo(d.lastSeen)}` : undefined}>
              {d.connected ? <span className="chip hi"><i className="dot" />Connected</span> : <span className="chip">Offline</span>}
            </Row>
          ))}
          <div className="cap">Folders</div>
          {status.folders.length === 0 && <p className="muted small">Syncthing has no folders yet. Add the notes folder in Syncthing first.</p>}
          {status.folders.map((f) => {
            const done = f.needItems === 0 && f.needBytes === 0;
            return (
              <Row key={f.id} label={f.label} hint={f.path}>
                <span className={`chip${done ? " hi" : ""}`}>
                  {done ? "Up to date" : `${f.needItems} to fetch · ${f.state}`}
                </span>
              </Row>
            );
          })}
        </>
      )}
      {checkedAt && (
        <p className="muted small">
          Checked {shortAgo(new Date(checkedAt).toISOString())} · this panel re-checks every 10 seconds while it is open.
          "Up to date" means nothing is left to fetch, not that the other device is finished sending.
        </p>
      )}
      <p className="muted small">The key stays on this device and is only sent to the address above.</p>
    </div>
  );
}
