import { useEffect, useRef, useState } from "react";
import { useStore } from "./store";
import { usePrefs } from "./prefs";
import { githubFetcher } from "./lib/githubFetch";
import { parseRepo } from "./lib/github";
import { describeOutcome, syncWithGitHub } from "./lib/githubSync";

/**
 * Keeps the folder in step with GitHub while the app is open.
 *
 * GitHub has no push channel, so "sync" can only mean this: fetch on start and on an interval, reconcile, commit. When
 * both sides changed the same note, the remote copy is kept beside the local one rather than one of them winning.
 */
export function useGithubSync() {
  const { notes, ready, save } = useStore();
  const { prefs } = usePrefs();
  const [state, setState] = useState<{ at: number; message: string } | null>(null);
  const running = useRef(false);
  const configured = (prefs.syncMethod === "github" || prefs.syncMethod === "both") && !!prefs.githubRepo && !!prefs.githubToken;
  const repo = parseRepo(prefs.githubRepo);

  useEffect(() => {
    if (!configured || !repo || !ready) return;
    let stop = false;

    const run = async () => {
      if (running.current || stop) return;
      running.current = true;
      try {
        const out = await syncWithGitHub({
          repo,
          branch: prefs.githubBranch,
          token: prefs.githubToken,
          notes: notes,
          save,
          fetcher: await githubFetcher(),
        });
        if (!stop) setState({ at: Date.now(), message: describeOutcome(out) });
      } catch (e) {
        if (!stop) setState({ at: Date.now(), message: `GitHub: ${e instanceof Error ? e.message : String(e)}` });
      } finally {
        running.current = false;
      }
    };

    void run();
    const t = window.setInterval(() => void run(), 10 * 60_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
    // notes changes every save; re-running the whole sync on each keystroke would be wrong, so it is intentionally out.
  }, [configured, repo?.owner, repo?.repo, prefs.githubBranch, prefs.githubToken, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  return { configured, last: state };
}
