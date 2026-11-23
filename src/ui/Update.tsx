import { useEffect, useRef, useState } from "react";
import { isTauri } from "../lib/backend";
import { isAndroidApp, isMobileApp } from "../lib/platform";
import { APP_VERSION, JsonFetcher, Release, UpdateState, checkForUpdate, formatBytes, openExternal } from "../lib/update";
import { ApkTools, DownloadProgress, nativeApkTools } from "../lib/apkUpdate";
import { renderMarkdown } from "../lib/markdown";
import { BackBar, PageHead } from "./common";

const platformName = () => (isAndroidApp() ? "Android" : isMobileApp() ? "iOS" : isTauri() ? "Desktop" : "Browser demo");

async function githubFetcher(): Promise<JsonFetcher> {
  if (isTauri()) {
    // https to the GitHub API is inside the plugin scope; Syncthing goes through Rust instead (see syncthingFetch.ts)
    const { fetch } = await import("@tauri-apps/plugin-http");
    return ((url: string) => fetch(url, { headers: { Accept: "application/vnd.github+json" } })) as unknown as JsonFetcher;
  }
  return ((url: string) => window.fetch(url, { headers: { Accept: "application/vnd.github+json" } })) as JsonFetcher;
}

/** The download's own state: the card above answers "is there one", this answers "where is it now". */
type Download =
  | { kind: "idle" }
  | { kind: "downloading"; done: number; total: number }
  | { kind: "ready"; path: string }
  | { kind: "failed"; message: string };

/**
 * Checking for updates is its own screen, not a row in About.
 *
 * There is a question ("is there a newer version?"), an answer worth reading (what changed), and a decision (download
 * it or not) — that is a page, not two buttons squeezed into a settings row. It also means the check can start when the
 * screen opens, instead of waiting for someone to find the button.
 *
 * On the phone the decision is one press: the APK is fetched inside the app, a bar moves, and then Android's own
 * installer takes over (`src-tauri/src/updater.rs`). Handing the URL to a browser — what this screen used to do —
 * leaves the file somewhere in Downloads and installs nothing.
 */
export function Update({ fetcher, tools = nativeApkTools }: { fetcher?: () => Promise<JsonFetcher>; tools?: ApkTools } = {}) {
  const [state, setState] = useState<UpdateState>({ kind: "checking" });
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [dl, setDl] = useState<Download>({ kind: "idle" });
  const ran = useRef(false);
  const android = isAndroidApp();

  const check = async () => {
    setState({ kind: "checking" });
    setCheckedAt(null);
    setDl({ kind: "idle" });
    try {
      const f = await (fetcher ?? githubFetcher)();
      // The ABI decides which APK the release offers, and only the running build can say what it is.
      setState(await checkForUpdate(f, APP_VERSION, android ? await tools.arch() : undefined));
    } catch (e) {
      setState({ kind: "failed", message: e instanceof Error ? e.message : String(e) });
    }
    setCheckedAt(new Date());
  };

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void check();
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const checking = state.kind === "checking";
  const release: Release | null = state.kind === "available" ? state.release : null;

  const startDownload = async () => {
    if (!release?.apk) return;
    const url = release.apk;
    const name = release.apkName ?? "Atonacht.apk";
    const size = release.apkSize ?? 0;
    setDl({ kind: "downloading", done: 0, total: size });
    // The bar follows the bytes; a length the server did not state falls back to the size on the release.
    const moved = (p: DownloadProgress) => setDl({ kind: "downloading", done: p.done, total: p.total || size });
    try {
      setDl({ kind: "ready", path: await tools.download(url, name, size, moved) });
    } catch (e) {
      setDl({ kind: "failed", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const install = async () => {
    if (dl.kind !== "ready") return;
    try {
      await tools.install(dl.path);
    } catch (e) {
      setDl({ kind: "failed", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const total = dl.kind === "downloading" ? dl.total : 0;
  const pct = dl.kind === "downloading" && total > 0 ? Math.min(100, Math.round((dl.done / total) * 100)) : 0;

  return (
    <div className="updater">
      <BackBar label="About" />
      <PageHead title="Update" sub={`Atonacht ${APP_VERSION} · ${platformName()}`} />

      <section className="card stack up-head">
        <div className="up-row">
          <div className="grow">
            <div className="up-label">This build</div>
            <div className="up-version">{APP_VERSION}</div>
          </div>
          <div className="up-arrow" aria-hidden="true">→</div>
          <div className="grow up-right">
            <div className="up-label">Latest release</div>
            <div className="up-version">
              {release ? release.version
                : state.kind === "current" ? APP_VERSION
                : checking ? "…"
                : "—"}
            </div>
          </div>
        </div>
        <div className="up-state">
          {checking && <span className="chip">Asking GitHub…</span>}
          {state.kind === "current" && <span className="chip hi">You are on the latest version</span>}
          {release && <span className="chip on">A newer version is available</span>}
          {state.kind === "failed" && <span className="chip warn">Could not check</span>}
        </div>
        {state.kind === "failed" && <p className="errtext">{state.message}</p>}
        <div className="btnrow start">
          <button className="pill" onClick={check} disabled={checking || dl.kind === "downloading"}>{checking ? "Checking…" : "Check again"}</button>
          {checkedAt && <span className="muted small">Checked {checkedAt.toLocaleTimeString()}</span>}
        </div>
      </section>

      {release && (
        <>
          <div className="cap">What’s new in {release.version}</div>
          <section className="card up-notes">
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(release.notes) }} />
          </section>
          {android ? (
            <section className="up-do">
              {dl.kind === "downloading" ? (
                // The bar is the state: no caption repeating over it what the bar already says.
                <div
                  className="up-bar"
                  role="progressbar"
                  aria-label="Downloading the update"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct}
                >
                  <span className="up-bar-fill" style={{ width: `${pct}%` }} />
                  <span className="up-bar-text">
                    {formatBytes(dl.done)} of {formatBytes(total)} · {pct}%
                  </span>
                </div>
              ) : dl.kind === "ready" ? (
                <button className="btn big" onClick={install}>Install update</button>
              ) : (
                <button className="btn big" onClick={startDownload}>Download and install</button>
              )}

              {dl.kind === "failed" && (
                <p className="errtext">
                  {dl.message}{" "}
                  <button className="pill" onClick={startDownload}>Try again</button>
                </p>
              )}

              <p className="muted small">
                {dl.kind === "ready"
                  ? "Android opens its own installer. Allow “install unknown apps” for Atonacht once if it asks — the APK is signed with the same key as the one you have, so it installs over it and your notes and folder stay."
                  : dl.kind === "downloading"
                    ? "Keep the app open until the bar finishes; the installer takes over from there."
                    : `${formatBytes(release.apkSize ?? 0)} · the app downloads it, then Android installs it. Your notes and folder setting are left alone.`}
              </p>
              <button className="pill" onClick={() => openExternal(release.url)}>Release page</button>
            </section>
          ) : (
            <div className="btnrow up-actions">
              {/* A computer cannot install an APK, and the installers are not interchangeable either: the release
                  page is the one honest link for Windows, macOS and Linux. */}
              <button className="btn" onClick={() => openExternal(release.url)}>Open the release page</button>
            </div>
          )}
        </>
      )}

      {state.kind === "current" && (
        <p className="muted small">
          Nothing to install. New versions appear at github.com/pham-noah/atonacht when they are published.
        </p>
      )}
    </div>
  );
}
