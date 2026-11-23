import { ACCENTS, usePrefs } from "../prefs";
import { Theme } from "../prefs";
import { Choice, Group, Row, Slider, Toggle } from "./SettingsParts";

const THEMES: [Theme, string, string][] = [
  ["glass", "Liquid Glass", "Translucent panels over a night sky"],
  ["solid", "Solid", "Flat, high-contrast surfaces"],
  ["light", "Light", "Bright glass for daytime"],
];

export function AppearancePanel() {
  const { prefs, setPrefs } = usePrefs();
  const light = prefs.theme === "light";
  return (
    <>
      <div className="themes">
        {THEMES.map(([id, name, desc]) => (
          <label key={id} className={`themecard${prefs.theme === id ? " picked" : ""}`}>
            <span className={`mini mini-${id}`}><span /></span>
            <span className="tn"><input type="radio" name="theme" checked={prefs.theme === id} onChange={() => setPrefs({ theme: id })} />{name}</span>
            <span className="muted small">{desc}</span>
          </label>
        ))}
      </div>
      <Group>
        <Row label="Accent colour">
          <span className="swatches">
            {Object.entries(ACCENTS).map(([name, [dark, lt]]) => (
              <button key={name} className={`sw${prefs.accent === name ? " sel" : ""}`} style={{ background: light ? lt : dark }} onClick={() => setPrefs({ accent: name })} aria-label={`${name} accent`} aria-pressed={prefs.accent === name} />
            ))}
          </span>
        </Row>
        <Slider label="Text size" value={prefs.textSize} min={13} max={20} onChange={(v) => setPrefs({ textSize: v })} show={`${prefs.textSize}px`} />
        <Toggle label="Reduce transparency" hint="Turns glass panels into solid ones" value={prefs.reduceTransparency} onChange={(v) => setPrefs({ reduceTransparency: v })} />
      </Group>
    </>
  );
}

export function InterfacePanel() {
  const { prefs, setPrefs } = usePrefs();
  return (
    <>
    <Group>
      <Choice label="Start screen" value={prefs.startScreen} onChange={(v) => setPrefs({ startScreen: v })} options={[["home", "Home"], ["tasks", "Tasks"], ["board", "Board"], ["notes", "Notes"], ["calendar", "Calendar"]]} />
      <Toggle label="Open today’s note on launch" value={prefs.openTodayOnLaunch} onChange={(v) => setPrefs({ openTodayOnLaunch: v })} />
      <Choice label="Week starts on" value={prefs.weekStart} onChange={(v) => setPrefs({ weekStart: v })} options={[["mon", "Monday"], ["sun", "Sunday"]]} />
      <Choice label="Density" value={prefs.density} onChange={(v) => setPrefs({ density: v })} options={[["comfortable", "Comfortable"], ["compact", "Compact"]]} />
    </Group>
    <TabOrder />
    <Group title="Swipe actions on tasks (phone)">
      <Choice label="Swipe right" value={prefs.swipeRight} onChange={(v) => setPrefs({ swipeRight: v })} options={[["complete", "Complete"], ["none", "Nothing"]]} />
      <p className="muted small">Swipe a task across, then let go. A swipe never starts a rename.</p>
      <Choice label="Swipe left" value={prefs.swipeLeft} onChange={(v) => setPrefs({ swipeLeft: v })} options={[["tomorrow", "Tomorrow"], ["delete", "Delete"], ["none", "Nothing"]]} />
    </Group>
    </>
  );
}

const TAB_LABELS: Record<string, string> = { home: "Home", tasks: "Tasks", board: "Board", notes: "Notes", calendar: "Calendar" };

function TabOrder() {
  const { prefs, setPrefs } = usePrefs();
  const all = Object.keys(TAB_LABELS);
  const shown = prefs.tabs.filter((t) => all.includes(t));
  const rows = [...shown, ...all.filter((t) => !shown.includes(t))];
  const move = (i: number, d: number) => {
    const next = [...shown];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setPrefs({ tabs: next });
  };
  return (
    <Group title="Bottom bar (phone)">
      {rows.map((t) => {
        const on = shown.includes(t);
        const i = shown.indexOf(t);
        return (
          <div key={t} className="srow">
            <span className="grow">{TAB_LABELS[t]}</span>
            <input type="checkbox" checked={on} disabled={t === "home" || (on && shown.length <= 2)} aria-label={`Show ${TAB_LABELS[t]}`} onChange={(e) => setPrefs({ tabs: e.target.checked ? [...shown, t] : shown.filter((x) => x !== t) })} />
            <span className="movebtns">
              <button className="ib" disabled={!on || i === 0} onClick={() => move(i, -1)} aria-label={`Move ${TAB_LABELS[t]} up`}>▲</button>
              <button className="ib" disabled={!on || i === shown.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${TAB_LABELS[t]} down`}>▼</button>
            </span>
          </div>
        );
      })}
    </Group>
  );
}
