import { useEffect, useState } from "react";
import { githubFetcher } from "../lib/githubFetch";
import { parseRepo } from "../lib/github";
import { Commit, noteAtCommit, noteHistory } from "../lib/githubSync";
import { usePrefs } from "../prefs";
import { useStore } from "../store";
import { BackBar, PageHead } from "./common";

const when = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

/**
 * Every commit that touched this note, from the GitHub remote.
 *
 * It answers "what did this look like yesterday" without a second storage system: the repository already has the history.
 * Restoring writes the old text back into the note, so the next sync makes it the newest version again.
 */
export function History({ path }: { path: string }) {
  const { prefs } = usePrefs();
  const { save } = useStore();
  const repo = parseRepo(prefs.githubRepo);
  const [commits, setCommits] = useState<Commit[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<{ sha: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!repo || !prefs.githubToken) {
      setError("Set a repository and token in Settings → Sync → GitHub to see this note's history.");
      return;
    }
    let stop = false;
    (async () => {
      try {
        const f = await githubFetcher();
        const list = await noteHistory(repo, prefs.githubBranch, prefs.githubToken, path, f);
        if (!stop) setCommits(list);
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      stop = true;
    };
  }, [repo?.owner, repo?.repo, prefs.githubBranch, prefs.githubToken, path]); // eslint-disable-line react-hooks/exhaustive-deps

  const show = async (sha: string) => {
    if (!repo) return;
    setBusy(true);
    try {
      const f = await githubFetcher();
      setOpen({ sha, text: await noteAtCommit(repo, prefs.githubToken, path, sha, f) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const restore = async (text: string) => {
    setBusy(true);
    await save(path, text);
    setBusy(false);
    setOpen(null);
  };

  return (
    <>
      <BackBar label="Note" />
      <PageHead title="History" sub={path} />
      {error && <p className="errtext">{error}</p>}
      {!commits && !error && <p className="muted">Reading the history…</p>}
      {commits && commits.length === 0 && (
        <section className="card"><p className="muted">No commits have touched this note yet. The next sync will create one.</p></section>
      )}
      {commits && commits.length > 0 && (
        <section className="card stack">
          {commits.map((c) => (
            <button key={c.sha} className="srow tagrow" onClick={() => show(c.sha)} disabled={busy}>
              <span className="grow">{c.message || "(no message)"}</span>
              <span className="muted small">{when(c.date)}</span>
              <span className="mono small muted">{c.sha.slice(0, 7)}</span>
            </button>
          ))}
        </section>
      )}

      {open && (
        <>
          <div className="cap">As it was in {open.sha.slice(0, 7)}</div>
          <section className="card">
            <pre className="mono small histtext">{open.text}</pre>
          </section>
          <div className="btnrow start">
            <button className="btn" disabled={busy} onClick={() => restore(open.text)}>Restore this version</button>
            <button className="pill" onClick={() => setOpen(null)}>Close</button>
          </div>
          <p className="muted small">Restoring writes this text into the note. The next sync commits it as the newest version.</p>
        </>
      )}
    </>
  );
}
