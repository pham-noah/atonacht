import { invoke } from "@tauri-apps/api/core";
import type { NotesFs } from "./fs";

export const tauriFs: NotesFs = {
  native: true,
  defaultRoot: () => invoke("default_root"),
  ensureRoot: (root) => invoke("ensure_root", { root }),
  list: (root) => invoke("list_entries", { root }),
  read: (root, path) => invoke("read_note", { root, path }),
  write: (root, path, content) => invoke("write_note", { root, path, content }),
  writeBytes: async (root, path, data) => {
    await invoke("write_attachment", { root, path, base64: toBase64(data) });
  },
  readBytes: async (root, path) => fromBase64((await invoke<string>("read_attachment", { root, path })) ?? ""),
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

/** Chunked so a large image does not blow the argument limit of String.fromCharCode. */
function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

function fromBase64(text: string): Uint8Array {
  const raw = atob(text.replace(/\s/g, ""));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
