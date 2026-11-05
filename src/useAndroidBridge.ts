import { useEffect, useRef, useState } from "react";
import { dailyPath } from "./lib/daily";
import { fmt } from "./lib/dates";
import { Task } from "./lib/tasks";
import { widgetPayload } from "./lib/widget";

interface Opts {
  enabled: boolean; // true only inside the Android app
  tasks: Task[];
  blockScreenshots: boolean;
  hideInRecents: boolean;
  invoke: (cmd: string, args: Record<string, unknown>) => Promise<unknown>;
}

/** Keeps the Android widget's task list and the window privacy flags in step with the app. */
export function useAndroidBridge({ enabled, tasks, blockScreenshots, hideInRecents, invoke }: Opts) {
  const [today, setToday] = useState(() => fmt(new Date()));
  const lastWidget = useRef("");
  const lastPrivacy = useRef("");

  useEffect(() => {
    const t = setInterval(() => setToday(fmt(new Date())), 5 * 60_000); // rolls the widget over at midnight
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const json = JSON.stringify(widgetPayload(tasks, today, dailyPath(today)));
    if (json === lastWidget.current) return;
    const wait = setTimeout(() => {
      lastWidget.current = json;
      invoke("set_widget_tasks", { json }).catch(() => {});
    }, 800); // wait for a burst of edits to settle
    return () => clearTimeout(wait);
  }, [enabled, tasks, today, invoke]);

  useEffect(() => {
    if (!enabled) return;
    const key = `${blockScreenshots}|${hideInRecents}`;
    if (key === lastPrivacy.current) return;
    lastPrivacy.current = key;
    invoke("set_privacy_flags", { blockScreenshots, hideInRecents }).catch(() => {});
  }, [enabled, blockScreenshots, hideInRecents, invoke]);
}
