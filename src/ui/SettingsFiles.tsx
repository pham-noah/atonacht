import { useState } from "react";
import { saveBytes } from "../lib/exportFile";
import { noteCache } from "../lib/noteCache";
import { noteHistory } from "../lib/noteHistory";
import { fs } from "../lib/backend";
import { usePrefs } from "../prefs";
import { useStore } from "../store";
import { attachmentsIn } from "../lib/attachments";
import { Choice, Group, Row, Toggle } from "./SettingsParts";

export function FilesPanel() {
  const { prefs, setPrefs } = usePrefs();
  const { all, save } = useStore();
  const [msg, setMsg] = useState("");
  const [withSettings, setWithSettings] = useState(false);
  const exportAll = async () => {
    setMsg("");
    try {
      const { root: _r, syncthingKey: _k, ...settings } = prefs; // never export the folder handle or the API key
      void _r; void _k;
      const { backupName, buildBackup } = await import("../lib/backup"); // the ZIP library loads only when you use it
      // A note's pictures and files live in the same folder, not in the note: read them back through it so the ZIP can
      // put them where the links point. One that has gone missing is a broken link, not a reason to refuse the backup.
      const attachments: Record<string, Uint8Array> = {};
      if (fs.readBytes) {
        const paths = [...new Set(Object.values(all).flatMap(attachmentsIn))];
        for (const p of paths) {
          try { attachments[p] = await fs.readBytes(prefs.root, p); } catch { /* the file is already gone */ }
        }
      }
      const ok = await saveBytes(backupName(), buildBackup(all, settings, attachments));
      const files = Object.keys(attachments).length;
      setMsg(ok ? `Saved a backup of ${Object.keys(all).length} notes${files ? ` and ${files} attachment${files === 1 ? "" : "s"}` : ""}.` : "Cancelled.");
    } catch (e) {
      setMsg(`Could not save the backup: ${e instanceof Error ? e.message : e}`);
    }
  };
  const restore = async (file: File) => {
    setMsg("");
    try {
      const { readBackup } = await import("../lib/backup");
      const { notes, settings, attachments } = readBackup(new Uint8Array(await file.arrayBuffer()));
      let added = 0;
      let skipped = 0;
      for (const [p, c] of Object.entries(notes)) {
        if (all[p] !== undefined) skipped++;
        else { await save(p, c); added++; }
      }
      // Pictures and files go back at their own paths. One that is already in the folder is the same file from an
      // earlier restore and is left alone, so a newer copy is never overwritten by an older backup.
      let files = 0;
      if (fs.writeBytes) {
        for (const [p, bytes] of Object.entries(attachments)) {
          if (fs.readBytes) {
            try { await fs.readBytes(prefs.root, p); continue; } catch { /* not there yet */ }
          }
          await fs.writeBytes(prefs.root, p, bytes);
          files++;
        }
      }
      if (withSettings && settings && typeof settings === "object") {
        const { root: _r, syncthingKey: _k, onboarded: _o, ...rest } = settings as Record<string, unknown>;
        void _r; void _k; void _o;
        setPrefs(rest as Partial<typeof prefs>);
      }
      setMsg(`Restored ${added} note${added === 1 ? "" : "s"}${files ? ` and ${files} attachment${files === 1 ? "" : "s"}` : ""}. ${skipped} already existed and were left alone.`);
    } catch (e) {
      setMsg(`That doesn’t look like an Atonacht backup: ${e instanceof Error ? e.message : e}`);
    }
  };
  return (
    <>
      <Group title="Back up">
        <Row label="Export all notes" hint={`${Object.keys(all).length} notes, the pictures they link, and your settings, as one ZIP file`}><button className="btn" onClick={exportAll}>Export…</button></Row>
        <p className="muted small">Your notes are already plain files in your notes folder. A ZIP is a convenient copy to keep somewhere else.</p>
      </Group>
      <Group title="Restore">
        <label className="srow"><span className="grow">Restore settings too</span><input type="checkbox" checked={withSettings} onChange={(e) => setWithSettings(e.target.checked)} /></label>
        <div className="field">
          <span>Choose a backup ZIP. Notes that already exist are never overwritten.</span>
          <label className="filepick">
            <input type="file" accept=".zip,application/zip" aria-label="Backup file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void restore(f); e.target.value = ""; }} />
            <span className="pill">Choose file…</span>
          </label>
        </div>
      </Group>
      {msg && <p className="muted" role="status">{msg}</p>}
      <Group title="Fast startup">
        <Toggle label="Keep a copy of my notes for faster starts" hint="Stored in Atonacht's own app storage. The app then reads only notes that changed since last time." value={prefs.startupCache} onChange={(v) => { setPrefs({ startupCache: v }); if (!v) void noteCache.clear(); }} />
        <Row label="Clear the cached copy" hint="Your notes are untouched. The next start just takes a little longer."><button className="pill" onClick={async () => { await noteCache.clear(); setMsg("Cleared the cached copy."); }}>Clear</button></Row>
      </Group>
      <Group title="History on this device">
        <Row label="Clear local version history" hint="Every save keeps the text it replaced, so a bad edit can be undone from History without GitHub. Clearing this cannot be undone.">
          <button className="pill" onClick={async () => { if (!confirm("Delete every earlier version Atonacht kept on this device? Your notes are not touched, but bad edits can no longer be undone from History.")) return; await noteHistory.clear(); setMsg("Cleared the version history on this device."); }}>Clear</button>
        </Row>
      </Group>
      <FolderCheck />
      <Group title="Trash">
        <Choice label="Delete trashed notes after" value={prefs.trashDays} onChange={(v) => setPrefs({ trashDays: v })} options={[[7, "7 days"], [30, "30 days"], [90, "90 days"], [0, "Never"]]} />
      </Group>
      <p className="muted small">Deleted notes wait in Trash, then are deleted for good after the time above. Choose “Never” to empty it yourself.</p>
    </>
  );
}

