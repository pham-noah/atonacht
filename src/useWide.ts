import { useEffect, useState } from "react";

export const useWide = () => {
  const q = "(min-width: 900px)";
  const [wide, set] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => set(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return wide;
};
