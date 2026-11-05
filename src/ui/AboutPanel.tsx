import { useState } from "react";
import { isTauri } from "../lib/backend";
import { isAndroidApp, isMobileApp } from "../lib/platform";
import { APP_VERSION, JsonFetcher, LICENSES, REPO_URL, AUTHOR_URL, UpdateState, checkForUpdate, issueUrl, openExternal } from "../lib/update";
import { Group, Row } from "./SettingsParts";

const platformName = () => (isAndroidApp() ? "Android" : isMobileApp() ? "iOS" : isTauri() ? "Desktop" : "Browser demo");

async function githubFetcher(): Promise<JsonFetcher> {
  if (isTauri()) {
    const { fetch } = await import("@tauri-apps/plugin-http");
    return ((url: string) => fetch(url, { headers: { Accept: "application/vnd.github+json" } })) as unknown as JsonFetcher;
  }
  return ((url: string) => window.fetch(url, { headers: { Accept: "application/vnd.github+json" } })) as JsonFetcher;
}

export function AboutPanel({ fetcher }: { fetcher?: () => Promise<JsonFetcher> } = {}) {
  const [state, setState] = useState<UpdateState>({ kind: "idle" });
  const [licences, setLicences] = useState(false);
  const platform = platformName();

  const check = async () => {
    setState({ kind: "checking" });
    try {
      const f = await (fetcher ?? githubFetcher)();
      setState(await checkForUpdate(f));
    } catch (e) {
      setState({ kind: "failed", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const answer =
    state.kind === "checking" ? "Checking…"
    : state.kind === "current" ? "You are on the latest version."
    : state.kind === "failed" ? `Could not check: ${state.message}`
    : state.kind === "available" ? `Version ${state.release.version} is available.`
    : "Atonacht asks GitHub for its latest release.";

  return (
    <>
      <Group title="Version">
        <Row label={`Atonacht ${APP_VERSION}`} hint={platform} />
        <Row label="Check for updates" hint={answer}>
          <span className="rowbtns">
            <button className="btn" onClick={check} disabled={state.kind === "checking"}>{state.kind === "checking" ? "Checking…" : "Check now"}</button>
          </span>
          {state.kind === "available" && (
            <span className="rowbtns">
              <button className="pill" onClick={() => openExternal(state.release.url)}>Release notes</button>
              {state.release.apk && <button className="pill on" onClick={() => openExternal(state.release.apk!)}>Download APK</button>}
            </span>
          )}
        </Row>
      </Group>
      <Group title="About">
        <Row label="Made by Pham-Noah" hint="github.com/pham-noah">
          <button className="ib" aria-label="Open Pham-Noah on GitHub" onClick={() => openExternal(AUTHOR_URL)}>↗</button>
        </Row>
        <Row label="Atonacht on GitHub" hint="Source code, issues and releases">
          <button className="ib" aria-label="Open Atonacht on GitHub" onClick={() => openExternal(REPO_URL)}>↗</button>
        </Row>
        <Row label="Licenses" hint="Open-source licences">
          <button className="pill" aria-expanded={licences} onClick={() => setLicences(!licences)}>{licences ? "Hide" : "Show"}</button>
        </Row>
        {licences && (
          <ul className="licences">
            {LICENSES.map(([name, licence]) => (
              <li key={name}><span className="grow">{name}</span><span className="muted small">{licence}</span></li>
            ))}
            <li><span className="grow">Atonacht's own licence</span><span className="muted small">not chosen yet</span></li>
          </ul>
        )}
        <Row label="Report a problem" hint="Opens a GitHub issue with your version filled in">
          <button className="ib" aria-label="Report a problem" onClick={() => openExternal(issueUrl(platform))}>↗</button>
        </Row>
      </Group>
      <p className="muted small">Notes stay as plain Markdown files in your folder. Nothing is sent anywhere except the update check you ask for.</p>
    </>
  );
}
