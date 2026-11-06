import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { useReminders } from "./useReminders";
import { folderCounts } from "./lib/fs";
import { useAppLock } from "./useAppLock";
import { isAndroidApp, isMobileApp } from "./lib/platform";
import { invoke } from "@tauri-apps/api/core";
import { useAndroidBridge } from "./useAndroidBridge";
import { useGithubSync } from "./useGithubSync";
import { preloadWhenIdle } from "./lib/preload";
import { LockScreen } from "./ui/LockScreen";
import { Update } from "./ui/Update";
import { Diagnostics } from "./ui/Diagnostics";
import { Tags } from "./ui/Tags";
import { History } from "./ui/History";
const Palette = lazy(() => import("./ui/Palette").then((m) => ({ default: m.Palette })));
import { useWide } from "./useWide";
import { useKeyboard } from "./useKeyboard";
import { useTabSwipe } from "./useTabSwipe";
import { useAndroidBack } from "./useAndroidBack";
import { pushBack } from "./lib/back";
import { today } from "./lib/dates";
import { isTauri } from "./lib/backend";
import { fs } from "./lib/backend";
import { NavProvider, Route, useNav } from "./nav";
import { ACCENTS, PrefsProvider, usePrefs } from "./prefs";
import { StoreProvider, useStore } from "./store";
const Calendar = lazy(() => import("./ui/Calendar").then((m) => ({ default: m.Calendar })));
import { CaptureDialog, Icon, Logo, NewFolderDialog } from "./ui/common";
import { MenuProvider } from "./ui/ContextMenu";
const Conflicts = lazy(() => import("./ui/Conflicts").then((m) => ({ default: m.Conflicts })));
const Board = lazy(() => import("./ui/Board").then((m) => ({ default: m.Board })));
const Editor = lazy(() => import("./ui/Editor").then((m) => ({ default: m.Editor })));
import { FirstRun } from "./ui/FirstRun";
import { Home } from "./ui/Home";
const Library = lazy(() => import("./ui/Library").then((m) => ({ default: m.Library })));
import { Notes } from "./ui/Notes";
const Settings = lazy(() => import("./ui/Settings").then((m) => ({ default: m.Settings })));
import { Tasks } from "./ui/Tasks";
const Trash = lazy(() => import("./ui/Trash").then((m) => ({ default: m.Trash })));
const Weekly = lazy(() => import("./ui/Weekly").then((m) => ({ default: m.Weekly })));

const TAB_LABELS: Record<string, string> = { home: "Home", tasks: "Tasks", board: "Board", notes: "Notes", calendar: "Calendar" };
const FULLSCREEN = ["editor", "settings", "conflicts", "weekly", "library", "trash", "update", "diagnostics", "tags", "history"];

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case "home": return <Home />;
    case "tasks": return <Tasks />;
    case "board": return <Board path={route.path} />;
    case "notes": return <Notes key={`${route.folder}|${route.query}`} folder={route.folder} query={route.query} />;
    case "calendar": return <Calendar date={route.date} />;
    case "editor": return <Editor key={route.path} path={route.path} />;
    case "settings": return <Settings />;
    case "conflicts": return <Conflicts />;
    case "weekly": return <Weekly />;
    case "library": return <Library />;
    case "update": return <Update />;
    case "diagnostics": return <Diagnostics />;
    case "tags": return <Tags />;
    case "history": return <History path={route.path} />;
    case "trash": return <Trash />;
  }
}

