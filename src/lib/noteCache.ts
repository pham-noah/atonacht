export interface CachedNote {
  content: string;
  mtime: number;
  size: number;
}

/** A copy of every note kept in the app's own storage, so the next start can show notes at once and read only what changed. */
export interface NoteCache {
  load(root: string): Promise<Record<string, CachedNote>>;
  put(root: string, notes: Record<string, CachedNote>): Promise<void>;
  remove(root: string, paths: string[]): Promise<void>;
  clear(root?: string): Promise<void>;
}

const DB = "atonacht-cache-v1";
const STORE = "notes";
const SEP = "\u0000";

const done = (tx: IDBTransaction) =>
  new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });

/** IndexedDB-backed cache. Where IndexedDB isn't available it quietly does nothing, and the app just reads every note as before. */
export function createIdbCache(factory: IDBFactory | null = (globalThis as { indexedDB?: IDBFactory }).indexedDB ?? null): NoteCache {
  if (!factory) return { load: async () => ({}), put: async () => {}, remove: async () => {}, clear: async () => {} };
  let opened: Promise<IDBDatabase> | undefined;
  const open = () =>
    (opened ??= new Promise<IDBDatabase>((res, rej) => {
      const req = factory.open(DB, 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: "key" });
        store.createIndex("root", "root");
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => {
        opened = undefined; // a failed open must not be remembered: the next call tries again instead of giving up for the session
        rej(req.error);
      };
    }));

  return {
    async load(root) {
      const db = await open();
      const out: Record<string, CachedNote> = {};
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).index("root").openCursor(IDBKeyRange.only(root));
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return;
        const v = c.value as { path: string } & CachedNote;
        out[v.path] = { content: v.content, mtime: v.mtime, size: v.size };
        c.continue();
      };
      await done(tx);
      return out;
    },
    async put(root, notes) {
      const entries = Object.entries(notes);
      if (!entries.length) return;
      const db = await open();
      const tx = db.transaction(STORE, "readwrite");
      const s = tx.objectStore(STORE);
      for (const [path, n] of entries) s.put({ key: root + SEP + path, root, path, ...n });
      await done(tx);
    },
    async remove(root, paths) {
      if (!paths.length) return;
      const db = await open();
      const tx = db.transaction(STORE, "readwrite");
      for (const p of paths) tx.objectStore(STORE).delete(root + SEP + p);
      await done(tx);
    },
    async clear(root) {
      const db = await open();
      const tx = db.transaction(STORE, "readwrite");
      const s = tx.objectStore(STORE);
      if (root === undefined) s.clear();
      else {
        const req = s.index("root").openKeyCursor(IDBKeyRange.only(root));
        req.onsuccess = () => {
          const c = req.result;
          if (!c) return;
          s.delete(c.primaryKey);
          c.continue();
        };
      }
      await done(tx);
    },
  };
}

export const noteCache: NoteCache = createIdbCache();
