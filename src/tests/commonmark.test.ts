import { describe, expect, it } from "vitest";
import { renderBlocks, renderMarkdown } from "../lib/markdown";

// CommonMark corners the preview used to get wrong. Each case is the spec's own example trimmed to one line.
describe("CommonMark the preview used to get wrong", () => {
  it("keeps a fenced block together instead of one element per line", () => {
    const html = renderMarkdown("```js\nconst a = 1;\nreturn a < 2;\n```\n");
    expect(html).toBe('<pre class="language-js"><code>const a = 1;\nreturn a &lt; 2;</code></pre>');
    expect(renderBlocks("```\nx\n```\n")).toHaveLength(1);
  });

  it("hands the whole fence to the line map, so editing it rewrites both fences", () => {
    const [first, block] = renderBlocks("intro\n\n```\ncode\n```\n");
    expect(first.from).toBe(0);
    expect(block).toMatchObject({ from: 2, to: 4 });
  });

  it("closes a fence that never ends rather than dropping its lines", () => {
    expect(renderMarkdown("```\nstill open\n")).toBe("<pre><code>still open</code></pre>");
  });

  it("reads a line of = or - under text as a heading", () => {
    expect(renderMarkdown("Title\n=====\n")).toBe("<h1>Title</h1>");
    expect(renderMarkdown("Sub\n---\n")).toBe("<h2>Sub</h2>");
    expect(renderMarkdown("One\ntwo\n===\n")).toBe("<h1>One two</h1>");
  });

  it("still draws a rule when no text sits above it", () => {
    expect(renderMarkdown("---\n")).toContain("<hr");
  });

  it("renders h4 to h6 and drops a closing run of hashes", () => {
    expect(renderMarkdown("#### Deep\n")).toBe("<h4>Deep</h4>");
    expect(renderMarkdown("###### Deeper\n")).toBe("<h6>Deeper</h6>");
    expect(renderMarkdown("## Closed ##\n")).toBe("<h2>Closed</h2>");
  });

  it("nests a quoted quote instead of printing a second > sign", () => {
    expect(renderMarkdown("> > inner\n")).toBe("<blockquote><blockquote>inner</blockquote></blockquote>");
    expect(renderMarkdown("> outer\n")).toBe("<blockquote>outer</blockquote>");
    // the outer line stays outside the inner quote it introduced
    expect(renderMarkdown("> outer\n> > inner\n")).toBe("<blockquote>outer<blockquote>inner</blockquote></blockquote>");
  });

  it("takes two trailing spaces or a backslash as a line break", () => {
    expect(renderMarkdown("one  \ntwo\n")).toBe("<p>one<br>two</p>");
    expect(renderMarkdown("one\\\ntwo\n")).toBe("<p>one<br>two</p>");
    expect(renderMarkdown("one\ntwo\n")).toBe("<p>one two</p>");
  });

  it("lets a backslash escape markup", () => {
    expect(renderMarkdown("\\*not italic\\*\n")).toBe("<p>*not italic*</p>");
    expect(renderMarkdown("\\# not a tag\n")).toBe("<p># not a tag</p>");
  });

  it("knows __strong__ and _em_, and leaves snake_case alone", () => {
    expect(renderMarkdown("__strong__\n")).toBe("<p><strong>strong</strong></p>");
    expect(renderMarkdown("_em_\n")).toBe("<p><em>em</em></p>");
    expect(renderMarkdown("call set_preference_now please\n")).toBe("<p>call set_preference_now please</p>");
  });

  it("draws ~~struck~~ text", () => {
    expect(renderMarkdown("~~old plan~~\n")).toBe("<p><del>old plan</del></p>");
  });

  it("keeps what is inside backticks literal", () => {
    expect(renderMarkdown("`a * b #tag`\n")).toBe("<p><code>a * b #tag</code></p>");
  });

  it("links an address in angle brackets", () => {
    expect(renderMarkdown("<https://example.com/x>\n")).toContain('data-href="https://example.com/x"');
    expect(renderMarkdown("<me@example.com>\n")).toContain('href="mailto:me@example.com"');
    expect(renderMarkdown("<script>\n")).toBe("<p>&lt;script&gt;</p>");
  });
});
