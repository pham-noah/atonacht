import { ReactNode, createContext, useContext, useEffect, useState } from "react";
import { DEFAULT_REMIND, RemindSettings } from "./lib/reminders";

export type Theme = "glass" | "solid" | "light";

export interface Prefs {
  theme: Theme;
  accent: string;
  root: string;
  onboarded: boolean;
  carryDismissed: string; // date for which the carry-over banner was dismissed
  reduceTransparency: boolean;
  textSize: number; // px
  editorFont: "sans" | "serif" | "mono";
  editorSize: number;
  lineHeight: number;
  livePreview: boolean;
  spellcheck: boolean;
  startScreen: "home" | "tasks" | "board" | "notes" | "calendar";
  weekStart: "mon" | "sun";
  density: "comfortable" | "compact";
  openTodayOnLaunch: boolean;
  defaultDue: "none" | "today" | "tomorrow";
  carryOver: "ask" | "auto" | "off";
  doneDays: number; // 0 = show all
  repeatFrom: "due" | "completion";
  dailyDir: string;
  autoCreateDaily: boolean;
  remind: RemindSettings;
  tabs: string[]; // bottom bar order; only these are shown
  swipeRight: "complete" | "none";
  swipeLeft: "tomorrow" | "delete" | "none";
  appLock: boolean;
  lockAfter: number; // ms in the background before locking
  syncthingUrl: string;
  syncthingKey: string;
  trashDays: number; // 0 = never empty the trash
  hideInRecents: boolean;
  blockScreenshots: boolean;
  kanbanColumns: string[]; // board columns between "To do" and "Done"
  boardSort: "urgency" | "due" | "note" | "title"; // card order on the all-tasks board
  startupCache: boolean; // keep a copy of notes in the app's storage so it starts faster
}

// [for dark themes, for the light theme]
export const ACCENTS: Record<string, [string, string]> = {
  blue: ["#6AA8FF", "#2F6FE0"],
  lavender: ["#B7A6FF", "#6A4FD8"],
  teal: ["#5FD0C0", "#127C6E"],
  rose: ["#FF8FB1", "#C23665"],
  amber: ["#F2A65A", "#A85A00"],
};

const KEY = "atonacht.prefs";
const DEFAULTS: Prefs = { theme: "glass", accent: "blue", root: "", onboarded: false, carryDismissed: "", reduceTransparency: false, textSize: 15, editorFont: "sans", editorSize: 16, lineHeight: 1.7, livePreview: true, spellcheck: true, startScreen: "home", weekStart: "mon", density: "comfortable", openTodayOnLaunch: false, defaultDue: "none", carryOver: "ask", doneDays: 7, repeatFrom: "due", dailyDir: "Daily notes", autoCreateDaily: true, remind: DEFAULT_REMIND, tabs: ["home", "tasks", "board", "notes", "calendar"], swipeRight: "complete", swipeLeft: "tomorrow", appLock: false, lockAfter: 60_000, syncthingUrl: "http://127.0.0.1:8384", syncthingKey: "", trashDays: 30, hideInRecents: false, blockScreenshots: false, startupCache: true, kanbanColumns: ["Doing"], boardSort: "urgency" };

function load(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { ...DEFAULTS, ...saved, remind: { ...DEFAULT_REMIND, ...saved.remind } };
  } catch {
    return DEFAULTS;
  }
}

const Ctx = createContext<{ prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void }>(null!);
export const usePrefs = () => useContext(Ctx);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, set] = useState<Prefs>(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable: keep going with in-memory prefs */
    }
  }, [prefs]);
  return <Ctx.Provider value={{ prefs, setPrefs: (p) => set((o) => ({ ...o, ...p })) }}>{children}</Ctx.Provider>;
}
