import { useState } from "react";
import { isTauri } from "../lib/backend";
import { isAndroidApp, isMobileApp } from "../lib/platform";
import { APP_VERSION } from "../lib/update";
import { usePrefs } from "../prefs";
import { useStore } from "../store";
import { BackBar, PageHead } from "./common";

const platform = () => (isAndroidApp() ? "Android" : isMobileApp() ? "iOS" : isTauri() ? "Desktop" : "Browser demo");

/**
 * One screen with the answers every bug report needs, and a button that copies them.
 *
 * Diagnosing the Syncthing and widget problems took many messages because the version, the folder, the platform and the
 * last error were scattered across Settings. None of it is secret: the API key and the token are never included.
 */
export function Diagnostics() {
  const { prefs } = usePrefs();
  const { notes, dirs, tasks, conflicts, error } = useStore();
  const [copied, setCopied] = useState<"idle" | "ok" | "failed">("idle");

  const openTasks = tasks.filter((t) => !t.done).length;
  const rows: [string, string][] = [
    ["Atonacht", APP_VERSION],
    ["Platform", platform()],
    ["Renderer", typeof navigator !== "undefined" ? navigator.userAgent : "unknown"],
    ["Notes folder", prefs.root || "(not set)"],
    ["Notes", `${Object.keys(notes).length} in ${dirs.length} folder${dirs.length === 1 ? "" : "s"}`],
    ["Tasks", `${openTasks} open of ${tasks.length}`],
    ["Conflicts", String(conflicts.length)],
    ["Sync", prefs.syncMethod],
    ["Syncthing address", prefs.syncthingUrl || "(not set)"],
    ["Syncthing key", prefs.syncthingKey ? "set" : "not set"],
    ["GitHub", prefs.githubRepo ? `${prefs.githubRepo} (${prefs.githubBranch})` : "not set"],
    ["GitHub token", prefs.githubToken ? "set" : "not set"],
    ["Reminders", prefs.remind.enabled ? `${prefs.remind.time} · weekly ${prefs.remind.weeklyReview ? prefs.remind.reviewTime : "off"}` : "off"],
    ["Startup cache", prefs.startupCache ? "on" : "off"],
    ["Last error", error ?? "none"],
  ];

  const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("ok");
    } catch {
      setCopied("failed");
    }
    setTimeout(() => setCopied("idle"), 2000);
  };

  return (
    <>
      <BackBar label="Settings" />
      <PageHead title="Diagnostics" sub="What to include in a bug report" />
      <section className="card stack">
        {rows.map(([label, value]) => (
          <div className="srow" key={label}>
            <span className="grow">{label}</span>
            <span className="mono small diagval">{value}</span>
          </div>
        ))}
      </section>
      <p className="muted small">
        The API key and the GitHub token are never shown or copied — only whether they are set. Nothing leaves this device
        until you paste it somewhere.
      </p>
      <div className="btnrow start">
        <button className="btn" onClick={copy}>{copied === "ok" ? "Copied" : copied === "failed" ? "Could not copy" : "Copy diagnostics"}</button>
      </div>
      <details className="card diagraw">
        <summary>Raw text</summary>
        <pre className="mono small">{text}</pre>
      </details>
    </>
  );
}
