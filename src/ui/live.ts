import { EditorState, Extension } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";

const TASK = /^(\s*)([-*+]) \[([ xX])\]/;
const INLINE: [RegExp, string][] = [
  [/@due\(\d{4}-\d{2}-\d{2}\)/g, "cm-chip"],
  [/@repeat\([^)]+\)/g, "cm-chip"],
  [/(?<=^|\s)!(?:high|med|low)\b/g, "cm-chip cm-hi"],
  [/(?<=^|\s)#[\p{L}\p{N}_-]+/gu, "cm-chip"],
  [/@done\(\d{4}-\d{2}-\d{2}\)/g, "cm-dim"],
  [/\[\[[^\]]+\]\]/g, "cm-wl"],
  [/(?<!!)\[[^\]\n]+\]\((?:https?:\/\/|mailto:)[^)\s]+\)/g, "cm-ext"],
  [/\*\*[^*]+\*\*/g, "cm-strong"],
  [/`[^`]+`/g, "cm-code"],
];

/**
 * Decorations for the editor: headings sized, metadata as chips, the "- [ ]" of a task dimmed (click it to
 * tick the line off). The raw Markdown is always visible on every line — nothing is hidden or swapped out, so
 * what you see is what is stored. With `live` off no decorations are drawn at all.
 */
export function buildDecorations(state: EditorState, live: boolean, range?: { from: number; to: number }): DecorationSet {
  if (!live) return Decoration.none;
  const out: { from: number; to: number; value: Decoration }[] = [];
  let fenced = false;
  let fm = state.doc.line(1).text === "---";
  // With a range (the part of the note on screen) only those lines get decorated. Whether a line sits inside a code
  // block or front matter depends on the lines before it, so those are walked with a cheap check and no decorations.
  const first = range ? state.doc.lineAt(range.from).number : 1;
  const last = range ? state.doc.lineAt(Math.min(range.to, state.doc.length)).number : state.doc.lines;
  for (let n = 1; n <= Math.min(last, state.doc.lines); n++) {
    const line = state.doc.line(n);
    const text = line.text;
    if (n < first) {
      if (fm) {
        if (n > 1 && text === "---") fm = false;
      } else if (/^\s*```/.test(text)) fenced = !fenced;
      continue;
    }
    if (fm) {
      out.push({ from: line.from, to: line.from, value: Decoration.line({ class: "cm-fm" }) });
      if (n > 1 && text === "---") fm = false;
      continue;
    }
    if (/^\s*```/.test(text)) {
      fenced = !fenced;
      out.push({ from: line.from, to: line.from, value: Decoration.line({ class: "cm-fence" }) });
      continue;
    }
    if (fenced) {
      out.push({ from: line.from, to: line.from, value: Decoration.line({ class: "cm-fence" }) });
      continue;
    }
    const h = /^(#{1,3})\s+/.exec(text);
    if (h) {
      out.push({ from: line.from, to: line.from, value: Decoration.line({ class: `cm-h cm-h${h[1].length}` }) });
      out.push({ from: line.from, to: line.from + h[0].length, value: Decoration.mark({ class: "cm-mark" }) });
      continue;
    }
    const t = TASK.exec(text);
    let skip = 0;
    if (t) {
      const done = t[3] !== " ";
      const start = line.from + t[1].length;
      out.push({ from: line.from, to: line.from, value: Decoration.line({ class: done ? "cm-task cm-taskdone" : "cm-task" }) });
      // The "- [ ]" stays on screen; clicking it ticks the task off.
      out.push({
        from: start,
        to: start + 5,
        value: Decoration.mark({ class: done ? "cm-box cm-boxdone" : "cm-box", attributes: { "data-line": String(n - 1) } }),
      });
      skip = t[0].length;
    }
    for (const [re, cls] of INLINE) {
      for (const m of text.matchAll(re)) {
        if (m.index! < skip) continue;
        out.push({ from: line.from + m.index!, to: line.from + m.index! + m[0].length, value: Decoration.mark({ class: cls }) });
      }
    }
  }
  return Decoration.set(
    out.map((r) => r.value.range(r.from, r.to)),
    true,
  );
}

/** Decorates only the lines on screen (plus a margin), so a note with thousands of lines types as fast as a short one. */
function visibleDecorations(view: EditorView, live: boolean): DecorationSet {
  const margin = 2000; // characters
  return buildDecorations(view.state, live, { from: Math.max(0, view.viewport.from - margin), to: view.viewport.to + margin });
}

export function liveMarkdown(
  live: boolean,
  onToggle: (line: number) => void,
  onLink: (name: string) => void,
  onExternal: (url: string) => void = () => {},
): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = visibleDecorations(view, live);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged) this.decorations = visibleDecorations(u.view, live);
      }
    },
    {
      decorations: (v) => v.decorations,
    },
  );
  return [
    plugin,
    EditorView.domEventHandlers({
      mousedown(e) {
        const el = (e.target as HTMLElement).closest<HTMLElement>(".cm-box");
        if (el?.dataset.line !== undefined) {
          e.preventDefault();
          onToggle(Number(el.dataset.line));
          return true;
        }
        return false;
      },
      click(e) {
        const wl = (e.target as HTMLElement).closest(".cm-wl");
        if (wl && (e.ctrlKey || e.metaKey)) {
          onLink(wl.textContent!.slice(2, -2));
          return true;
        }
        // a [text](url) in the note: same modifier as a wiki link, so a plain click still places the caret
        const ext = (e.target as HTMLElement).closest(".cm-ext");
        if (ext && (e.ctrlKey || e.metaKey)) {
          const url = /\]\(([^)\s]+)\)$/.exec(ext.textContent ?? "")?.[1];
          if (url) onExternal(url);
          return true;
        }
        return false;
      },
    }),
  ];
}
