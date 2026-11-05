import { useState } from "react";
import { isTauri } from "../lib/backend";
import { isAndroidApp, isMobileApp } from "../lib/platform";
import { APP_VERSION, AUTHOR_URL, LICENSES, REPO_URL, issueUrl, openExternal } from "../lib/update";
import { useNav } from "../nav";
import { Group, Row } from "./SettingsParts";

const platformName = () => (isAndroidApp() ? "Android" : isMobileApp() ? "iOS" : isTauri() ? "Desktop" : "Browser demo");

/** Version, licences and links. Checking for an update has its own screen, so this panel just opens it. */
export function AboutPanel() {
  const [licences, setLicences] = useState(false);
  const { go } = useNav();
  const platform = platformName();

  return (
    <>
      <Group title="Version">
        <Row label={`Atonacht ${APP_VERSION}`} hint={platform} />
        <Row label="Check for updates" hint="Opens a screen with the latest release and what changed">
          <button className="btn" onClick={() => go({ name: "update" })}>Open</button>
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
            <li><span className="grow">Atonacht's own licence</span><span className="muted small">Apache-2.0</span></li>
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