function Sidebar({ open, close }: { open: boolean; close: () => void }) {
  const { route, go } = useNav();
  const { tasks, dirs, notes, conflicts, error, root, pinned } = useStore();
  useGithubSync();
  const [newFolder, setNewFolder] = useState(false);
  const [q, setQ] = useState("");
  const nav = (r: Route) => { go(r); close(); };
  const openTasks = tasks.filter((t) => !t.done).length;
  const counts = useMemo(() => folderCounts(Object.keys(notes)), [notes]);
  const count = (f: string) => counts.get(f) ?? 0;
  const item = (r: Route, label: string, extra?: string | number) => (
    <button className={`navitem${route.name === r.name && !(r.name === "notes" && (r.folder || (route as { folder?: string }).folder)) ? " on" : ""}`} onClick={() => nav(r)}>
      <span className="grow">{label}</span>{extra !== undefined && <span className="chip">{extra}</span>}
    </button>
  );
  return (
    <>
      {open && <div className="drawerscrim" onClick={close} />}
      <aside className={`side${open ? " open" : ""}`}>
        <div className="sidehead">
          <Logo size={32} /><span className="brandname grow">Atonacht</span>
          <button className="ib" aria-label="Settings" onClick={() => nav({ name: "settings" })}><Icon name="gear" size={20} /></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav({ name: "notes", query: q.trim() }); }}>
          <input className="in" type="search" placeholder="Search notes" aria-label="Search notes" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        <nav className="nav">
          {item({ name: "home" }, "Home")}
          {item({ name: "tasks" }, "All tasks", openTasks)}
          {item({ name: "board" }, "Board")}
          {item({ name: "calendar" }, "Calendar")}
          {item({ name: "notes" }, "Notes")}
          {item({ name: "library" }, "Library", pinned.length || undefined)}
          {item({ name: "tags" }, "Tags")}
          {item({ name: "weekly" }, "Weekly review")}
          {item({ name: "trash" }, "Trash")}
          {conflicts.length > 0 && item({ name: "conflicts" }, "Sync conflicts", conflicts.length)}
        </nav>
        <div>
          <div className="cap">Folders</div>
          <nav className="nav">
            {dirs.filter((d) => !d.includes("/")).map((f) => (
              <button key={f} className={`navitem${route.name === "notes" && route.folder === f ? " on" : ""}`} onClick={() => nav({ name: "notes", folder: f })}>
                <span className="grow">{f}</span><span className="muted small">{count(f)}</span>
              </button>
            ))}
            <button className="navitem accenttext" onClick={() => setNewFolder(true)}>+ New folder</button>
          </nav>
        </div>
        <div className="syncline small muted" title={root}>
          <span className={`dot${error ? " bad" : ""}`} />
          {error ? "Folder problem. Open Settings." : fs.native ? "Watching your notes folder" : "Browser demo"}
        </div>
      </aside>
      {newFolder && <NewFolderDialog onClose={() => setNewFolder(false)} />}
    </>
  );
}

