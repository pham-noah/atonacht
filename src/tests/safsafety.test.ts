import { beforeEach, describe, expect, it, vi } from "vitest";

// The same in-memory Android document provider as saf.test.ts, with a switch that makes writes land half the text -
// what a sync app or a full disk can do to a note mid-save.
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
function ensurePath(base: Node, rel: string, leafIsDir: boolean) {
  const parts = rel.split("/");
  let cur = base;
  parts.forEach((name, i) => {
    const last = i === parts.length - 1;
    let hit = cur.kids.find((k) => k.name === name);
    if (!hit) {
      hit = reg(mk(name, !last || leafIsDir));
      cur.kids.push(hit);
    }
    cur = hit;
  });
  return cur;
}
const meta = (n: Node) => (n.dir ? { type: "Dir", name: n.name, lastModified: new Date(n.mtime) } : { type: "File", name: n.name, lastModified: new Date(n.mtime), byteLength: n.content.length, mimeType: "text/markdown" });
let torn = 0;

vi.mock("tauri-plugin-android-fs-api", () => ({
  PickerInitialLocation: {
    PublicDir: (baseDir: string, options?: Record<string, unknown>) => ({ type: "PublicDir", baseDir, ...options }),
  },
  isAndroid: () => true,
  readDir: async (u: { uri: string }) => node(u).kids.map((k) => ({ ...meta(k), uri: uri(k) })),
  createNewFile: async (b: { uri: string }, rel: string) => uri(ensurePath(node(b), rel, false)),
  createDir: async (b: { uri: string }, rel: string) => uri(ensurePath(node(b), rel, true)),
  readTextFile: async (u: { uri: string }) => node(u).content,
  writeTextFile: async (u: { uri: string }, data: string) => {
    const n = node(u);
    n.content = torn > 0 ? (torn--, data.slice(0, Math.floor(data.length / 2))) : data;
    n.mtime = tick++;
  },
  getMetadata: async (u: { uri: string }) => meta(node(u)),
  getName: async (u: { uri: string }) => node(u).name,
  removeFile: async (u: { uri: string }) => {
    const n = node(u);
    byId.delete(n.id);
    const walk = (d: Node) => { d.kids = d.kids.filter((k) => k !== n); d.kids.forEach(walk); };
    walk(tree);
  },
  removeEmptyDir: async () => {},
  renameFile: async (u: { uri: string }, name: string) => { const n = node(u); n.name = name; return uri(n); },
  showOpenDirPicker: async () => uri(tree),
  persistPickerUriPermission: async () => {},
  checkPersistedPickerUriPermission: async () => true,
}));

import { resetCaches, safFs } from "../lib/safFs";

let root: string;
const note = (name: string) => tree.kids.find((k) => k.name === name);

beforeEach(() => {
  nextId = 1; byId.clear(); torn = 0; resetCaches();
  tree = reg(mk("Atonacht", true));
  const trash = reg(mk(".trash", true));
  tree.kids.push(trash);
  root = "saf:" + JSON.stringify(uri(tree));
});

describe("a save that cannot land whole", () => {
  it("leaves the note it had, instead of a file cut in half", async () => {
    await safFs.write(root, "Plan.md", "the version on the phone\n");
    expect(note("Plan.md")!.content).toBe("the version on the phone\n");

    torn = 3; // the next three writes land half the text: the three tries writeVerified makes
    await expect(safFs.write(root, "Plan.md", "a much longer replacement written from the editor\n")).rejects.toThrow();
    expect(note("Plan.md")!.content).toBe("the version on the phone\n"); // not "a much longer re…"
  });
});

describe("throwing a note away", () => {
  it("does not delete the original when the copy in .trash could not be written whole", async () => {
    await safFs.write(root, "Plan.md", "keep me\n");
    torn = 3; // the three tries for the .trash copy all tear, then the provider recovers
    await expect(safFs.remove(root, "Plan.md")).rejects.toThrow();
    expect(note("Plan.md")).toBeTruthy(); // the note is still there
    expect(note("Plan.md")!.content).toBe("keep me\n");
  });
});

describe("two saves of one note at the same time", () => {
  it("lands them one after the other, so the last one written is the one on disk", async () => {
    await safFs.write(root, "Plan.md", "first\n");
    const order: string[] = [];
    const a = safFs.write(root, "Plan.md", "second from the editor\n").then(() => order.push("a"));
    const b = safFs.write(root, "Plan.md", "third from a checkbox\n").then(() => order.push("b"));
    await Promise.all([a, b]);
    expect(order).toEqual(["a", "b"]); // issued in this order, so they finish in it
    expect(note("Plan.md")!.content).toBe("third from a checkbox\n");
  });

  it("does not let a failed save block the next one", async () => {
    await safFs.write(root, "Plan.md", "keep me\n");
    torn = 3;
    await expect(safFs.write(root, "Plan.md", "will not land\n")).rejects.toThrow();
    await safFs.write(root, "Plan.md", "this one lands\n");
    expect(note("Plan.md")!.content).toBe("this one lands\n");
  });
});

describe("choosing the notes folder on a phone", () => {
  it("opens the picker on Documents/Atonacht, and still opens it when that spot is not there", async () => {
    const A = await import("tauri-plugin-android-fs-api");
    const seen: unknown[] = [];
    const spy = vi.spyOn(A, "showOpenDirPicker").mockImplementation(async (options?: { initialLocation?: unknown }) => {
      seen.push(options?.initialLocation ?? null);
      return uri(tree);
    });
    await safFs.pickFolder!();
    expect(seen[0]).toEqual({ type: "PublicDir", baseDir: "Documents", relativePath: "Atonacht" });

    seen.length = 0;
    spy.mockImplementationOnce(async () => {
      throw new Error("no such place");
    });
    await safFs.pickFolder!();
    expect(seen).toEqual([null]); // the retry opens wherever the system wants to start
    vi.restoreAllMocks();
  });
});
