import { describe, expect, it } from "vitest";
import { Fetcher, parseRepo, pullNotes, pushNotes } from "../lib/github";

describe("reading a repository name", () => {
  it("takes owner/repo, a URL, and a URL with .git", () => {
    expect(parseRepo("pham-noah/notes")).toEqual({ owner: "pham-noah", repo: "notes" });
    expect(parseRepo("https://github.com/pham-noah/notes")).toEqual({ owner: "pham-noah", repo: "notes" });
    expect(parseRepo("https://github.com/pham-noah/notes.git")).toEqual({ owner: "pham-noah", repo: "notes" });
    expect(parseRepo("git@github.com:pham-noah/notes.git")).toEqual({ owner: "pham-noah", repo: "notes" });
    expect(parseRepo("nonsense")).toBeNull();
  });
});

/**
 * A fake GitHub that remembers blobs and refs, so the test can check what a sync actually sent — the API shape matters
 * more than the transport here.
 */
function fakeGitHub(existing: Record<string, string> = {}, opts: { empty?: boolean; status?: number } = {}) {
  const bySha = new Map<string, string>();
  const commits: Array<{ sha: string; tree: string; parents: string[] }> = [];
  let refSha = opts.empty ? null : "head1";
  // a content-addressed sha, like git: the same text always gets the same sha, which is what makes a no-op push possible
  const shaOf = (content: string) => `b${content.length}:${content}`;
  const tree = Object.entries(existing).map(([path, content]) => {
    const sha = shaOf(content);
    bySha.set(sha, content);
    return { path, type: "blob", sha };
  });
  const calls: string[] = [];
  const fetcher: Fetcher = async (url, init) => {
    const path = url.replace("https://api.github.com", "");
    calls.push(`${init?.method ?? "GET"} ${path}`);
    const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });
    if (opts.status) return reply(opts.status, { message: "nope" });
    if (path.endsWith("/git/ref/heads/main") && (init?.method ?? "GET") === "GET") {
      if (!refSha) return reply(404, { message: "Not Found" });
      return reply(200, { object: { sha: refSha } });
    }
    if (path.includes("/git/refs/heads/main") && init?.method === "PATCH") {
      refSha = JSON.parse(init.body!).sha;
      return reply(200, { object: { sha: refSha } });
    }
    if (path.includes("/git/commits/") && (init?.method ?? "GET") === "GET") {
      const sha = path.split("/git/commits/")[1];
      const found = commits.find((c) => c.sha === sha);
      return reply(200, found ? { tree: { sha: found.tree } } : { tree: { sha: "tree0" } });
    }
    if (path.endsWith("/git/trees/tree0?recursive=1")) return reply(200, { tree });
    if (path.endsWith("/git/blobs") && init?.method === "POST") {
      const body = JSON.parse(init.body!);
      const sha = shaOf(body.content);
      bySha.set(sha, body.content);
      return reply(201, { sha });
    }
    if (path.endsWith("/git/trees") && init?.method === "POST") {
      const body = JSON.parse(init.body!);
      return reply(201, { sha: `tree${body.tree.length}` });
    }
    if (path.endsWith("/git/commits") && init?.method === "POST") {
      const body = JSON.parse(init.body!);
      const sha = `commit${commits.length + 1}`;
      commits.push({ sha, tree: body.tree, parents: body.parents });
      return reply(201, { sha });
    }
    const blobMatch = path.match(/\/git\/blobs\/([^?]+)$/);
    if (blobMatch) return reply(200, { content: btoa(bySha.get(blobMatch[1]) ?? "") });
    return reply(404, { message: "Not Found" });
  };
  return { fetcher, calls, commits, ref: () => refSha, bySha };
}

describe("pushing notes to GitHub", () => {
  it("commits every changed note in one commit and moves the branch", async () => {
    const gh = fakeGitHub({ "Note.md": "old" });
    const out = await pushNotes({ owner: "o", repo: "r" }, "main", "t", { "Note.md": "new", "Other.md": "fresh" }, gh.fetcher);
    expect(out?.files).toBe(2);
    expect(gh.commits).toHaveLength(1);
    expect(gh.commits[0].parents).toEqual(["head1"]);
    expect(gh.ref()).toBe("commit1");
  });

  it("makes no commit when the folder and the repo already match", async () => {
    const gh = fakeGitHub({ "Note.md": "same" });
    const out = await pushNotes({ owner: "o", repo: "r" }, "main", "t", { "Note.md": "same" }, gh.fetcher);
    expect(out).toBeNull();
    expect(gh.commits).toHaveLength(0);
  });

  it("starts from an empty tree when the repository has no commits", async () => {
    const gh = fakeGitHub({}, { empty: true });
    const out = await pushNotes({ owner: "o", repo: "r" }, "main", "t", { "Note.md": "hi" }, gh.fetcher);
    expect(out?.files).toBe(1);
    expect(gh.commits[0].parents).toEqual([]);
  });

  it("says what a bad token means instead of repeating a status code", async () => {
    const gh = fakeGitHub({}, { status: 401 });
    await expect(pushNotes({ owner: "o", repo: "r" }, "main", "t", { "a.md": "x" }, gh.fetcher)).rejects.toThrow(/fine-grained token/);
  });
});

describe("pulling notes from GitHub", () => {
  it("reads only Markdown files and keeps the commit it read them from", async () => {
    const gh = fakeGitHub({ "A.md": "# A", "keep.json": "{}" });
    const out = await pullNotes({ owner: "o", repo: "r" }, "main", "t", gh.fetcher);
    expect(out.commit).toBe("head1");
    expect(out.files).toEqual({ "A.md": "# A" });
  });
});
