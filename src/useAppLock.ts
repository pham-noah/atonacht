import { useCallback, useEffect, useRef, useState } from "react";
import { shouldLock } from "./lib/lock";

interface Opts {
  enabled: boolean;
  lockAfterMs: number;
  /** Resolves when the person proves it is them; rejects otherwise. */
  authenticate: () => Promise<void>;
}

/** Locks the app at start and after it has been in the background for a while. */
export function useAppLock({ enabled, lockAfterMs, authenticate }: Opts) {
  const [locked, setLocked] = useState(enabled);
  const [error, setError] = useState("");
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return setLocked(false);
    const onChange = () => {
      if (document.visibilityState === "hidden") hiddenAt.current = Date.now();
      else {
        if (shouldLock(hiddenAt.current, Date.now(), lockAfterMs)) setLocked(true);
        hiddenAt.current = null;
      }
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, [enabled, lockAfterMs]);

  const unlock = useCallback(async () => {
    try {
      await authenticate();
      setError("");
      setLocked(false);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }, [authenticate]);

  return { locked: enabled && locked, error, unlock };
}
