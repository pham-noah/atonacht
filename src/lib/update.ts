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

export interface Release {
  version: string; // without the leading "v"
  url: string; // the release page
  notes: string;
  apk?: string; // the Android download, when the release has one
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

/** The latest published GitHub release: tag, page, notes and (if attached) the APK. */
export async function latestRelease(fetcher: JsonFetcher, repo = REPO): Promise<Release> {
  const r = await fetcher(`https://api.github.com/repos/${repo}/releases/latest`);
  if (r.status === 404) throw new Error("No release has been published yet.");
  if (!r.ok) throw new Error(`GitHub answered ${r.status}.`);
  const j = (await r.json()) as {
    tag_name?: string;
    html_url?: string;
    body?: string;
    assets?: { name?: string; browser_download_url?: string }[];
  };
  const apk = (j.assets ?? []).find((a) => /\.apk$/i.test(a.name ?? ""))?.browser_download_url;
  return {
    version: (j.tag_name ?? "").replace(/^v/i, ""),
    url: j.html_url ?? REPO_URL,
    notes: j.body ?? "",
    apk,
  };
}

export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "current"; version: string }
  | { kind: "available"; release: Release }
  | { kind: "failed"; message: string };

/** One check: compare this build against the latest release. Never throws — the answer is in the state. */
export async function checkForUpdate(fetcher: JsonFetcher, current = APP_VERSION): Promise<UpdateState> {
  try {
    const release = await latestRelease(fetcher);
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
