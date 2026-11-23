/**
 * The native half of an in-app update on a phone: fetch the APK inside the app, then hand it to Android's own
 * installer.
 *
 * The download runs in Rust (src-tauri/src/updater.rs) for two reasons: the APK lives on `github.com`, which is
 * outside the `http` plugin's `api.github.com` scope, and the file has to land in the app's cache dir — the one
 * directory the manifest's FileProvider exposes — which only the native side can name. Nothing here installs
 * anything: Android shows its normal "do you want to update" prompt, and it will only accept an APK signed with the
 * same key.
 */

import { invoke } from "@tauri-apps/api/core";

export interface DownloadProgress {
  done: number;
  total: number;
}

/**
 * The architecture of this build, which decides which APK the update fetches. Empty outside the app (and outside
 * Android), where there is nothing to install anyway.
 */
export async function deviceArch(): Promise<string> {
  try {
    return (await invoke<string>("device_arch")) || "";
  } catch {
    return "";
  }
}

/**
 * Downloads the APK and returns where it landed. A download that does not arrive whole is deleted by the Rust side
 * and thrown here, so "Install" can never point at a truncated file.
 */
export async function downloadUpdate(
  url: string,
  name: string,
  size: number,
  onProgress: (p: DownloadProgress) => void,
): Promise<string> {
  const { listen } = await import("@tauri-apps/api/event");
  const stop = await listen<DownloadProgress>("update-progress", (e) => onProgress(e.payload));
  try {
    return await invoke<string>("update_download", { url, name, size });
  } finally {
    stop();
  }
}

/** Opens Android's package installer on the file `downloadUpdate` returned. */
export async function installUpdate(path: string): Promise<void> {
  await invoke("update_install", { path });
}

/** Everything the update screen needs from the native side, in one object so a test can hand over a fake. */
export interface ApkTools {
  arch(): Promise<string>;
  download: typeof downloadUpdate;
  install: typeof installUpdate;
}

export const nativeApkTools: ApkTools = { arch: deviceArch, download: downloadUpdate, install: installUpdate };
