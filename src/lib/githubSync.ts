import { Fetcher, Repo, pullNotes, pushNotes } from "./github";

export interface SyncOutcome {
  commit: string;
  /** files written locally because the remote had something this device did not */
  added: string[];
  /** files where both sides changed: the remote copy was kept beside the local one */
  kept: string[];
  /** files that differed only by being a subset of the other side, so one side won */
  merged: string[];
  /** what the push reported, null when the repository already matched */
  pushed: { commit: string; files: number } | null;
}

/**
 * How two versions of the same note are reconciled without a merge editor.
 *
 * A note is text: if one version contains the other, the longer one is the newer one and wins. Anything else is a real
 * divergence, and guessing is how work disappears, so the remote text is written beside the local one for the person to
 * resolve — the same choice Syncthing's conflict files give.
 */
export function reconcile(local: string, remote: string): { text: string; how: "same" | "local" | "remote" | "both" } {
  if (local === remote) return { text: local, how: "same" };
  const norm = (s: string) => s.replace(/\r\n/g, "\n").trimEnd();
  const [l, r] = [norm(local), norm(remote)];
  if (l === r) return { text: local, how: "same" };
  if (l.includes(r)) return { text: local, how: "local" }; // the remote only lacks what this device added
  if (r.includes(l)) return { text: remote, how: "remote" }; // this device never changed what the remote has since grown
  return { text: local, how: "both" };
}

/** "Note.md" → "Note (github).md", next to the original. */
export function besidePath(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot > path.lastIndexOf("/") ? `${path.slice(0, dot)} (github)${path.slice(dot)}` : `${path} (github)`;
}

export async function syncWithGitHub(opts: {
  repo: Repo;
  branch: string;
  token: string;
  notes: Record<string, string>;
  save: (path: string, content: string) => Promise<void>;
  fetcher: Fetcher;
}): Promise<SyncOutcome> {
  const { repo, branch, token, notes, save, fetcher } = opts;
  const remote = await pullNotes(repo, branch, token, fetcher);
  const out: SyncOutcome = { commit: remote.commit, added: [], kept: [], merged: [], pushed: null };

  const next: Record<string, string> = { ...notes };
  for (const [path, text] of Object.entries(remote.files)) {
    const here = notes[path];
    if (here === undefined) {
      await save(path, text);
      next[path] = text;
      out.added.push(path);
      continue;
    }
    const { text: resolved, how } = reconcile(here, text);
    if (how === "remote") {
      await save(path, resolved);
      next[path] = resolved;
      out.merged.push(path);
    } else if (how === "both") {
      // the local note stays; the remote version is kept beside it so nothing is lost
      await save(besidePath(path), text);
      out.kept.push(path);
    }
  }

  out.pushed = await pushNotes(repo, branch, token, next, fetcher);
  return out;
}

/** One line for the person who pressed the button. */
export function describeOutcome(o: SyncOutcome): string {
  const bits: string[] = [];
  if (o.added.length) bits.push(`${o.added.length} new from GitHub`);
  if (o.merged.length) bits.push(`${o.merged.length} updated from GitHub`);
  if (o.kept.length) bits.push(`${o.kept.length} kept beside yours`);
  if (o.pushed) bits.push(`committed ${o.pushed.files} note${o.pushed.files === 1 ? "" : "s"} (${o.pushed.commit.slice(0, 7)})`);
  if (!bits.length) return "Already in step with GitHub — nothing to send or fetch.";
  return bits.join(" · ");
}

export interface Commit {
  sha: string;
  date: string;
  message: string;
}

/** The commits that touched one note, newest first. */
export async function noteHistory(repo: Repo, branch: string, token: string, path: string, fetcher: Fetcher, limit = 20): Promise<Commit[]> {
  const url = `https://api.github.com/repos/${repo.owner}/${repo.repo}/commits?sha=${encodeURIComponent(branch)}&path=${encodeURIComponent(path)}&per_page=${limit}`;
  const r = await fetcher(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } });
  if (r.status === 401 || r.status === 403) throw new Error("GitHub rejected that token.");
  if (!r.ok) throw new Error(`GitHub answered ${r.status}.`);
  const list = (await r.json()) as Array<{ sha: string; commit: { message?: string; author?: { date?: string } } }>;
  return (list ?? []).map((c) => ({
    sha: c.sha,
    date: c.commit.author?.date ?? "",
    message: (c.commit.message ?? "").split("\n")[0],
  }));
}

/** One note as it was at a given commit. */
export async function noteAtCommit(repo: Repo, token: string, path: string, sha: string, fetcher: Fetcher): Promise<string> {
  const url = `https://api.github.com/repos/${repo.owner}/${repo.repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${sha}`;
  const r = await fetcher(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } });
  if (!r.ok) throw new Error(`GitHub answered ${r.status}.`);
  const j = (await r.json()) as { content?: string; encoding?: string };
  return atob((j.content ?? "").replace(/\s/g, ""));
}
