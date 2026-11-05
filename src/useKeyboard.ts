import { useEffect, useState } from "react";

/**
 * How many pixels the on-screen keyboard covers, or 0 when it is closed. On Android the WebView is resized (the manifest asks
 * for adjustResize), so the visual viewport is much shorter than the window; the bottom bar uses this to step out of the
 * way instead of jumping up over the page. On desktop it stays false.
 */
export function useKeyboard(threshold = 120): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const check = () => {
      const covered = window.innerHeight - vv.height;
      setHeight(covered > threshold ? Math.round(covered) : 0);
    };
    check();
    vv.addEventListener("resize", check);
    vv.addEventListener("scroll", check);
    window.addEventListener("orientationchange", check);
    return () => {
      vv.removeEventListener("resize", check);
      vv.removeEventListener("scroll", check);
      window.removeEventListener("orientationchange", check);
    };
  }, [threshold]);
  return height;
}
