/** Where the app lives, what version this build is, and the GitHub release check behind Settings → About. */

import { isTauri } from "./backend";

export const REPO = "pham-noah/atonacht";
export const REPO_URL = `https://github.com/${REPO}`;
export const ISSUES_URL = `${REPO_URL}/issues/new`;
export const AUTHOR_URL = "https://github.com/pham-noah";
export const APP_VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.1.0";

export type JsonFetcher = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Third-party code in the app, for Settings → About → Licences. Dev-only packages are left out. */
export const LICENSES: [string, string][] = [
  ["React and React DOM", "MIT"],
  ["CodeMirror 6 and Lezer", "MIT"],
  ["Tauri and its plugins", "MIT or Apache-2.0"],
  ["fflate", "MIT"],
  ["Inter", "SIL Open Font License 1.1"],
  ["Fraunces", "SIL Open Font License 1.1"],
];

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number; // bytes, as GitHub reports it
}

export interface Release {
  version: string; // without the leading "v"
  url: string; // the release page
  notes: string;
  assets: ReleaseAsset[]; // every file on the release, APKs included
  apk?: string; // the Android download that fits this device, when the release has one
  apkName?: string; // its file name, which carries the ABI
  apkSize?: number; // bytes, so a download can be checked for arriving whole
}

/** The ABIs a release names in its file names, longest first: `arm64` contains `arm`, and `x86_64` contains `x86`. */
const ABIS = ["arm64", "x86_64", "arm", "x86"] as const;
export type Abi = (typeof ABIS)[number];

/** `aarch64`, `armv7`, `x86_64` — what Rust's `std::env::consts::ARCH` says — in the words the asset names use. */
export function abiOf(arch: string): Abi | undefined {
  const a = arch.toLowerCase();
  if (/aarch64|arm64|armv8/.test(a)) return "arm64";
  if (/x86_64|x64|amd64/.test(a)) return "x86_64";
  if (/^arm/.test(a)) return "arm";
  if (/^x86|i686|i386/.test(a)) return "x86";
  return undefined;
}

/** The ABI an asset name advertises: `Atonacht-v0.3.1-arm64.apk` → `arm64`. */
export function assetAbi(name: string): Abi | undefined {
  const n = name.toLowerCase();
  return ABIS.find((abi) => n.includes(abi));
}

/**
 * The APK to fetch for this device.
 *
 * A release carries one per ABI and they are not interchangeable: the 32-bit ARM build will not install on a
 * 64-bit-only phone, and the x86 builds are for emulators. Taking whichever APK GitHub listed first handed a modern
 * phone `…-arm.apk` — which is exactly what this function exists to stop. With no known architecture (the browser
 * demo) arm64 is the right guess, because that is what Android phones have been for years.
 */
export function chooseApk(assets: ReleaseAsset[], arch?: string): ReleaseAsset | undefined {
  const apks = assets.filter((a) => /\.apk$/i.test(a.name));
  if (!apks.length) return undefined;
  const want = arch ? abiOf(arch) : undefined;
  return (want && apks.find((a) => assetAbi(a.name) === want)) || apks.find((a) => assetAbi(a.name) === "arm64") || apks[0];
}

/** `21304247` → `20.3 MB`: the number a download badge needs. */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "0 MB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** "1.2.3" or "v1.2.3" → [1, 2, 3]; anything unreadable sorts as 0.0.0. */
export function parseVersion(v: string): number[] {
  const m = /(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(v.trim().replace(/^v/i, ""));
  return m ? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)] : [0, 0, 0];
}

/** True when `a` is a later version than `b`. */
export function isNewer(a: string, b: string): boolean {
  const [x, y] = [parseVersion(a), parseVersion(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

/**
 * The latest published GitHub release: tag, page, notes and the APK that fits this device.
 *
 * `arch` is the running build's architecture (`aarch64` on a modern phone, `x86_64` on an emulator). It comes from
 * Rust rather than from `navigator`, because the user agent says "Android" and nothing about the ABI.
 */
export async function latestRelease(fetcher: JsonFetcher, repo = REPO, arch?: string): Promise<Release> {
  const r = await fetcher(`https://api.github.com/repos/${repo}/releases/latest`);
  if (r.status === 404) throw new Error("No release has been published yet.");
  if (!r.ok) throw new Error(`GitHub answered ${r.status}.`);
  const j = (await r.json()) as {
    tag_name?: string;
    html_url?: string;
    body?: string;
    assets?: { name?: string; browser_download_url?: string; size?: number }[];
  };
  const assets: ReleaseAsset[] = (j.assets ?? [])
    .map((a) => ({ name: a.name ?? "", url: a.browser_download_url ?? "", size: a.size ?? 0 }))
    .filter((a) => a.url !== "");
  const apk = chooseApk(assets, arch);
  return {
    version: (j.tag_name ?? "").replace(/^v/i, ""),
    url: j.html_url ?? REPO_URL,
    notes: j.body ?? "",
    assets,
    apk: apk?.url,
    apkName: apk?.name,
    apkSize: apk?.size,
  };
}


export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "current"; version: string }
  | { kind: "available"; release: Release }
  | { kind: "failed"; message: string };

/** One check: compare this build against the latest release. Never throws — the answer is in the state. */
export async function checkForUpdate(fetcher: JsonFetcher, current = APP_VERSION, arch?: string): Promise<UpdateState> {
  try {
    const release = await latestRelease(fetcher, REPO, arch);
    if (!release.version) return { kind: "failed", message: "The latest release has no version number." };
    return isNewer(release.version, current) ? { kind: "available", release } : { kind: "current", version: current };
  } catch (e) {
    return { kind: "failed", message: e instanceof Error ? e.message : String(e) };
  }
}

/** The bug report link, with the version and platform already in it so a report is never missing them. */
export function issueUrl(platform: string, version = APP_VERSION): string {
  const body = `What happened:\n\n\nWhat I expected:\n\n\nSteps:\n1. \n\n---\nAtonacht ${version} · ${platform}`;
  return `${ISSUES_URL}?labels=bug&body=${encodeURIComponent(body)}`;
}

/** Opens a link outside the app on desktop and phone, in a new tab in the browser demo. */
export async function openExternal(url: string) {
  if (typeof window === "undefined") return;
  if (isTauri()) {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
      return;
    } catch {
      // fall through to the browser path below
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
