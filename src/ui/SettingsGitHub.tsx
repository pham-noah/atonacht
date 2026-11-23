import { useState } from "react";
import { usePrefs } from "../prefs";
import { useStore } from "../store";
import { githubFetcher } from "../lib/githubFetch";
import { parseRepo, pullNotes, pushNotes } from "../lib/github";
import { describeOutcome, syncWithGitHub } from "../lib/githubSync";
import { Group, Row } from "./SettingsParts";

export function GitHubSetup() {
  const { prefs, setPrefs } = usePrefs();
  const { all, save } = useStore();
  const [busy, setBusy] = useState<"" | "sync" | "pull" | "push" | "test">("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const repo = parseRepo(prefs.githubRepo);
  const ready = !!repo && !!prefs.githubToken;

  const run = async (what: "sync" | "pull" | "push" | "test") => {
    if (!repo) { setErr("That is not a repository. Write owner/repo, for example pham-noah/notes."); return; }
    setBusy(what);
    setErr("");
    setMsg("");
    try {
      const f = await githubFetcher();
      if (what === "sync") {
        const out = await syncWithGitHub({ repo, branch: prefs.githubBranch, token: prefs.githubToken, notes: all, save, fetcher: f });
        setMsg(describeOutcome(out));
      } else if (what === "push") {
        const out = await pushNotes(repo, prefs.githubBranch, prefs.githubToken, all, f);
        setMsg(out ? `Committed ${out.files} note${out.files === 1 ? "" : "s"} as ${out.commit.slice(0, 7)}.` : "Nothing to commit — the repository already matches this folder.");
      } else {
        const out = await pullNotes(repo, prefs.githubBranch, prefs.githubToken, f);
        let added = 0;
        let copies = 0;
        for (const [path, content] of Object.entries(out.files)) {
          const here = all[path];
          if (here === content) continue;
          if (here === undefined) {
            await save(path, content);
            added++;
            continue;
          }
          // Never overwrite what is on this device from a copy that may be older: keep the remote text beside it.
          const dot = path.lastIndexOf(".");
          const beside = dot > 0 ? `${path.slice(0, dot)} (github)${path.slice(dot)}` : `${path} (github)`;
          await save(beside, content);
          copies++;
        }
        setMsg(
          what === "test"
            ? `${Object.keys(out.files).length} notes in ${repo.owner}/${repo.repo} at ${out.commit.slice(0, 7)}.`
            : `Read ${Object.keys(out.files).length} notes at ${out.commit.slice(0, 7)}: ${added} added, ${copies} kept beside yours, ${Object.keys(out.files).length - added - copies} already the same.`,
        );
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };

  return (
    <Group title="GitHub">
      <Row label="Repository" hint="owner/repo, or paste the URL. Make it private unless you want the notes public.">
        <input
          className="in mono"
          value={prefs.githubRepo}
          placeholder="pham-noah/notes"
          spellCheck={false}
          onChange={(e) => setPrefs({ githubRepo: e.target.value })}
        />
      </Row>
      <Row label="Branch" hint="The branch is created on the first push if it does not exist.">
        <input
          className="in mono"
          value={prefs.githubBranch}
          placeholder="main"
          spellCheck={false}
          onChange={(e) => setPrefs({ githubBranch: e.target.value })}
        />
      </Row>
      <Row label="Token" hint="A fine-grained token with Contents: read and write on this one repository. It stays on this device.">
        <input
          className="in mono"
          type="password"
          value={prefs.githubToken}
          placeholder="github_pat_…"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setPrefs({ githubToken: e.target.value })}
        />
      </Row>
      <p className="muted small">
        One commit per sync, not one per note. Nothing is fetched until you press Pull, so GitHub is a copy you can trust
        with history — not a live sync like Syncthing. Press Push first to send what is here.
      </p>
      <div className="btnrow start">
        <button className="btn" type="button" disabled={!ready || !!busy} onClick={() => run("push")}>{busy === "push" ? "Pushing…" : "Push now"}</button>
        <button className="pill" type="button" disabled={!ready || !!busy} onClick={() => run("pull")}>{busy === "pull" ? "Pulling…" : "Pull now"}</button>
        <button className="pill" type="button" disabled={!ready || !!busy} onClick={() => run("test")}>{busy === "test" ? "Checking…" : "Test"}</button>
      </div>
      {msg && <p className="muted small">{msg}</p>}
      {err && <p className="errtext">{err}</p>}
    </Group>
  );
}

/**
 * Syncthing setup for someone who has never used Syncthing: install -> share the folder -> optional status read-out.
 * The two fields alone are useless unless you already know that Syncthing runs a web interface on port 8384 and hides
 * an API key in its settings, so each step says what it is for.
 */
