import { beforeEach, describe, expect, it, vi } from "vitest";

// A tiny in-memory Android document provider, to exercise the folder-picker file layer without a phone.
interface Node { id: number; name: string; dir: boolean; content: string; mtime: number; kids: Node[] }
let nextId = 1;
let tick = 1_000;
const mk = (name: string, dir: boolean, content = ""): Node => ({ id: nextId++, name, dir, content, mtime: tick++, kids: [] });
let tree: Node;
const byId = new Map<number, Node>();
const reg = (n: Node) => (byId.set(n.id, n), n);
const uri = (n: Node) => ({ uri: `content://fake/${n.id}`, documentTopTreeUri: null });
const node = (u: { uri: string }) => {
  const n = byId.get(Number(u.uri.split("/").pop()));
  if (!n) throw new Error("gone");
  return n;
};
function ensurePath(base: Node, rel: string, leafIsDir: boolean, unique: boolean) {
  const parts = rel.split("/");
  let cur = base;
  parts.forEach((name, i) => {
    const last = i === parts.length - 1;
    let hit = cur.kids.find((k) => k.name === name);
    if (!hit || (last && unique)) {
      if (hit && last && unique) name = name.replace(/(\.\w+)?$/, " (1)$1");
      hit = reg(mk(name, !last || leafIsDir));
      cur.kids.push(hit);
    }
    cur = hit;
  });
  return cur;
}
const meta = (n: Node) => (n.dir ? { type: "Dir", name: n.name, lastModified: new Date(n.mtime) } : { type: "File", name: n.name, lastModified: new Date(n.mtime), byteLength: n.content.length, mimeType: "text/markdown" });
let granted = true;
let torn = 0; // number of upcoming writes that only land half the text
let writes = 0;

vi.mock("tauri-plugin-android-fs-api", () => ({
  PickerInitialLocation: {
    PublicDir: (baseDir: string, options?: Record<string, unknown>) => ({ type: "PublicDir", baseDir, ...options }),
  },
  isAndroid: () => true,
  readDir: async (u: { uri: string }) => node(u).kids.map((k) => ({ ...meta(k), uri: uri(k) })),
  createNewFile: async (b: { uri: string }, rel: string) => uri(ensurePath(node(b), rel, false, true)),
  createDir: async (b: { uri: string }, rel: string) => uri(ensurePath(node(b), rel, true, false)),
  readTextFile: async (u: { uri: string }) => node(u).content,
  writeTextFile: async (u: { uri: string }, data: string) => { const n = node(u); writes++; n.content = torn > 0 ? (torn--, data.slice(0, Math.floor(data.length / 2))) : data; n.mtime = tick++; },
  getMetadata: async (u: { uri: string }) => meta(node(u)),
  getName: async (u: { uri: string }) => node(u).name,
  removeFile: async (u: { uri: string }) => { const n = node(u); byId.delete(n.id); const walk = (d: Node) => { d.kids = d.kids.filter((k) => k !== n); d.kids.forEach(walk); }; walk(tree); },
  removeEmptyDir: async (u: { uri: string }) => { const n = node(u); if (n.kids.length) throw new Error("not empty"); byId.delete(n.id); const walk = (d: Node) => { d.kids = d.kids.filter((k) => k !== n); d.kids.forEach(walk); }; walk(tree); },
  renameFile: async (u: { uri: string }, name: string) => { const n = node(u); n.name = name; return uri(n); },
  showOpenDirPicker: async () => uri(tree),
  persistPickerUriPermission: async () => {},
  checkPersistedPickerUriPermission: async () => granted,
}));

import { resetCaches, safFs } from "../lib/safFs";

let root: string;
beforeEach(() => {
  nextId = 1; byId.clear(); granted = true; torn = 0; writes = 0; resetCaches();
  tree = reg(mk("Atonacht", true));
  root = "saf:" + JSON.stringify(uri(tree));
  safFs.defaultRoot();
});

