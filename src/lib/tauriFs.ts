import { invoke } from "@tauri-apps/api/core";
import type { NotesFs } from "./fs";

export const tauriFs: NotesFs = {
  native: true,
  defaultRoot: () => invoke("default_root"),
  ensureRoot: (root) => invoke("ensure_root", { root }),
  list: (root) => invoke("list_entries", { root }),
  read: (root, path) => invoke("read_note", { root, path }),
  write: (root, path, content) => invoke("write_note", { root, path, content }),
  mkdir: (root, path) => invoke("make_dir", { root, path }),
  remove: (root, path) => invoke("trash_note", { root, path }),
  rename: (root, from, to) => invoke("rename_note", { root, from, to }),
  removeDir: (root, path) => invoke("remove_dir", { root, path }),
  listTrash: (root) => invoke("list_trash", { root }),
  restore: (root, path) => invoke("restore_note", { root, path }),
  purge: (root, path) => invoke("purge_note", { root, path }),
  pollMs: 30_000, // the watcher does the real work; polling is only a safety net
  watch: async (root, onChange) => {
    const { listen } = await import("@tauri-apps/api/event");
    const stop = await listen("notes-changed", () => onChange());
    await invoke("watch_notes", { root });
    return () => {
      stop();
      invoke("unwatch_notes").catch(() => {});
    };
  },
  pickFolder: async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const dir = await open({ directory: true, multiple: false, title: "Choose your notes folder" });
    return typeof dir === "string" ? dir : null;
  },
};
