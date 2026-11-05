import { useEffect, useRef, useState } from "react";
import { isTauri } from "../lib/backend";
import { isAndroidApp, isMobileApp } from "../lib/platform";
import { APP_VERSION, JsonFetcher, Release, UpdateState, checkForUpdate, openExternal } from "../lib/update";
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

/**
 * Checking for updates is its own screen, not a row in About.
 *
 * There is a question ("is there a newer version?"), an answer worth reading (what changed), and a decision (download
 * it or not) — that is a page, not two buttons squeezed into a settings row. It also means the check can start when the
 * screen opens, instead of waiting for someone to find the button.
 */
export function Update({ fetcher }: { fetcher?: () => Promise<JsonFetcher> } = {}) {
  const [state, setState] = useState<UpdateState>({ kind: "checking" });
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const ran = useRef(false);

  const check = async () => {
    setState({ kind: "checking" });
    setCheckedAt(null);
    try {
      const f = await (fetcher ?? githubFetcher)();
      setState(await checkForUpdate(f));
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
          <button className="pill" onClick={check} disabled={checking}>{checking ? "Checking…" : "Check again"}</button>
          {checkedAt && <span className="muted small">Checked {checkedAt.toLocaleTimeString()}</span>}
        </div>
      </section>

      {release && (
        <>
          <div className="cap">What’s new in {release.version}</div>
          <section className="card up-notes">
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(release.notes) }} />
          </section>
          <div className="btnrow up-actions">
            {release.apk
              ? <button className="btn" onClick={() => openExternal(release.apk!)}>Download the APK</button>
              : <button className="btn" onClick={() => openExternal(release.url)}>Open the release</button>}
            <button className="pill" onClick={() => openExternal(release.url)}>Release page</button>
          </div>
          {release.apk && <p className="muted small">Installing over an older Atonacht keeps your notes and your folder setting.</p>}
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
