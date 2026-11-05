import { useEffect, useRef, useState } from "react";
import { isTauri } from "./lib/backend";
import { planReminders } from "./lib/reminders";
import { usePrefs } from "./prefs";
import { useStore } from "./store";

const mobile = () => /android|iphone|ipad/i.test(navigator.userAgent);

/**
 * Keeps the system's scheduled notifications in line with the notes.
 * Phone: the whole plan is handed to the OS (works when the app is closed).
 * Desktop: reminders due in the next 24 hours fire from timers while the app is running.
 */
export function useReminders() {
  const { tasks, ready } = useStore();
  const { prefs } = usePrefs();
  const last = useRef("");
  // Re-plan on a timer: on desktop the timers are set for whatever the plan held when it last ran, so without this a
  // session left open for a day would never schedule tomorrow's reminders.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 30 * 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!ready || !isTauri()) return;
    const plan = planReminders(tasks, Date.now(), prefs.remind);
    const sig = JSON.stringify(plan.map((r) => [r.id, r.at]));
    if (sig === last.current) return;
    let cancelled = false;
    const timers: number[] = [];
    const wait = window.setTimeout(async () => {
      try {
        const n = await import("@tauri-apps/plugin-notification");
        let ok = await n.isPermissionGranted();
        if (!ok && plan.length) ok = (await n.requestPermission()) === "granted";
        if (!ok || cancelled) return;
        last.current = sig;
        if (mobile()) {
          const ids = (await n.pending()).map((p) => p.id);
          if (ids.length) await n.cancel(ids);
          for (const r of plan) n.sendNotification({ id: r.id, title: r.title, body: r.body, schedule: n.Schedule.at(new Date(r.at), false, true) });
        } else {
          for (const r of plan) {
            const ms = r.at - Date.now();
            // The plan only looks 14 days ahead, so every reminder in it can be given a timer now.
            if (ms > 0) timers.push(window.setTimeout(() => n.sendNotification({ title: r.title, body: r.body }), ms));
          }
        }
      } catch (e) {
        console.warn("Reminders unavailable:", e);
      }
    }, 1500); // wait for edits to settle before rescheduling
    return () => {
      cancelled = true;
      clearTimeout(wait);
      timers.forEach(clearTimeout);
    };
  }, [tasks, ready, prefs.remind, tick]);
}
