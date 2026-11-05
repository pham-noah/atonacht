import { useEffect, useRef } from "react";
import { runBack } from "./lib/back";

declare global {
  interface Window {
    /** Called by the Android activity when the back gesture is used. Returns true when the app took care of it. */
    __atonachtBack?: () => boolean;
  }
}

/**
 * The Android back gesture, as an Android user expects it:
 *   1. whatever registered itself closes first (the sidebar drawer, a Settings section, a sheet),
 *   2. a screen opened from another one goes back to it (editor, conflicts, a folder...),
 *   3. any other tab returns to Home,
 *   4. and only then does the system close the app (the activity finishes when this returns false).
 */
export function useAndroidBack({ canBack, back, route, goHome }: { canBack: boolean; back: () => void; route: string; goHome: () => void }) {
  // the refs keep the single listener current without reinstalling it on every render
  const state = useRef({ canBack, back, route, goHome });
  state.current = { canBack, back, route, goHome };

  useEffect(() => {
    window.__atonachtBack = () => {
      const { canBack, back, route, goHome } = state.current;
      if (runBack()) return true; // the drawer, a settings section, an overlay: whatever opened last closes first
      if (canBack) {
        back();
        return true;
      }
      if (route !== "home") {
        goHome();
        return true;
      }
      return false; // nothing left: let the activity finish
    };
    return () => {
      delete window.__atonachtBack;
    };
  }, []);
}
