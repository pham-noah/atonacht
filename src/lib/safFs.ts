import * as A from "tauri-plugin-android-fs-api";
import type { Entry, NotesFs } from "./fs";
import { stampPath, unstampPath } from "./trash";

/**
 * Android file access through the system folder picker (Storage Access Framework).
 * The "root" is the picked folder, stored as `saf:` + JSON of its URI. Android only ever lets the app
 * see what the user picked, so no "all files" permission is needed.
 */

const PREFIX = "saf:";
export const isSafRoot = (root: string) => root.startsWith(PREFIX);
const base = (root: string): A.FsUri => {
  if (!isSafRoot(root)) throw new Error("No folder chosen yet. Choose your notes folder in Settings.");
  return JSON.parse(root.slice(PREFIX.length));
};

// path -> URI, filled by list() and by lookups. Android has no path lookup, only directory listings.
const cache = new Map<string, Map<string, A.FsUri>>();
const cacheFor = (root: string) => {
  let m = cache.get(root);
  if (!m) cache.set(root, (m = new Map()));
  return m;
};

const isNote = (name: string) => /\.md$/i.test(name);
const hidden = (name: string) => name.startsWith(".");
const parentOf = (p: string) => p.split("/").slice(0, -1).join("/");
const nameOf = (p: string) => p.split("/").pop()!;

/**
 * Lists a folder and everything under it. A folder or file the system will not let us read is skipped rather than
 * thrown: one awkward entry (a provider that fails on a subfolder, a broken shortcut) used to blank the whole app
 * because the failure took the entire refresh down with it.
 */
async function walk(dir: A.FsUri, prefix: string, uris: Map<string, A.FsUri>, out: Entry[]) {
  let items: Awaited<ReturnType<typeof A.readDir>>;
  try {
    items = await A.readDir(dir);
  } catch (e) {
    if (!prefix) throw e; // the notes folder itself must be readable; anything below it is optional
    return;
  }
  await Promise.all(
    items.map(async (it) => {
      if (hidden(it.name)) return;
      const path = prefix + it.name;
      try {
        if (it.type === "Dir") {
          uris.set(path, it.uri);
          out.push({ path, kind: "dir", mtime: 0, size: 0 });
          await walk(it.uri, path + "/", uris, out);
        } else if (isNote(it.name)) {
          uris.set(path, it.uri);
          out.push({ path, kind: "file", mtime: it.lastModified.getTime(), size: it.byteLength });
        }
      } catch {
        /* a single entry we cannot describe is left out */
      }
    }),
  );
}

/** Finds an existing entry by walking down from the root. Returns null if any part is missing. */
async function find(root: string, path: string): Promise<A.FsUri | null> {
  const known = cacheFor(root).get(path);
  if (known) return known;
  let cur = base(root);
  for (const part of path.split("/").filter(Boolean)) {
    const hit = (await A.readDir(cur)).find((e) => e.name === part);
    if (!hit) return null;
    cur = hit.uri;
  }
  cacheFor(root).set(path, cur);
  return cur;
}

async function mustFind(root: string, path: string) {
  const uri = await find(root, path);
  if (!uri) throw new Error(`Not found: ${path}`);
  return uri;
}

/**
 * Runs `op` on the note's URI. Sync apps often replace a file, which gives it a new URI, so a cached one can
 * go stale. If the operation fails, look the note up again once and retry before giving up.
 */
async function withUri<T>(root: string, path: string, op: (u: A.FsUri) => Promise<T>): Promise<T> {
  const first = await mustFind(root, path);
  try {
    return await op(first);
  } catch (e) {
    cacheFor(root).delete(path);
    const again = await find(root, path);
    if (!again) throw new Error(`Not found: ${path}`);
    if (again.uri === first.uri) throw e;
    return op(again);
  }
}

const safePath = (p: string) => {
  if (p.split("/").some((s) => s === ".." || s === "") || p.startsWith("/")) throw new Error(`Path not allowed: ${p}`);
  return p;
};

/**
 * Android can't swap a finished file into place, so a save briefly truncates the note. To keep that safe we write,
 * read the note back, and write again if it doesn't match (up to 3 tries). If it never lands, the text the note had
 * is written back, so a failed save costs an error message instead of the note.
 */
async function writeVerified(uri: A.FsUri, content: string) {
  const before = await A.readTextFile(uri).catch(() => null); // what the note says now, to put back if the write never lands
  for (let i = 0; i < 3; i++) {
    await A.writeTextFile(uri, content);
    if ((await A.readTextFile(uri)) === content) return;
  }
  if (before !== null && before !== content) await A.writeTextFile(uri, before).catch(() => {});
  throw new Error("The note didn’t save correctly. Nothing was lost on the other devices. Try again.");
}

async function writeNew(root: string, path: string, content: string): Promise<A.FsUri> {
  const uri = await A.createNewFile(base(root), path, null); // also creates missing parent folders
  await writeVerified(uri, content);
  cacheFor(root).set(path, uri);
  return uri;
}

/**
 * Android writes a note in place, so two saves of the same note must not run at the same time: they would interleave
 * inside one file. Operations on one path queue up instead; a failure hands the queue its turn back.
 */
