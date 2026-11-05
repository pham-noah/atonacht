export interface Entry {
  path: string; // relative to the notes root, always "/" separated
  kind: "file" | "dir";
  mtime: number; // ms since epoch
  size: number;
}

/**
 * How many notes sit in each folder (and in its subfolders), in one pass over the paths. The sidebar used to walk
 * every note once per folder, which is O(folders × notes) on each render of a big folder.
 */
export function folderCounts(paths: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of paths) {
    for (let i = p.indexOf("/"); i > 0; i = p.indexOf("/", i + 1)) {
      const dir = p.slice(0, i);
      counts.set(dir, (counts.get(dir) ?? 0) + 1);
    }
  }
  return counts;
}

/** Everything the app needs from the file system. Implemented by Tauri (real files) and memory (browser demo). */
export interface NotesFs {
  native: boolean;
  defaultRoot(): Promise<string>;
  ensureRoot(root: string): Promise<void>;
  list(root: string): Promise<Entry[]>; // .md files and folders, hidden items skipped
  read(root: string, path: string): Promise<string>;
  write(root: string, path: string, content: string): Promise<number>; // returns new mtime
  mkdir(root: string, path: string): Promise<void>;
  remove(root: string, path: string): Promise<void>; // moves to .trash
  rename(root: string, from: string, to: string): Promise<void>;
  removeDir(root: string, path: string): Promise<void>; // only if empty
  listTrash(root: string): Promise<Entry[]>; // paths relative to the trash folder
  restore(root: string, trashPath: string): Promise<string>; // returns the restored path
  purge(root: string, trashPath: string): Promise<void>; // delete for good
  /** Native folder picker (desktop dialog, or Android's system folder picker). Returns a root string, or null if cancelled. */
  pickFolder?(): Promise<string | null>;
  /** Human-readable name for a root, e.g. the folder name for an Android content URI. */
  describeRoot?(root: string): Promise<string>;
  /** Called when notes change on disk (desktop file watcher). Returns a function that stops watching. */
  watch?(root: string, onChange: () => void): Promise<() => void>;
  /** How often to look for changes made by a sync app. */
  pollMs?: number;
}
