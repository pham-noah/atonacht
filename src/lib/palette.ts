export interface PaletteItem {
  id: string;
  label: string;
  hint?: string; // folder, or a short description
  kind: "action" | "note";
}

/** Subsequence score: 0 = no match. Prefix and word-start matches rank higher, tighter matches rank higher. */
export function score(label: string, query: string): number {
  const l = label.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return 1;
  if (l.startsWith(q)) return 1000 - l.length;
  const word = l.indexOf(" " + q);
  if (word >= 0) return 800 - word;
  const at = l.indexOf(q);
  if (at >= 0) return 600 - at;
  let qi = 0;
  let gaps = 0;
  let prev = -2;
  for (let i = 0; i < l.length && qi < q.length; i++) {
    if (l[i] === q[qi]) {
      if (qi > 0 && i !== prev + 1) gaps++;
      prev = i;
      qi++;
    }
  }
  return qi === q.length ? 300 - gaps * 10 - (l.length - q.length) : 0;
}

export function rankItems(items: PaletteItem[], query: string, limit = 8): PaletteItem[] {
  const q = query.trim();
  const scored = items
    .map((it) => ({ it, s: score(it.label, q) }))
    .filter((x) => x.s > 0);
  if (!q) return scored.filter((x) => x.it.kind === "action").slice(0, limit).map((x) => x.it);
  return scored.sort((a, b) => b.s + (b.it.kind === "action" ? 5 : 0) - (a.s + (a.it.kind === "action" ? 5 : 0))).slice(0, limit).map((x) => x.it);
}
