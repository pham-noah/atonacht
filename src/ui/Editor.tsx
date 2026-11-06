import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, today } from "../lib/dates";
import { Block, renderBlocks, replaceLines, sourceLines } from "../lib/markdown";
import { toggleTask } from "../lib/tasks";
import { useNav } from "../nav";
import { useStore } from "../store";
import { isPinned, setPinned } from "../lib/frontmatter";
import { usePrefs } from "../prefs";
import { buildLinks } from "../lib/backlinks";
import { attachmentMarkdown, attachmentName, attachmentPath, mimeOf } from "../lib/attachments";
import { fs } from "../lib/backend";
import { noteTitle } from "../lib/markdown";
import { BackBar, Icon, RenameNoteDialog } from "./common";
import { LiveEditor, LiveHandle } from "./LiveEditor";

const FONTS = { sans: "Inter, system-ui, sans-serif", serif: "Fraunces, Georgia, serif", mono: "ui-monospace, SFMono-Regular, Menlo, monospace" };

export function Editor({ path }: { path: string }) {
  const { all: notes, save, remove, conflicts, root } = useStore();
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
  const filePick = useRef<HTMLInputElement>(null);

  /** An image from the picker or the clipboard goes into Attachments/ and a link to it is written into the note. */
  const addAttachment = async (files: FileList | File[] | null) => {
    if (!files || !files.length || !fs.writeBytes) return;
    const parts: string[] = [];
    for (const file of Array.from(files)) {
      const path = attachmentPath(attachmentName(file.name || "pasted.png"));
      try {
        await fs.writeBytes(root, path, new Uint8Array(await file.arrayBuffer()));
        parts.push(attachmentMarkdown(path, file.name));
      } catch (e) {
        setState("error");
        console.warn("attachment failed", e);
      }
    }
    if (parts.length) change(`${text.replace(/\s*$/, "")}${text.trim() ? "\n" : ""}${parts.join("\n")}\n`);
  };
  // The preview cannot load Attachments/x.png by URL: the bytes are read through the same folder the notes use, and
  // shown as a blob URL that is released when the note closes.
  useEffect(() => {
    if (mode !== "preview" || !fs.readBytes) return;
    let cancelled = false;
    const made: string[] = [];
    void (async () => {
      const imgs = Array.from(document.querySelectorAll<HTMLImageElement>("img[data-attach]"));
      for (const img of imgs) {
        const p = img.dataset.attach;
        if (!p) continue;
        try {
          const bytes = await fs.readBytes!(root, p);
          const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: mimeOf(p) }));
          made.push(url);
          if (!cancelled) img.src = url;
        } catch {
          // a missing image keeps its alt text, which is what the note says anyway
        }
      }
    })();
    return () => {
      cancelled = true;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [blocks, mode, root]);

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
          {prefs.githubRepo && prefs.githubToken && (
            <button className="ib" aria-label="Note history" onClick={() => go({ name: "history", path })}><Icon name="clock" /></button>
          )}
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
      <input
        ref={filePick}
        type="file"
        accept="image/*"
        multiple
        hidden
        aria-label="Choose a picture to attach"
        onChange={(e) => { void addAttachment(e.target.files); e.target.value = ""; }}
      />
      {mode === "edit" ? (
        <div
          className="page"
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files ?? []);
            if (files.length) {
              e.preventDefault();
              void addAttachment(files);
            }
          }}
          style={{ ["--ed-font" as string]: FONTS[prefs.editorFont], ["--ed-size" as string]: `${prefs.editorSize}px`, ["--ed-lh" as string]: prefs.lineHeight }}>
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
        <button onClick={() => filePick.current?.click()} aria-label="Attach a picture">📎</button>
        <span className="sep" />
        <button className="danger" onClick={() => { if (confirm("Move this note to the trash?")) remove(path).then(back); }} aria-label="Delete note"><Icon name="x" size={18} /></button>
      </div>
      <Links path={path} notes={notes} onOpen={(to) => flush().then(() => go({ name: "editor", path: to }))} />
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

/**
 * What points here and what this note points at.
 *
 * A `[[link]]` is only useful if you can walk back along it; this is the walk. A link to a name no note has is shown as
 * missing rather than dropped, because that is usually how the note you meant to write gets written.
 */
function Links({ path, notes, onOpen }: { path: string; notes: Record<string, string>; onOpen: (to: string) => void }) {
  const graph = useMemo(() => {
    const titles: Record<string, string> = {};
    for (const p of Object.keys(notes)) titles[p] = noteTitle(p, notes[p]);
    return buildLinks(notes, titles);
  }, [notes]);
  const byName = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of Object.keys(notes)) {
      map.set(noteTitle(p, notes[p]).trim().toLowerCase(), p);
      map.set(p.split("/").pop()!.replace(/\.md$/i, "").toLowerCase(), p);
    }
    return map;
  }, [notes]);

  const here = graph.incoming[path] ?? [];
  const out = graph.outgoing[path] ?? [];
  if (here.length === 0 && out.length === 0) return null;

  return (
    <div className="links">
      {out.length > 0 && (
        <>
          <div className="cap">Links from this note</div>
          <div className="pills">
            {out.map((name) => {
              const to = byName.get(name.trim().toLowerCase());
              return to
                ? <button key={name} className="pill" onClick={() => onOpen(to)}>{name}</button>
                : <span key={name} className="pill missing" title="No note has this name">{name}</span>;
            })}
          </div>
        </>
      )}
      {here.length > 0 && (
        <>
          <div className="cap">Linked from</div>
          <div className="pills">
            {here.map((p) => <button key={p} className="pill" onClick={() => onOpen(p)}>{p.replace(/\.md$/i, "")}</button>)}
          </div>
        </>
      )}
    </div>
  );
}
