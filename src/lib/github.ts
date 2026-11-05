/**
 * GitHub as a notes backend.
 *
 * It is a git remote, so the app talks to the Git Data API directly: blobs, a tree, a commit, and a moved ref — one
 * commit per sync rather than one request per file, and no libgit2 to cross-compile for four ABIs. What this is not is
 * live: GitHub has no push channel, so the app reads on open and on an interval, like any other pull-based remote.
 */

export interface Repo {
  owner: string;
  repo: string;
}

export type Fetcher = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>; // eslint-disable-line @typescript-eslint/no-explicit-any

const API = "https://api.github.com";

/** Accepts "owner/repo" or any GitHub URL for it. */
export function parseRepo(input: string): Repo | null {
  const trimmed = input.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const url = trimmed.match(/github\.com[/:]([^/]+)\/([^/]+)$/i);
  const slug = url ? [url[1], url[2]] : trimmed.split("/");
  if (slug.length !== 2 || !slug[0] || !slug[1]) return null;
  return { owner: slug[0], repo: slug[1] };
}

const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
});

class HttpError extends Error {
  constructor(public status: number, path: string) {
    super(explain(status, path));
    this.name = "HttpError";
  }
}

function explain(status: number, path: string): string {
  if (status === 401) return "GitHub did not accept that token. Use a fine-grained token with Contents: read and write on this repository.";
  if (status === 403) return "GitHub refused that request — the token may be read-only, or the repository is not in its scope.";
  if (status === 404) return `GitHub could not find ${path}. Check the repository name, the branch, and that the token can see it.`;
  if (status === 409) return "That branch moved while syncing. Try again — the next attempt builds on the new head.";
  if (status === 422) return "GitHub rejected that tree, usually because a file path is not allowed there.";
  return `GitHub answered ${status} for ${path}.`;
}

/** One commit containing every file whose content changed, or null when nothing did. */
export async function pushNotes(
  repo: Repo,
  branch: string,
  token: string,
  files: Record<string, string>,
  fetcher: Fetcher,
): Promise<{ commit: string; files: number } | null> {
  const call = async (path: string, method = "GET", body?: unknown) => {
    const r = await fetcher(`${API}${path}`, {
      method,
      headers: headers(token),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!r.ok) throw new HttpError(r.status, path);
    return r.json();
  };

  const base = `/repos/${repo.owner}/${repo.repo}`;
  const ref = await call(`${base}/git/ref/heads/${encodeURIComponent(branch)}`).catch((e: unknown) => {
    // an empty repository has no ref yet: start from an empty tree rather than failing the first push
    if (e instanceof HttpError && e.status === 404) return null;
    throw e;
  });
  const headCommit = ref?.object?.sha ? await call(`${base}/git/commits/${ref.object.sha}`) : null;
  const headTree = headCommit?.tree?.sha ?? null;

  const existing = headTree ? await call(`${base}/git/trees/${headTree}?recursive=1`) : { tree: [] };
  const known = new Map<string, string>((existing.tree ?? []).filter((n: { type: string }) => n.type === "blob").map((n: { path: string; sha: string }) => [n.path, n.sha]));

  const entries: Array<{ path: string; mode: string; type: string; sha: string }> = [];
  let changed = 0;
  for (const [path, content] of Object.entries(files)) {
    const blob = await call(`${base}/git/blobs`, "POST", { content, encoding: "utf-8" });
    if (known.get(path) !== blob.sha) changed++;
    entries.push({ path, mode: "100644", type: "blob", sha: blob.sha });
  }
  // files that vanished locally are deleted in the commit, so the repo mirrors the folder
  for (const path of known.keys()) if (!(path in files)) changed++;
  if (changed === 0) return null;

  const tree = await call(`${base}/git/trees`, "POST", { tree: entries });
  const commit = await call(`${base}/git/commits`, "POST", {
    message: `Atonacht: ${changed} note${changed === 1 ? "" : "s"} from this device`,
    tree: tree.sha,
    parents: ref?.object?.sha ? [ref.object.sha] : [],
  });
  await call(`${base}/git/refs/heads/${encodeURIComponent(branch)}`, "PATCH", { sha: commit.sha, force: false });
  return { commit: commit.sha, files: changed };
}

/** Every note in the branch, with the commit it came from — what the app needs to rewrite changed files only. */
export async function pullNotes(
  repo: Repo,
  branch: string,
  token: string,
  fetcher: Fetcher,
): Promise<{ commit: string; files: Record<string, string> }> {
  const call = async (path: string) => {
    const r = await fetcher(`${API}${path}`, { headers: headers(token) });
    if (!r.ok) throw new HttpError(r.status, path);
    return r.json();
  };
  const base = `/repos/${repo.owner}/${repo.repo}`;
  const ref = await call(`${base}/git/ref/heads/${encodeURIComponent(branch)}`);
  const commit = await call(`${base}/git/commits/${ref.object.sha}`);
  const tree = await call(`${base}/git/trees/${commit.tree.sha}?recursive=1`);
  const blobs = (tree.tree ?? []).filter((n: { type: string; path: string }) => n.type === "blob" && n.path.endsWith(".md"));
  const files: Record<string, string> = {};
  for (const b of blobs) {
    const blob = await call(`${base}/git/blobs/${b.sha}`);
    files[b.path] = atob(blob.content.replace(/\s/g, ""));
  }
  return { commit: ref.object.sha, files };
}