function Shell() {
  const wide = useWide();
  const kb = useKeyboard(); // pixels the on-screen keyboard covers: the bottom bar steps aside, dialogs ride above it
  const { route, go, back, canBack } = useNav();
  const { prefs } = usePrefs();
  const { error, undo, clearUndo, ready: booted } = useStore();
  const [drawer, setDrawer] = useState(false);
  // the system back gesture: close what is open, step back through screens, then Home
  useAndroidBack({ canBack, back, route: route.name, goHome: () => go({ name: "home" }) });
  const [capture, setCapture] = useState<string | null>(null);
  const [palette, setPalette] = useState(false);
  // the sidebar is a drawer on a phone: back closes it before it changes screen
  useEffect(() => (drawer ? pushBack(() => (setDrawer(false), true)) : undefined), [drawer]);
  const lock = useAppLock({
    enabled: prefs.appLock && isMobileApp(),
    lockAfterMs: prefs.lockAfter,
    authenticate: async () => {
      const b = await import("@tauri-apps/plugin-biometric");
      const status = await b.checkStatus();
      if (!status.isAvailable) return; // no screen lock set up on the phone: don't lock the person out
      await b.authenticate("Unlock Atonacht", { allowDeviceCredential: true });
    },
  });

  // Ctrl/Cmd + K opens the command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const { ready, openDaily, cleanTrash, tasks } = useStore();
  useAndroidBridge({ enabled: ready && isAndroidApp(), tasks, blockScreenshots: prefs.blockScreenshots, hideInRecents: prefs.hideInRecents, invoke });
  const launched = useRef(false);
  useReminders();

  // Open today's note straight away if Settings says so.
  useEffect(() => {
    if (ready && !launched.current) {
      launched.current = true;
      if (prefs.openTodayOnLaunch) openDaily(today()).then((p) => go({ name: "editor", path: p }));
    }
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch the editor and settings in the background so the first tap on a note is instant.
  useEffect(() => (ready ? preloadWhenIdle([() => import("./ui/Editor"), () => import("./ui/Settings")]) : undefined), [ready]);

  // Empty the trash of notes older than the chosen time, once at start and then every few hours.
  useEffect(() => {
    if (!ready || prefs.trashDays <= 0) return;
    const run = () => void cleanTrash(prefs.trashDays).catch(() => {});
    run();
    const t = setInterval(run, 6 * 36e5);
    return () => clearInterval(t);
  }, [ready, prefs.trashDays]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl+Alt+N and the tray icon ask for the capture sheet from the Rust side.
  useEffect(() => {
    if (!isTauri()) return;
    let off: (() => void) | undefined;
    import("@tauri-apps/api/event")
      .then(({ listen }) => listen("quick-capture", () => setCapture("")))
      .then((u) => (off = u))
      .catch(() => {});
    return () => off?.();
  }, []);

  // atonacht://capture?text=... comes from the Android widget and the share sheet.
  useEffect(() => {
    if (!isTauri()) return;
    let off: (() => void) | undefined;
    import("@tauri-apps/plugin-deep-link").then(async (d) => {
      const open = (urls: string[] | null) => {
        for (const u of urls ?? []) {
          try {
            const url = new URL(u);
            if (url.host === "capture") setCapture(url.searchParams.get("text") ?? "");
            else if (url.host === "tasks") go({ name: "tasks" });
            else if (url.host === "home") go({ name: "home" });
          } catch { /* not a URL we understand */ }
        }
      };
      open(await d.getCurrent());
      off = await d.onOpenUrl(open);
    }).catch(() => {});
    return () => off?.();
  }, []);
  const full = FULLSCREEN.includes(route.name);
  const [dark, light] = ACCENTS[prefs.accent] ?? ACCENTS.blue;

  // Swipe between tabs on a phone, and slide the new screen in from the side the tab sits on.
  const tabIds = prefs.tabs.filter((id) => TAB_LABELS[id]);
  const swipe = useTabSwipe({ enabled: !wide && !full, tabs: tabIds, current: route.name, goTab: (id) => go({ name: id as "home" | "tasks" | "board" | "notes" | "calendar" }) });
  const [slide, setSlide] = useState<"l" | "r" | null>(null);
  const lastTab = useRef(tabIds.indexOf(route.name));
  useEffect(() => {
    const i = tabIds.indexOf(route.name);
    if (i >= 0 && lastTab.current >= 0 && i !== lastTab.current) {
      setSlide(i > lastTab.current ? "r" : "l");
      const t = setTimeout(() => setSlide(null), 220);
      lastTab.current = i;
      return () => clearTimeout(t);
    }
    lastTab.current = i;
  }, [route.name, tabIds.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!booted && !error) {
    return (
      <div className={`app ${prefs.theme}${prefs.reduceTransparency ? " flat" : ""}`} style={{ ["--acc" as string]: prefs.theme === "light" ? light : dark }}>
        <div className="boot" aria-label="Opening your notes">
          <Logo size={44} />
        </div>
      </div>
    );
  }

  return (
    <div className={`app ${prefs.theme}${wide ? " wide" : ""}${prefs.reduceTransparency ? " flat" : ""}${prefs.density === "compact" ? " compact" : ""}${kb ? " kb" : ""}`} style={{ ["--acc" as string]: prefs.theme === "light" ? light : dark, ["--kb" as string]: `${kb}px`, fontSize: prefs.textSize }}>
      {(wide || !full) && <Sidebar open={drawer} close={() => setDrawer(false)} />}
      <main className="main">
        {!wide && !full && (
          <button className="brandbtn" onClick={() => setDrawer(true)} aria-label="Open sidebar"><Logo size={28} /><span className="brandname">Atonacht</span></button>
        )}
        {error && route.name !== "settings" && (
          <button className="banner warnb" onClick={() => go({ name: "settings" })}>
            <Icon name="alert" size={20} /><span className="grow small">{error}</span><span className="chip">Settings</span>
          </button>
        )}
        {undo && (
          <div className="snack" role="status">
            <span className="grow small">{undo.label}</span>
            <button className="pill" onClick={async () => { await undo.run(); clearUndo(); }}>Undo</button>
            <button className="ib" aria-label="Dismiss" onClick={clearUndo}><Icon name="x" size={18} /></button>
          </div>
        )}
        <div
          className={`content${route.name === "board" ? " full" : ""}${slide ? ` slide-${slide}` : ""}`}
          onPointerDown={swipe.onPointerDown}
          onPointerUp={swipe.onPointerUp}
          onPointerCancel={swipe.onPointerCancel}
        ><Suspense fallback={null}><Screen route={route} /></Suspense></div>
      </main>
      {!wide && !full && (
        <>
          {["tasks", "notes"].includes(route.name) && (
            <button className="fab" aria-label="Quick capture" onClick={() => setCapture("")}><Icon name="plus" size={26} /></button>
          )}
          <nav className="tabs" aria-label="Main">
            {prefs.tabs.filter((id) => TAB_LABELS[id]).map((id) => (
              <button key={id} className={route.name === id ? "on" : ""} onClick={() => go({ name: id as "home" | "tasks" | "board" | "notes" | "calendar" })}><Icon name={id} size={24} />{TAB_LABELS[id]}</button>
            ))}
          </nav>
        </>
      )}
      {palette && <Suspense fallback={null}><Palette onClose={() => setPalette(false)} onCapture={() => setCapture("")} /></Suspense>}
      {lock.locked && <LockScreen error={lock.error} onUnlock={lock.unlock} />}
      {capture !== null && <CaptureDialog initial={capture} onClose={() => setCapture(null)} />}
    </div>
  );
}

function Gate() {
  const { prefs } = usePrefs();
  const [dark, light] = ACCENTS[prefs.accent] ?? ACCENTS.blue;
  const acc = { ["--acc" as string]: prefs.theme === "light" ? light : dark, fontSize: prefs.textSize };
  if (!prefs.onboarded || !prefs.root) return <div className={`app ${prefs.theme} wide`} style={acc}><FirstRun /></div>;
  return (
    <StoreProvider>
      <NavProvider>
        <MenuProvider><Shell /></MenuProvider>
      </NavProvider>
    </StoreProvider>
  );
}

export default function App() {
  return <PrefsProvider><Gate /></PrefsProvider>;
}
