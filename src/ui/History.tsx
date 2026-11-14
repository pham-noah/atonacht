import { useCallback, useEffect, useState } from "react";
import { githubFetcher } from "../lib/githubFetch";
import { parseRepo } from "../lib/github";
import { Commit, noteAtCommit, noteHistory as repoHistory } from "../lib/githubSync";
import { NoteVersion, noteHistory } from "../lib/noteHistory";
import { usePrefs } from "../prefs";
import { useStore } from "../store";
import { BackBar, PageHead } from "./common";

const when = (at: number | string) => {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

const weight = (text: string) => {
  const n = new TextEncoder().encode(text).length;
  return n < 1024 ? `${n} bytes` : `${Math.round(n / 1024)} kB`;
};

/**
 * Two answers to "what did this look like before".
 *
 * On this device: the last few texts each save replaced, kept in the app's own storage — no repository and no token, and
 * the only history that exists on Android, where a save truncates the note before writing it. In the repository: the
 * commits that touched the note, when GitHub is set up. Restoring either way writes the old text back into the note, so
 * the next save or sync makes it the newest version again.
 */
export function History({ path }: { path: string }) {
  const { prefs } = usePrefs();
  const { save, root } = useStore();
  const repo = parseRepo(prefs.githubRepo);
  const github = !!repo && !!prefs.githubToken;
  const [local, setLocal] = useState<NoteVersion[] | null>(null);
  const [commits, setCommits] = useState<Commit[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<{ title: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const readLocal = useCallback(async () => {
    setLocal(await noteHistory.list(root, path).catch((): NoteVersion[] => []));
  }, [root, path]);

  useEffect(() => {
    void readLocal();
  }, [readLocal]);

  useEffect(() => {
    if (!github) {
      setCommits(null); // no remote: the device's own versions are the whole history, and there is nothing to read
      return;
    }
    let stop = false;
    (async () => {
      try {
        const f = await githubFetcher();
        const list = await repoHistory(repo, prefs.githubBranch, prefs.githubToken, path, f);
        if (!stop) setCommits(list);
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      stop = true;
    };
  }, [repo?.owner, repo?.repo, prefs.githubBranch, prefs.githubToken, path, github]); // eslint-disable-line react-hooks/exhaustive-deps

  const showCommit = async (sha: string) => {
    if (!repo) return;
    setBusy(true);
    try {
      const f = await githubFetcher();
      setOpen({ title: `As it was in ${sha.slice(0, 7)}`, text: await noteAtCommit(repo, prefs.githubToken, path, sha, f) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const restore = async (text: string) => {
    setBusy(true);
    await save(path, text); // the text being replaced is kept as a version too, so a restore itself can be undone
    setBusy(false);
    setOpen(null);
    await readLocal();
  };

  return (
    <>
      <BackBar label="Note" />
      <PageHead title="History" sub={path} />
      {open && (
        <>
          <div className="cap">{open.title}</div>
          <section className="card">
            <pre className="mono small histtext">{open.text}</pre>
          </section>
          <div className="btnrow start">
            <button className="btn" disabled={busy} onClick={() => restore(open.text)}>Restore this version</button>
            <button className="pill" onClick={() => setOpen(null)}>Close</button>
          </div>
          <p className="muted small">Restoring writes this text into the note, so it becomes the newest version again.</p>
        </>
      )}

      <div className="cap">On this device</div>
      {!local && <section className="card"><p className="muted">Reading this note’s versions…</p></section>}
      {local && local.length === 0 && (
        <section className="card">
          <p className="muted">No versions yet. The next save keeps the text it replaces, so a bad edit can be undone from here.</p>
        </section>
      )}
      {local && local.length > 0 && (
        <>
          <section className="card stack">
            {local.map((v, i) => (
              <button key={`${v.at}-${i}`} className="srow tagrow" disabled={busy} onClick={() => setOpen({ title: `Before ${when(v.at)}`, text: v.content })}>
                <span className="grow">{when(v.at)}</span>
                <span className="muted small">{weight(v.content)}</span>
              </button>
            ))}
          </section>
          <p className="muted small">
            The last {local.length} {local.length === 1 ? "version" : "versions"} this note was saved from, newest first. Kept in Atonacht’s own
            storage; Settings → Files &amp; backup clears them.
          </p>
        </>
      )}

      <div className="cap">In the repository</div>
      {!github && (
        <section className="card">
          <p className="muted">Set a repository and token in Settings → Sync → GitHub to also see this note’s commits here.</p>
        </section>
      )}
      {github && error && <p className="errtext">{error}</p>}
      {github && !error && !commits && <p className="muted">Reading the history…</p>}
      {github && commits && commits.length === 0 && (
        <section className="card"><p className="muted">No commits have touched this note yet. The next sync will create one.</p></section>
      )}
      {github && commits && commits.length > 0 && (
        <section className="card stack">
          {commits.map((c) => (
            <button key={c.sha} className="srow tagrow" onClick={() => showCommit(c.sha)} disabled={busy}>
              <span className="grow">{c.message || "(no message)"}</span>
              <span className="muted small">{when(c.date)}</span>
              <span className="mono small muted">{c.sha.slice(0, 7)}</span>
            </button>
          ))}
        </section>
      )}
    </>
  );
}
