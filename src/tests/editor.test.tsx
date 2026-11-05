// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { buildDecorations } from "../ui/live";
import { LiveEditor } from "../ui/LiveEditor";

beforeAll(() => {
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

const count = (set: ReturnType<typeof buildDecorations>) => {
  const kinds: string[] = [];
  set.between(0, 1e6, (_f, _t, v) => void kinds.push(v.spec.widget ? "widget" : v.spec.class ?? (v.spec.inclusiveStart === undefined && v.spec.inclusiveEnd === undefined ? "replace" : "mark")));
  return kinds;
};

describe("live Markdown decorations", () => {
  const doc = "---\npinned: true\n---\n# Title\n- [ ] Call bank @due(2026-10-30) !high #home [[Thesis]]\n- [x] Done @done(2026-10-29)\n\nplain **bold** text\n```\n- [ ] not a task\n```\n";
  it("keeps the raw Markdown on every line and marks tasks and metadata", () => {
    const state = EditorState.create({ doc, selection: { anchor: doc.length - 1 } });
    const kinds = count(buildDecorations(state, true));
    expect(kinds).not.toContain("replace"); // nothing is hidden, not even away from the cursor
    expect(kinds.filter((k) => k === "widget")).toHaveLength(0); // the "- [ ]" stays as text
    expect(kinds.filter((k) => k.startsWith("cm-box"))).toHaveLength(2); // two real tasks, none inside the code fence
    expect(kinds).toContain("cm-h cm-h1");
    expect(kinds).toContain("cm-mark");
    expect(kinds).toContain("cm-fm");
    expect(kinds.filter((k) => k === "cm-chip" || k === "cm-chip cm-hi")).toHaveLength(3); // due, priority, tag
    expect(kinds).toContain("cm-wl");
    expect(kinds).toContain("cm-strong");
  });
  it("draws nothing at all when live mode is off", () => {
    expect(count(buildDecorations(EditorState.create({ doc }), false))).toHaveLength(0);
  });
});

describe("LiveEditor component", () => {
  it("reports typing, takes outside updates without echoing them, and ticks a task from its raw checkbox", async () => {
    const onChange = vi.fn();
    const onToggle = vi.fn();
    const { container, rerender } = render(<LiveEditor value={"- [ ] one\n"} onChange={onChange} onToggle={onToggle} onLink={() => {}} live spellcheck />);
    const view = EditorView.findFromDOM(container.querySelector(".cm-editor") as HTMLElement)!;
    expect(view.state.doc.toString()).toBe("- [ ] one\n");
    expect(container.querySelectorAll(".cm-box")).toHaveLength(1); // the text "- [ ]" itself is clickable
    expect(container.querySelectorAll("input.cm-check")).toHaveLength(0);

    act(() => view.dispatch({ changes: { from: 9, insert: " two" }, userEvent: "input.type" }));
    expect(onChange).toHaveBeenLastCalledWith("- [ ] one two\n");

    onChange.mockClear();
    rerender(<LiveEditor value={"- [x] one two\n"} onChange={onChange} onToggle={onToggle} onLink={() => {}} live spellcheck />);
    await waitFor(() => expect(view.state.doc.toString()).toBe("- [x] one two\n"));
    expect(onChange).not.toHaveBeenCalled(); // programmatic updates are not treated as typing

    fireEvent.mouseDown(container.querySelector(".cm-box")!);
    expect(onToggle).toHaveBeenCalledWith(0);
    expect(screen.queryByText("Note text")).toBeNull();
  });
});

describe("live editor on a very long note", () => {
  const line = (i: number) => (i % 10 === 0 ? `- [ ] Task ${i} @due(2026-11-01) !high #tag` : i % 25 === 0 ? `## Heading ${i}` : `Some text line ${i} with [[a link]] and **bold** words`);
  const doc = Array.from({ length: 20_000 }, (_, i) => line(i)).join("\n");
  const state = EditorState.create({ doc, selection: { anchor: 5 } });

  it("decorates only the lines on screen but gets the same result for them", () => {
    const from = state.doc.line(10_000).from;
    const to = state.doc.line(10_060).to;
    const whole = count(buildDecorations(state, true));
    const part = count(buildDecorations(state, true, { from, to }));
    expect(part.length).toBeGreaterThan(30);
    expect(part.length).toBeLessThan(whole.length / 50);
    // the visible lines are decorated exactly as they would be in a full pass
    const inRange = (set: ReturnType<typeof buildDecorations>) => {
      const k: string[] = [];
      set.between(from, to, (_f, _t, v) => void k.push(v.spec.widget ? "widget" : v.spec.class ?? "replace"));
      return k;
    };
    expect(inRange(buildDecorations(state, true, { from, to }))).toEqual(inRange(buildDecorations(state, true)));
  });
  it("keeps code blocks and front matter right when the screen starts below them", () => {
    const d = "---\npinned: true\n---\n```\n- [ ] inside\n```\n- [ ] outside\n- [ ] more\n";
    const s = EditorState.create({ doc: d, selection: { anchor: d.length - 1 } });
    const from = s.doc.line(7).from;
    const kinds = count(buildDecorations(s, true, { from, to: d.length }));
    expect(kinds.filter((k) => k === "cm-box")).toHaveLength(2); // the two tasks below the fence, none inside it
    const fenceLine = s.doc.line(5).from;
    expect(count(buildDecorations(s, true, { from: fenceLine, to: s.doc.line(5).to }))).toContain("cm-fence"); // a fence line seen on its own is still a fence
  });
  it("is fast: a 20,000-line note costs about the same as a short one", () => {
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) buildDecorations(state, true, { from: state.doc.line(10_000).from, to: state.doc.line(10_060).to });
    const part = (performance.now() - t0) / 20;
    const t1 = performance.now();
    buildDecorations(state, true);
    const whole = performance.now() - t1;
    console.log(`20,000-line note: visible part ${part.toFixed(1)} ms, whole note ${whole.toFixed(0)} ms per keystroke`);
    expect(part).toBeLessThan(40);
  });
});
