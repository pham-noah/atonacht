export interface NoteVersion {
  /** When this text stopped being the note's text, in ms. */
  at: number;
  content: string;
}

/**
 * The last few versions of every note, kept in the app's own storage.
 *
 * GitHub has the history only when a repository and token are set up, and the Android file layer truncates a note
 * before it writes. This is the local answer to both: every save that changes a note keeps the text it replaced, so a
 * bad write or an outside editor can be undone from History with nothing configured.
 */
export interface NoteHistory {
  /** Newest first. */
  list(root: string, path: string): Promise<NoteVersion[]>;
  /** Keeps `content` as a version of the note. A repeat of the newest version is not stored twice. */
  record(root: string, path: string, content: string): Promise<void>;
  /** Forgets the versions of one folder, or of every folder when `root` is left out. */
  clear(root?: string): Promise<void>;
}

/** How many versions of a note are worth keeping: enough to undo a bad afternoon, few enough to prune for free. */
export const MAX_VERSIONS = 5;
/** Notes bigger than this keep no versions: an attachment-heavy note would fill the app's storage by itself. */
export const MAX_VERSION_BYTES = 200_000;

const DB = "atonacht-history-v1";
const STORE = "versions";
const SEP = "\u0000";

interface Row {
  key: string;
  root: string;
  path: string;
  pathKey: string;
  at: number;
  seq: number;
  content: string;
}

/** Oldest first: by time, and by a per-note counter for saves that land inside the same millisecond. */
const byAge = (a: Row, b: Row) => a.at - b.at || a.seq - b.seq;

const done = (tx: IDBTransaction) =>
  new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });

const bytes = (s: string) => new TextEncoder().encode(s).length;

/** IndexedDB-backed version history. Where IndexedDB isn't available it quietly does nothing and History shows only GitHub. */
export function createIdbHistory(factory: IDBFactory | null = (globalThis as { indexedDB?: IDBFactory }).indexedDB ?? null): NoteHistory {
  if (!factory) return { list: async () => [], record: async () => {}, clear: async () => {} };
  let opened: Promise<IDBDatabase> | undefined;
  const open = () =>
    (opened ??= new Promise<IDBDatabase>((res, rej) => {
      const req = factory.open(DB, 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: "key" });
        store.createIndex("pathKey", "pathKey");
        store.createIndex("root", "root");
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => {
        opened = undefined; // a failed open must not be remembered: the next save tries again instead of giving up
        rej(req.error);
      };
    }));

  const all = async (root: string, path: string): Promise<Row[]> => {
    const db = await open();
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).index("pathKey").getAll(IDBKeyRange.only(root + SEP + path));
    await done(tx);
    return (req.result as Row[]).sort(byAge);
  };

  return {
    async list(root, path) {
      if (!root) return [];
      return (await all(root, path)).reverse().map((v) => ({ at: v.at, content: v.content }));
    },
    async record(root, path, content) {
      if (!root || !content || bytes(content) > MAX_VERSION_BYTES) return;
      const db = await open();
      const pathKey = root + SEP + path;
      const tx = db.transaction(STORE, "readwrite");
      const s = tx.objectStore(STORE);
      const req = s.index("pathKey").getAll(IDBKeyRange.only(pathKey));
      req.onsuccess = () => {
        const rows = (req.result as Row[]).sort(byAge);
        if (rows[rows.length - 1]?.content === content) return; // the same text is already the newest version
        const at = Date.now();
        const seq = (rows[rows.length - 1]?.seq ?? 0) + 1;
        // A suffix keeps two saves inside the same millisecond apart, so neither overwrites the other.
        const key = `${pathKey}${SEP}${at}${SEP}${Math.random().toString(36).slice(2, 7)}`;
        s.put({ key, root, path, pathKey, at, seq, content } as Row);
        for (const old of rows.slice(0, Math.max(0, rows.length + 1 - MAX_VERSIONS))) s.delete(old.key);
      };
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

export const noteHistory: NoteHistory = createIdbHistory();