describe("Android folder-picker file layer", () => {
  it("picks a folder and remembers it as a root", async () => {
    expect(await safFs.pickFolder!()).toBe(root);
    expect(await safFs.describeRoot!(root)).toBe("Atonacht");
  });

  it("writes new notes in nested folders, reads them back and lists them", async () => {
    const m1 = await safFs.write(root, "Daily notes/2026-10-29.md", "# Hi\n");
    await safFs.write(root, "top.md", "x");
    await safFs.mkdir(root, "Empty folder");
    expect(await safFs.read(root, "Daily notes/2026-10-29.md")).toBe("# Hi\n");
    const m2 = await safFs.write(root, "Daily notes/2026-10-29.md", "# Hi\n- [ ] one\n"); // overwrite, no duplicate file
    expect(m2).toBeGreaterThan(m1);
    const list = await safFs.list(root);
    expect(list.map((e) => `${e.kind}:${e.path}`)).toEqual(["dir:Daily notes", "file:Daily notes/2026-10-29.md", "dir:Empty folder", "file:top.md"]);
    expect(await safFs.read(root, "Daily notes/2026-10-29.md")).toBe("# Hi\n- [ ] one\n");
  });

  it("skips hidden items and non-Markdown files", async () => {
    ensurePath(tree, ".stfolder/marker", false, false);
    ensurePath(tree, "photo.png", false, false);
    await safFs.write(root, "a.md", "A");
    expect((await safFs.list(root)).map((e) => e.path)).toEqual(["a.md"]);
  });

  it("finds notes it has not listed yet, and only writes Markdown inside the folder", async () => {
    ensurePath(tree, "Games/idea.md", false, false).content = "pitch";
    expect(await safFs.read(root, "Games/idea.md")).toBe("pitch"); // no list() first
    await expect(safFs.read(root, "Games/missing.md")).rejects.toThrow(/Not found/);
    await expect(safFs.write(root, "script.sh", "x")).rejects.toThrow(/Only .md/);
    await expect(safFs.write(root, "../escape.md", "x")).rejects.toThrow(/not allowed/);
  });

  it("moves deleted notes to .trash instead of deleting them", async () => {
    await safFs.write(root, "Games/idea.md", "pitch");
    await safFs.remove(root, "Games/idea.md");
    expect((await safFs.list(root)).filter((e) => e.kind === "file")).toEqual([]);
    const trash = tree.kids.find((k) => k.name === ".trash")!;
    expect(trash.kids[0].kids[0].content).toBe("pitch"); // .trash/Games/idea.md
  });

  it("renames in place, across folders, and refuses to overwrite", async () => {
    await safFs.write(root, "a.md", "A");
    await safFs.write(root, "b.md", "B");
    await expect(safFs.rename(root, "a.md", "b.md")).rejects.toThrow(/already exists/);
    await safFs.rename(root, "a.md", "c.md");
    await safFs.rename(root, "c.md", "Sub/c.md");
    expect(await safFs.read(root, "Sub/c.md")).toBe("A");
    expect((await safFs.list(root)).filter((e) => e.kind === "file").map((e) => e.path)).toEqual(["b.md", "Sub/c.md"]);
  });

  it("explains when Android took the folder permission away", async () => {
    granted = false;
    await expect(safFs.ensureRoot(root)).rejects.toThrow(/Choose the folder again/);
    await expect(safFs.list("/some/typed/path")).rejects.toThrow(/No folder chosen/);
  });
});

describe("when a sync app replaces a file behind our back", () => {
  it("recovers from a stale cached URI on read and write", async () => {
    await safFs.write(root, "a.md", "old");
    await safFs.list(root); // caches the URI
    // Syncthing-style replace: the old document disappears, a new one with a new id takes its name
    const old = tree.kids.find((k) => k.name === "a.md")!;
    byId.delete(old.id);
    tree.kids = tree.kids.filter((k) => k !== old);
    const fresh = reg(mk("a.md", false, "from the other device"));
    tree.kids.push(fresh);
    expect(await safFs.read(root, "a.md")).toBe("from the other device");
    byId.delete(fresh.id);
    const newer = reg(mk("a.md", false, "newer"));
    tree.kids = [newer];
    await safFs.write(root, "a.md", "mine"); // cached URI is stale again
    expect(newer.content).toBe("mine");
  });
});

describe("trash and folders (Android)", () => {
  it("lists, restores and purges trashed notes, and removes only empty folders", async () => {
    await safFs.write(root, "Games/idea.md", "pitch");
    await safFs.write(root, "gone.md", "bye");
    await safFs.remove(root, "Games/idea.md");
    await safFs.remove(root, "gone.md");
    const trashed = (await safFs.listTrash(root)).map((e) => e.path);
    expect(trashed).toHaveLength(2);
    const idea = trashed.find((p) => p.startsWith("Games/idea"))!;
    const gone = trashed.find((p) => p.startsWith("gone"))!;
    expect(idea).toMatch(/^Games\/idea \(trashed \d+\)\.md$/);
    await safFs.write(root, "Games/idea.md", "newer"); // name taken, so restore must not overwrite
    expect(await safFs.restore(root, idea)).toBe("Games/idea (restored).md");
    expect(await safFs.read(root, "Games/idea (restored).md")).toBe("pitch");
    await safFs.purge(root, gone);
    expect(await safFs.listTrash(root)).toEqual([]);
    await expect(safFs.removeDir(root, "Games")).rejects.toThrow();
    await safFs.mkdir(root, "Empty");
    await safFs.removeDir(root, "Empty");
    expect((await safFs.list(root)).some((e) => e.path === "Empty")).toBe(false);
  });
});

describe("saving safely on Android", () => {
  it("re-writes when a save lands half-written, and reports success only when the note reads back correctly", async () => {
    await safFs.write(root, "a.md", "first version of the note");
    torn = 1;
    writes = 0;
    await safFs.write(root, "a.md", "second version, longer than before");
    expect(writes).toBe(2); // the torn write was noticed and repeated
    expect(await safFs.read(root, "a.md")).toBe("second version, longer than before");
  });
  it("gives up with a clear message if it never reads back correctly", async () => {
    await safFs.write(root, "b.md", "ok");
    torn = 5;
    await expect(safFs.write(root, "b.md", "this will never land")).rejects.toThrow(/didn’t save correctly/);
  });
  it("new notes are verified too", async () => {
    torn = 1;
    await safFs.write(root, "new.md", "brand new note text");
    expect(await safFs.read(root, "new.md")).toBe("brand new note text");
  });
});
