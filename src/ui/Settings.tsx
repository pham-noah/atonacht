import { ReactNode, useEffect, useState } from "react";
import { pushBack } from "../lib/back";
import { useWide } from "../useWide";
import { BackBar, Icon, PageHead } from "./common";
import { isAndroidApp, isMobileApp } from "../lib/platform";
import { AppearancePanel, DailyPanel, EditorPanel, FilesPanel, InterfacePanel, PrivacyPanel, RemindersPanel, SyncPanel, TasksPanel } from "./SettingsPanels";
import { AboutPanel } from "./AboutPanel";
import { APP_VERSION } from "../lib/update";

const SECTIONS: [string, string, string, () => ReactNode][] = [
  ["appearance", "Appearance", "Theme, accent, text size", () => <AppearancePanel />],
  ["interface", "Interface", "Start screen, week, density", () => <InterfacePanel />],
  ["editor", "Editor", "Font, live Markdown, spellcheck", () => <EditorPanel />],
  ["tasks", "Tasks", "Default dates, carry-over, repeats", () => <TasksPanel />],
  ["daily", "Daily note", "Folder, template", () => <DailyPanel />],
  ["reminders", "Reminders", "Notifications and nudges", () => <RemindersPanel />],
  ["sync", "Sync", "Notes folder, Syncthing, conflicts", () => <SyncPanel />],
  ["files", "Files & backup", "Export and restore", () => <FilesPanel />],
  ["privacy", "Privacy & lock", "App lock", () => <PrivacyPanel available={isMobileApp()} android={isAndroidApp()} />],
  ["about", "About", "Version, updates, licences", () => <AboutPanel />],
];

export function Settings() {
  const wide = useWide();
  const [id, setId] = useState<string | null>(wide ? "appearance" : null);
  const current = SECTIONS.find((s) => s[0] === id);
  // on a phone a section is a screen of its own: back returns to the list before leaving Settings
  useEffect(() => (!wide && id !== null ? pushBack(() => (setId(null), true)) : undefined), [wide, id]);

  const list = (
    <nav className="setlist" aria-label="Settings sections">
      {SECTIONS.map(([sid, label, sub]) => (
        <button key={sid} className={`setitem${sid === id ? " on" : ""}`} onClick={() => setId(sid)}>
          <span className="grow"><span className="block">{label}</span><span className="muted small block">{sub}</span></span>
          {!wide && <Icon name="fwd" size={18} />}
        </button>
      ))}
    </nav>
  );

  if (!wide && current) {
    return (
      <>
        <BackBar label="Settings" onBack={() => setId(null)} />
        <PageHead title={current[1]} />
        {current[3]()}
      </>
    );
  }
  return (
    <>
      <BackBar label="Home" />
      <PageHead title="Settings" />
      {wide ? (
        <div className="setgrid">
          {list}
          <div className="setpanel stack">{current?.[3]()}</div>
        </div>
      ) : (
        <>
          {list}
          <p className="muted small">Atonacht {APP_VERSION} · after night</p>
        </>
      )}
    </>
  );
}