/**
 * Runs the four folder operations the app depends on, in order, and reports what each returned, so a failing step is
 * identifiable without a debugger.
 */
function FolderCheck() {
  const { prefs } = usePrefs();
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const out: string[] = [];
    const step = async (label: string, fn: () => Promise<string>) => {
      try {
        out.push(`${label}: ${await fn()}`);
      } catch (e) {
        out.push(`${label}: failed — ${e instanceof Error ? e.message : String(e)}`);
      }
    };
    const root = prefs.root;
    await step("folder", async () => (fs.describeRoot ? await fs.describeRoot(root) : root || "(none chosen)"));
    let first = "";
    await step("listed", async () => {
      const entries = await fs.list(root);
      const notes = entries.filter((e) => e.kind === "file");
      first = notes[0]?.path ?? "";
      return `${notes.length} notes and ${entries.filter((e) => e.kind === "dir").length} folders`;
    });
    await step("read", async () => {
      if (!first) return "no note to read";
      const text = await fs.read(root, first);
      return `${first}: ${text.length} characters${text ? ` (“${text.slice(0, 40).replace(/\s+/g, " ")}”)` : " — EMPTY"}`;
    });
    await step("daily template", async () => {
      const t = await fs.read(root, "Templates/Daily note.md").catch(() => null);
      return t === null ? "no Templates/Daily note.md here — new days use the built-in template" : `Templates/Daily note.md found (${t.length} characters)`;
    });
    await step("write", async () => {
      const probe = `# Atonacht folder check\n\nWritten ${new Date().toISOString()}\n`;
      await fs.write(root, "Atonacht check.md", probe);
      const back = await fs.read(root, "Atonacht check.md");
      return back === probe ? "wrote a note and read the same text back" : `wrote ${probe.length} characters, read back ${back.length}`;
    });
    await step("clean up", async () => {
      if (!first) return "nothing to tidy";
      await fs.remove(root, "Atonacht check.md");
      return "the test note is in the trash";
    });
    setLines(out);
    setBusy(false);
  };
  return (
    <Group title="Notes folder">
      <Row label="Test the notes folder" hint="Lists it, reads a note, writes one and reads it back.">
        <button className="btn" onClick={run} disabled={busy}>{busy ? "Testing…" : "Run test"}</button>
      </Row>
      {lines.length > 0 && <ul className="checklines" role="status">{lines.map((l) => <li key={l}>{l}</li>)}</ul>}
    </Group>
  );
}