const queues = new Map<string, Promise<unknown>>();
function serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const start = queues.get(key) ?? Promise.resolve();
  const run = start.then(fn, fn);
  queues.set(key, run.then(() => {}, () => {}));
  return run;
}

export const safFs: NotesFs = {
  native: true,
  pollMs: 8000, // listing through Android's document provider is slower than reading a plain folder

  defaultRoot: async () => "",

  async ensureRoot(root) {
    const uri = base(root);
    const ok = await A.checkPersistedPickerUriPermission(uri, "ReadAndWrite").catch(() => false);
    if (!ok) throw new Error("Atonacht lost access to the notes folder. Choose the folder again in Settings.");
  },

  async list(root) {
    const uris = new Map<string, A.FsUri>();
    const out: Entry[] = [];
    await walk(base(root), "", uris, out);
    cache.set(root, uris);
    return out.sort((a, b) => a.path.localeCompare(b.path));
  },

  async read(root, path) {
    return withUri(root, safePath(path), (u) => A.readTextFile(u));
  },

  write(root, path, content) {
    return serial(`${root}|${path}`, async () => {
      safePath(path);
      if (!isNote(path)) throw new Error("Only .md notes can be written");
      const exists = await find(root, path).catch(() => null);
      if (!exists) {
        const created = await writeNew(root, path, content);
        return (await A.getMetadata(created)).lastModified.getTime();
      }
      return withUri(root, path, async (u) => {
        await writeVerified(u, content);
        return (await A.getMetadata(u)).lastModified.getTime();
      });
    });
  },

  async mkdir(root, path) {
    await A.createDir(base(root), safePath(path));
  },

  /** Moves into .trash/ (copy, then remove): Android has no move across folders. */
  remove(root, path) {
    return serial(`${root}|${path}`, async () => {
      const text = await withUri(root, safePath(path), (u) => A.readTextFile(u));
      // The copy in .trash is written and read back before the original goes, so a failed copy never costs the note.
      const dest = await A.createNewFile(base(root), `.trash/${stampPath(path, Math.floor(Date.now() / 1000))}`, null);
      try {
        await writeVerified(dest, text);
      } catch (e) {
        await A.removeFile(dest).catch(() => {}); // don't leave half a note in the trash
        throw e;
      }
      await withUri(root, path, (u) => A.removeFile(u));
      cacheFor(root).delete(path);
    });
  },

  async removeDir(root, path) {
    const uri = await mustFind(root, safePath(path));
    await A.removeEmptyDir(uri); // fails if the folder still has anything in it
    cacheFor(root).delete(path);
  },

  async listTrash(root) {
    const trash = await find(root, ".trash");
    if (!trash) return [];
    const out: Entry[] = [];
    await walk(trash, "", new Map(), out);
    return out.filter((e) => e.kind === "file").sort((a, b) => a.path.localeCompare(b.path));
  },

  async restore(root, trashPath) {
    safePath(trashPath);
    const text = await withUri(root, `.trash/${trashPath}`, (u) => A.readTextFile(u));
    let rel = unstampPath(trashPath).path;
    if (await find(root, rel)) rel = rel.replace(/(\.[^./]+)?$/, " (restored)$1");
    await writeNew(root, rel, text);
    await withUri(root, `.trash/${trashPath}`, (u) => A.removeFile(u));
    cacheFor(root).delete(`.trash/${trashPath}`);
    return rel;
  },

  async purge(root, trashPath) {
    safePath(trashPath);
    await withUri(root, `.trash/${trashPath}`, (u) => A.removeFile(u));
    cacheFor(root).delete(`.trash/${trashPath}`);
  },

  rename(root, from, to) {
    return serial(`${root}|${from}`, async () => {
      safePath(from);
      safePath(to);
      if (await find(root, to)) throw new Error(`${to} already exists`);
      if (parentOf(from) === parentOf(to)) {
        const uri = await withUri(root, from, (u) => A.renameFile(u, nameOf(to)));
        cacheFor(root).delete(from);
        cacheFor(root).set(to, uri);
        return;
      }
      await writeNew(root, to, await withUri(root, from, (u) => A.readTextFile(u)));
      await withUri(root, from, (u) => A.removeFile(u));
      cacheFor(root).delete(from);
    });
  },

  async pickFolder() {
    // On a phone the notes belong in Documents/Atonacht, where Syncthing (or any sync app) can find them. The system
    // picker opens there and the user confirms it - or picks any other folder, which is what used to happen.
    const options = (initial?: { initialLocation: A.PickerInitialLocation }) =>
      ({ localOnly: true, ...initial }) as Parameters<typeof A.showOpenDirPicker>[0];
    let uri: A.FsUri | null;
    try {
      uri = await A.showOpenDirPicker(options({ initialLocation: A.PickerInitialLocation.PublicDir("Documents", { relativePath: "Atonacht" }) }));
    } catch {
      // a device with no Documents folder, or a picker that cannot start there: open where the system wants
      uri = await A.showOpenDirPicker(options());
    }
    if (!uri) return null;
    await A.persistPickerUriPermission(uri); // keep access after the app restarts
    return PREFIX + JSON.stringify(uri);
  },

  async describeRoot(root) {
    if (!isSafRoot(root)) return root;
    return A.getName(base(root)).catch(() => "Chosen folder");
  },
};

/** For tests: forget every cached URI. */
export const resetCaches = () => cache.clear();
