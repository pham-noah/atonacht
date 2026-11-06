import { describe, expect, it } from "vitest";
import { Fetcher } from "../lib/github";
import { besidePath, describeOutcome, noteHistory, reconcile, syncWithGitHub } from "../lib/githubSync";

describe("reconciling two versions of one note", () => {
  it("says nothing changed when they are equal, ignoring line endings and the last newline", () => {
    expect(reconcile("a\nb", "a\r\nb\n").how).toBe("same");
  });

  it("takes the longer side when one contains the other, because nothing is lost", () => {
    expect(reconcile("a\nb\nc", "a\nb")).toMatchObject({ how: "local", text: "a\nb\nc" });
    expect(reconcile("a\nb", "a\nb\nc")).toMatchObject({ how: "remote", text: "a\nb\nc" });
  });

  it("refuses to guess when both sides changed the same lines", () => {
    expect(reconcile("a\nmine", "a\nyours")).toMatchObject({ how: "both", text: "a\nmine" });
  });

  it("puts a kept copy beside the note", () => {
    expect(besidePath("Thesis/Outline.md")).toBe("Thesis/Outline (github).md");
    expect(besidePath("no extension")).toBe("no extension (github)");
  });
});

/** A fake GitHub whose ref points at a tree of files, and which records what the push sent. */
function fakeGitHub(remoteFiles: Record<string, string>) {
  const blobs = new Map<string, string>();
  const tree = Object.entries(remoteFiles).map(([path, text], i) => {
    const sha = `b${i}`;
    blobs.set(sha, text);
    return { path, type: "blob", sha };
  });
  let refSha = "head1";
  const pushed: Record<string, string> = {};
  const fetcher: Fetcher = async (url, init) => {
    const path = url.replace("https://api.github.com", "");
    const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });
    if (path.endsWith("/git/ref/heads/main") && (init?.method ?? "GET") === "GET") return reply(200, { object: { sha: refSha } });
    if (path.includes("/git/refs/heads/main") && init?.method === "PATCH") {
      refSha = JSON.parse(init.body!).sha;
      return reply(200, {});
    }
    if (path.includes("/git/commits/") && (init?.method ?? "GET") === "GET") return reply(200, { tree: { sha: "tree1" } });
    if (path.endsWith("/git/trees/tree1?recursive=1")) return reply(200, { tree });
    if (path.endsWith("/git/blobs") && init?.method === "POST") {
      const body = JSON.parse(init.body!);
      pushed[body.content] = body.content;
      return reply(201, { sha: `n${Object.keys(pushed).length}` });
    }
    if (path.endsWith("/git/trees") && init?.method === "POST") return reply(201, { sha: "tree2" });
    if (path.endsWith("/git/commits") && init?.method === "POST") return reply(201, { sha: "commit2" });
    const blob = path.match(/\/git\/blobs\/([^?]+)$/);
    if (blob) return reply(200, { content: btoa(blobs.get(blob[1]) ?? "") });
    return reply(404, {});
  };
  return { fetcher, pushed };
}

describe("syncing with GitHub", () => {
  it("writes what the remote has and this device does not, then commits", async () => {
    const gh = fakeGitHub({ "New.md": "# New\n" });
    const saved: Record<string, string> = {};
    const out = await syncWithGitHub({
      repo: { owner: "o", repo: "r" },
      branch: "main",
      token: "t",
      notes: { "Mine.md": "# Mine\n" },
      save: async (p, c) => void (saved[p] = c),
      fetcher: gh.fetcher,
    });
    expect(out.added).toEqual(["New.md"]);
    expect(saved["New.md"]).toBe("# New\n");
    expect(out.pushed?.commit).toBe("commit2");
    expect(describeOutcome(out)).toContain("1 new from GitHub");
  });

  it("keeps the remote copy beside a note both sides changed, instead of overwriting", async () => {
    const gh = fakeGitHub({ "Note.md": "mine\n" });
    const saved: Record<string, string> = {};
    const out = await syncWithGitHub({
      repo: { owner: "o", repo: "r" },
      branch: "main",
      token: "t",
      notes: { "Note.md": "theirs\n" },
      save: async (p, c) => void (saved[p] = c),
      fetcher: gh.fetcher,
    });
    expect(out.kept).toEqual(["Note.md"]);
    expect(saved["Note (github).md"]).toBe("mine\n");
    expect(out.added).toEqual([]);
  });
});

describe("the history of one note", () => {
  it("lists the commits that touched it", async () => {
    const fetcher: Fetcher = async (url) => {
      expect(url).toContain("path=Daily%20notes%2F2026-11-05.md");
      return {
        ok: true,
        status: 200,
        json: async () => [{ sha: "abc123", commit: { message: "Atonacht: 2 notes\n\nbody", author: { date: "2026-11-05T10:00:00Z" } } }],
      };
    };
    const history = await noteHistory({ owner: "o", repo: "r" }, "main", "t", "Daily notes/2026-11-05.md", fetcher);
    expect(history).toEqual([{ sha: "abc123", date: "2026-11-05T10:00:00Z", message: "Atonacht: 2 notes" }]);
  });
});
