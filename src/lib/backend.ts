import type { NotesFs } from "./fs";
import { tauriFs } from "./tauriFs";
import { createMemFs } from "./memFs";
import { isAndroid } from "tauri-plugin-android-fs-api";
import { safFs } from "./safFs";

export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
/** Real files on desktop, folder-picker (SAF) access on Android, and an in-browser demo when you run `npm run dev` in a normal browser. */
export const fs: NotesFs = isTauri() ? (isAndroid() ? safFs : tauriFs) : createMemFs(undefined, true);
