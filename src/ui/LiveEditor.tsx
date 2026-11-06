import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { Annotation, Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { liveMarkdown } from "./live";

export interface LiveHandle {
  wrap: (before: string, after?: string) => void;
  lineStart: (prefix: string) => void;
  /** Inserts text at the caret and leaves the caret after it — used when an attachment is added. */
  insert: (text: string) => void;
  focus: () => void;
}
interface Props {
  value: string;
  onChange: (v: string) => void;
  onToggle: (line: number) => void;
  onLink: (name: string) => void;
  live: boolean;
  spellcheck: boolean;
}

const External = Annotation.define<boolean>();

/** Replace only the part of the document that differs, so the cursor and scroll position survive sync updates. */
function applyText(view: EditorView, next: string) {
  const cur = view.state.doc.toString();
  if (cur === next) return;
  let a = 0;
  while (a < cur.length && a < next.length && cur[a] === next[a]) a++;
  let b = 0;
  while (b < cur.length - a && b < next.length - a && cur[cur.length - 1 - b] === next[next.length - 1 - b]) b++;
  view.dispatch({ changes: { from: a, to: cur.length - b, insert: next.slice(a, next.length - b) }, annotations: External.of(true) });
}

export const LiveEditor = forwardRef<LiveHandle, Props>(function LiveEditor(props, handle) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>();
  const cb = useRef(props);
  cb.current = props;
  const live = useRef(new Compartment());
  const attrs = useRef(new Compartment());

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: cb.current.value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          EditorView.lineWrapping,
          live.current.of(liveMarkdown(cb.current.live, (l) => cb.current.onToggle(l), (n) => cb.current.onLink(n))),
          attrs.current.of(EditorView.contentAttributes.of({ spellcheck: String(cb.current.spellcheck), "aria-label": "Note text", "aria-multiline": "true" })),
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !u.transactions.some((t) => t.annotation(External))) cb.current.onChange(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
  }, []);

  useEffect(() => {
    if (view.current) applyText(view.current, props.value);
  }, [props.value]);
  useEffect(() => {
    view.current?.dispatch({ effects: live.current.reconfigure(liveMarkdown(props.live, (l) => cb.current.onToggle(l), (n) => cb.current.onLink(n))) });
  }, [props.live]);
  useEffect(() => {
    view.current?.dispatch({ effects: attrs.current.reconfigure(EditorView.contentAttributes.of({ spellcheck: String(props.spellcheck), "aria-label": "Note text", "aria-multiline": "true" })) });
  }, [props.spellcheck]);

  useImperativeHandle(handle, () => ({
    focus: () => view.current?.focus(),
    wrap(before, after = "") {
      const v = view.current!;
      const { from, to } = v.state.selection.main;
      v.dispatch({ changes: { from, to, insert: before + v.state.sliceDoc(from, to) + after }, selection: { anchor: from + before.length, head: to + before.length } });
      v.focus();
    },
    insert(text) {
      const v = view.current!;
      const { from, to } = v.state.selection.main;
      v.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
      v.focus();
    },
    lineStart(prefix) {
      const v = view.current!;
      const line = v.state.doc.lineAt(v.state.selection.main.head);
      v.dispatch({ changes: { from: line.from, insert: prefix }, selection: { anchor: v.state.selection.main.head + prefix.length } });
      v.focus();
    },
  }));

  return <div className="live" ref={host} />;
});
