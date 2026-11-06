import type { Entry, NotesFs } from "./fs";
import { addDays, today } from "./dates";
import { dailyPath, dailyTemplate } from "./daily";
import { stampPath, unstampPath } from "./trash";

interface Store {
  files: Record<string, { content: string; mtime: number }>;
  dirs: string[];
}

const KEY = "atonacht.demo";
const hidden = (p: string) => p.split("/").some((s) => s.startsWith("."));
const parents = (p: string) => p.split("/").slice(0, -1).reduce<string[]>((a, s) => [...a, a.length ? `${a[a.length - 1]}/${s}` : s], []);

export function demoSeed(): Store {
  const t = today();
  const y = addDays(t, -1);
  const now = Date.now();
  const f = (content: string, ago = 0) => ({ content, mtime: now - ago });
  return {
    dirs: ["Daily notes", "Game ideas", "Personal", "Thesis"],
    files: {
      [dailyPath(y)]: f(`${dailyTemplate(y).replace("## Plan\n", `## Plan\n- [ ] Send invoice @due(${y}) !high\n- [ ] Email supervisor #thesis\n- [x] Pay rent\n`)}`, 86_400_000),
      "Game ideas/Tide roguelike.md": f("# Tide roguelike\n\nEvery wave flips the dungeon layout. Players read the tide table to decide which rooms stay reachable.\n\n- [ ] Sketch three room types\n- [ ] Prototype tide timer @due(" + addDays(t, 3) + ")\n", 3_600_000),
      "Personal/Packing list.md": f("# Packing list\n\nPassport, charger, rain shell.\n\n- [ ] Buy oat milk\n- [ ] Renew bus pass @due(" + addDays(t, 2) + ") @repeat(monthly)\n", 172_800_000),
      "Thesis/Thesis outline.md": f("# Thesis outline\n\n## Methods\nSurvey of 120 students, online only.\n\n- [ ] Draft methods section !high @due(" + addDays(t, 1) + ") #thesis\n- [ ] Email supervisor\n", 7_200_000),
      "Thesis/Thesis outline.sync-conflict-20261029-101500-ABCDEFG.md": f("# Thesis outline\n\n## Methods\nSurvey of 150 students, online and on campus.\n\n- [x] Draft methods section !high @due(" + addDays(t, 1) + ") #thesis\n- [ ] Email supervisor\n", 1_800_000),
    },
  };
}

export function createMemFs(seed?: Store, persist = false): NotesFs {
  let store: Store = seed ?? { files: {}, dirs: [] };
  if (persist && typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(KEY);
      store = raw ? JSON.parse(raw) : demoSeed();
    } catch {
      store = demoSeed();
    }
  }
  const save = () => {
    if (persist && typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(store));
  };
  const addDirs = (path: string) => {
    for (const d of parents(path)) if (!store.dirs.includes(d)) store.dirs.push(d);
  };
  return {
    native: false,
    defaultRoot: async () => "Demo notes (stored in this browser)",
    ensureRoot: async () => {},
    list: async () => {
      const files: Entry[] = Object.entries(store.files)
        .filter(([p]) => !hidden(p))
        .map(([path, v]) => ({ path, kind: "file", mtime: v.mtime, size: v.content.length }));
      const dirs: Entry[] = store.dirs.filter((p) => !hidden(p)).map((path) => ({ path, kind: "dir", mtime: 0, size: 0 }));
      return [...dirs, ...files];
    },
    read: async (_r, path) => {
      const f = store.files[path];
      if (!f) throw new Error(`Not found: ${path}`);
      return f.content;
    },
    write: async (_r, path, content) => {
      const mtime = Date.now();
      store.files[path] = { content, mtime };
      addDirs(path);
      save();
      return mtime;
    },
    // the browser demo has no files, so an attachment is kept as text: a data URL the preview can show
    writeBytes: async (_r, path, data) => {
      let bin = "";
      for (let i = 0; i < data.length; i += 0x8000) bin += String.fromCharCode(...data.subarray(i, i + 0x8000));
      const mime = /\.png$/i.test(path) ? "image/png" : /\.gif$/i.test(path) ? "image/gif" : /\.webp$/i.test(path) ? "image/webp" : "image/jpeg";
      store.files[path] = { content: `data:${mime};base64,${btoa(bin)}`, mtime: Date.now() };
      addDirs(path);
      save();
    },
    readBytes: async (_r, path) => {
      const f = store.files[path];
      if (!f) throw new Error(`Not found: ${path}`);
      const b64 = f.content.startsWith("data:") ? f.content.slice(f.content.indexOf(",") + 1) : btoa(f.content);
      const raw = atob(b64);
      const out = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
      return out;
    },
    mkdir: async (_r, path) => {
      if (!store.dirs.includes(path)) store.dirs.push(path);
      save();
    },
    remove: async (_r, path) => {
      const f = store.files[path];
      if (!f) return;
      let secs = Math.floor(Date.now() / 1000);
      while (store.files[`.trash/${stampPath(path, secs)}`]) secs++; // same name deleted twice in one second
      const dest = `.trash/${stampPath(path, secs)}`;
      store.files[dest] = f;
      delete store.files[path];
      save();
    },
    removeDir: async (_r, path) => {
      if (Object.keys(store.files).some((p) => p.startsWith(path + "/")) || store.dirs.some((d) => d.startsWith(path + "/"))) throw new Error(`Folder ${path} is not empty`);
      store.dirs = store.dirs.filter((d) => d !== path);
      save();
    },
    listTrash: async () =>
      Object.entries(store.files)
        .filter(([p]) => p.startsWith(".trash/"))
        .map(([p, v]): Entry => ({ path: p.slice(7), kind: "file", mtime: v.mtime, size: v.content.length })),
    restore: async (_r, tp) => {
      const f = store.files[`.trash/${tp}`];
      if (!f) throw new Error(`Not in trash: ${tp}`);
      let rel = unstampPath(tp).path;
      if (store.files[rel]) rel = rel.replace(/(\.[^./]+)?$/, " (restored)$1");
      store.files[rel] = f;
      delete store.files[`.trash/${tp}`];
      addDirs(rel);
      save();
      return rel;
    },
    purge: async (_r, tp) => {
      delete store.files[`.trash/${tp}`];
      save();
    },
    rename: async (_r, from, to) => {
      store.files[to] = { content: store.files[from].content, mtime: Date.now() };
      delete store.files[from];
      addDirs(to);
      save();
    },
  };
}
