import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, today } from "../lib/dates";
import { Block, renderBlocks, replaceLines, sourceLines } from "../lib/markdown";
import { toggleTask } from "../lib/tasks";
import { useNav } from "../nav";
import { useStore } from "../store";
import { isPinned, setPinned } from "../lib/frontmatter";
import { usePrefs } from "../prefs";
import { BackBar, Icon, RenameNoteDialog } from "./common";
import { LiveEditor, LiveHandle } from "./LiveEditor";

const FONTS = { sans: "Inter, system-ui, sans-serif", serif: "Fraunces, Georgia, serif", mono: "ui-monospace, SFMono-Regular, Menlo, monospace" };

export function Editor({ path }: { path: string }) {
  const { all: notes, save, remove, conflicts } = useStore();
  const { go, back, replace } = useNav();
  const [renaming, setRenaming] = useState(false);
  const stored = notes[path];
  const [text, setText] = useState(stored ?? "");
  // A note opens to be read. Editing is a choice, and the toggle says which one is on.
  const [mode, setMode] = useState<"edit" | "preview">("preview");
  const [state, setState] = useState<"saved" | "saving" | "error">("saved");
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const latest = useRef(text);
  const area = useRef<LiveHandle>(null);
  const { prefs } = usePrefs();
  latest.current = text;

  const flush = async () => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    setState("saving");
    try {
      await save(path, latest.current);
      setState("saved");
    } catch {
      dirty.current = true;
      setState("error");
    }
  };
  const change = (v: string) => {
    setText(v);
    latest.current = v;
    dirty.current = true;
    setState("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 600);
  };

  // Take in changes that arrive from sync, but never overwrite what is being typed.
  useEffect(() => {
    if (stored !== undefined && !dirty.current && stored !== latest.current) setText(stored);
  }, [stored]);
  // Save on the way out.
  useEffect(() => () => void flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Rendering the preview costs ~40 ms on a 20,000-line note, so it only happens when the preview is what you are
  // looking at: while typing in the editor there is nothing to show it in.
  const blocks = useMemo(() => (mode === "preview" ? renderBlocks(text) : []), [text, mode]);
  const hasConflict = conflicts.some((c) => c.original === path);
  const [lineEdit, setLineEdit] = useState<{ from: number; to: number } | null>(null);

  const onPreviewClick = (e: React.MouseEvent) => {
    const el = e.target as HTMLElement;
    if (el instanceof HTMLInputElement && el.dataset.line) change(toggleTask(text, Number(el.dataset.line)));
    const link = el.closest<HTMLElement>("[data-link]")?.dataset.link;
    if (link) {
      const hit = Object.keys(notes).find((p) => p.split("/").pop()!.replace(/\.md$/, "").toLowerCase() === link.toLowerCase());
      if (hit) flush().then(() => go({ name: "editor", path: hit }));
    }
  };

  // Double-click a line in the preview to edit just that line.
  const onPreviewDouble = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target instanceof HTMLInputElement || target.closest("a")) return;
    const el = target.closest<HTMLElement>("[data-block]");
    if (!el) return;
    const b = blocks[Number(el.dataset.block)];
    if (b) setLineEdit({ from: b.from, to: b.to });
  };

  const saveLine = (b: Block, value: string) => {
    setLineEdit(null);
    const next = replaceLines(latest.current, b.from, b.to, value);
    if (next !== latest.current) change(next);
  };

  const openLink = (link: string) => {
    const hit = Object.keys(notes).find((p) => p.split("/").pop()!.replace(/\.md$/, "").toLowerCase() === link.toLowerCase());
    if (hit) flush().then(() => go({ name: "editor", path: hit }));
  };
  const toggleLine = (line: number) => change(toggleTask(latest.current, line, today(), prefs.repeatFrom));

  if (stored === undefined && !dirty.current) {
    return <><BackBar /><p className="muted">This note no longer exists.</p></>;
  }
  return (
    <div className="editor">
      <BackBar
        label={text.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.replace(/\.md$/, "").split("/").slice(-1)[0]}
        sub={path.split("/").slice(0, -1).join(" / ")}
        right={<>
          <button className="ib" aria-label="Rename or move note" onClick={() => setRenaming(true)}><Icon name="edit" /></button>
          <button className="ib" aria-label={isPinned(text) ? "Unpin note" : "Pin note"} aria-pressed={isPinned(text)} onClick={() => change(setPinned(text, !isPinned(text)))}><Icon name="pin" /></button>
          <button
            className={`pill mode${mode === "edit" ? "" : " on"}`}
            aria-label={mode === "edit" ? "Preview" : "Edit"}
            aria-pressed={mode === "preview"}
            onClick={() => setMode(mode === "edit" ? "preview" : "edit")}
          >
            <Icon name="eye" size={18} />
            <span className="modelabel">{mode === "edit" ? "Preview" : "Edit"}</span>
          </button>
        </>}
      />
      {hasConflict && (
        <button className="banner warnb" onClick={() => flush().then(() => go({ name: "conflicts" }))}>
          <Icon name="alert" size={20} /><span className="grow">This note has a sync conflict</span><span className="chip">Review</span>
        </button>
      )}
      {mode === "edit" ? (
        <div className="page" style={{ ["--ed-font" as string]: FONTS[prefs.editorFont], ["--ed-size" as string]: `${prefs.editorSize}px`, ["--ed-lh" as string]: prefs.lineHeight }}>
          <LiveEditor ref={area} value={text} onChange={change} onToggle={toggleLine} onLink={openLink} live={prefs.livePreview} spellcheck={prefs.spellcheck} />
          {text.trim() === "" && <p className="muted small emptyhint">Start writing. Markdown works here: <span className="mono">#</span> for a heading, <span className="mono">- [ ]</span> for a task, <span className="mono">@due(2026-11-05)</span> for a date.</p>}
        </div>
      ) : (
        <div className="page preview" onClick={onPreviewClick} onDoubleClick={onPreviewDouble}>
          {blocks.map((b, k) =>
            lineEdit && lineEdit.from === b.from && lineEdit.to === b.to ? (
              <LineEditor key={`e${k}`} initial={sourceLines(text, b.from, b.to)} hint="Enter saves · Shift+Enter adds a line · Esc cancels" onSave={(v) => saveLine(b, v)} onCancel={() => setLineEdit(null)} />
            ) : (
              <div key={`b${k}`} data-block={k} className="pblock" dangerouslySetInnerHTML={{ __html: b.html }} />
            ),
          )}
        </div>
      )}
      <div className="toolbar" role="toolbar" aria-label="Formatting">
        <button onClick={() => area.current?.wrap("**", "**")} aria-label="Bold"><b>B</b></button>
        <button onClick={() => area.current?.lineStart("- [ ] ")} aria-label="Checkbox"><Icon name="tasks" size={18} /></button>
        <button onClick={() => area.current?.wrap(` @due(${addDays(today(), 1)})`)} aria-label="Due tomorrow"><Icon name="calendar" size={18} /></button>
        <button onClick={() => area.current?.wrap("#")} aria-label="Tag">#</button>
        <button onClick={() => area.current?.wrap("[[", "]]")} aria-label="Link note"><Icon name="link" size={18} /></button>
        <span className="sep" />
        <button className="danger" onClick={() => { if (confirm("Move this note to the trash?")) remove(path).then(back); }} aria-label="Delete note"><Icon name="x" size={18} /></button>
      </div>
      {renaming && <RenameNoteDialog path={path} onClose={() => setRenaming(false)} onDone={(to) => flush().then(() => replace({ name: "editor", path: to }))} />}
      <div className={`muted small status${state === "saved" ? " saved" : ""}`}>{state === "saved" ? "Saved" : state === "saving" ? "Saving…" : "Could not save. Retrying on next edit."}</div>
    </div>
  );
}

/** Edits one line (or one paragraph) of the preview in place. Enter saves, Shift+Enter adds a line, Escape cancels. */
function LineEditor({ initial, hint, onSave, onCancel }: { initial: string; hint: string; onSave: (v: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const settled = useRef(false);
  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    grow(el);
  }, []);
  const finish = (v: string) => {
    if (settled.current) return;
    settled.current = true;
    onSave(v);
  };
  const cancel = () => {
    if (settled.current) return;
    settled.current = true;
    onCancel();
  };
  return (
    <div className="lineedit">
      <textarea
        ref={ref}
        defaultValue={initial}
        aria-label="Edit this line"
        spellCheck
        onChange={(e) => grow(e.target)}
        onBlur={(e) => finish(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          } else if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            finish(e.currentTarget.value);
          }
        }}
      />
      <span className="muted small">{hint}</span>
    </div>
  );
}
