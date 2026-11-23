import { usePrefs } from "../prefs";
import { Choice, Group, Toggle } from "./SettingsParts";

export function PrivacyPanel({ available, android = false }: { available: boolean; android?: boolean }) {
  const { prefs, setPrefs } = usePrefs();
  return (
    <>
      <Group>
        <Toggle label="App lock" hint={available ? "Ask for your fingerprint, face or screen lock when opening the app" : "Available in the phone app"} value={prefs.appLock && available} onChange={(v) => available && setPrefs({ appLock: v })} />
        {available && prefs.appLock && <Choice label="Lock after" value={prefs.lockAfter} onChange={(v) => setPrefs({ lockAfter: v })} options={[[0, "Right away"], [60_000, "1 minute"], [300_000, "5 minutes"]]} />}
      </Group>
      {android && (
        <Group title="On screen">
          <Toggle label="Hide content in recent apps" hint="The recent-apps card shows a blank instead of your notes" value={prefs.hideInRecents} onChange={(v) => setPrefs({ hideInRecents: v })} />
          <Toggle label="Block screenshots and screen recording" hint="Also hides the app in recent apps on Android 12 and older" value={prefs.blockScreenshots} onChange={(v) => setPrefs({ blockScreenshots: v })} />
        </Group>
      )}
      <Group><p className="muted small">App lock protects the app, not the files. Your notes are plain Markdown in your notes folder, so use device encryption to protect them if the phone is lost. For faster starts Atonacht also keeps a copy of your notes in its own app storage; you can turn that off in Files &amp; backup.</p></Group>
    </>
  );
}
