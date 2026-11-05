import { useEffect, useState } from "react";

/**
 * How many pixels the on-screen keyboard covers, or 0 when it is closed. The window keeps its size (the manifest asks for
 * adjustNothing), so the visual viewport is the only thing that shrinks; sheets are lifted by this amount and the bottom
 * bar steps aside instead of the page moving. On desktop it stays 0.
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
