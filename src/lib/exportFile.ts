import { isAndroid } from "tauri-plugin-android-fs-api";
import { isTauri } from "./backend";

/** Saves a file the user can keep: browser download, Android "save as", or a desktop save dialog. Returns false if cancelled. */
export async function saveBytes(name: string, bytes: Uint8Array, mime = "application/zip"): Promise<boolean> {
  if (!isTauri()) {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }
  if (isAndroid()) {
    const A = await import("tauri-plugin-android-fs-api");
    const uri = await A.showSaveFilePicker(name, mime);
    if (!uri) return false;
    await A.writeFile(uri, bytes);
    return true;
  }
  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({ defaultPath: name, filters: [{ name: "ZIP archive", extensions: ["zip"] }] });
  if (!path) return false;
  const { writeFile } = await import("@tauri-apps/plugin-fs");
  await writeFile(path, bytes);
  return true;
}
