import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../lib/markdown";
import { externalHref, noteFor, noteIndex } from "../lib/links";

describe("links that leave the app", () => {
  it("opens http, https and mailto, and nothing else", () => {
    expect(externalHref("https://google.com")).toBe("https://google.com");
    expect(externalHref("http://example.org/a?b=1")).toBe("http://example.org/a?b=1");
    expect(externalHref("mailto:noah@example.org")).toBe("mailto:noah@example.org");
    expect(externalHref("  https://google.com  ")).toBe("https://google.com");
    // a note arrives from another device: these must never run or be handed to the system
    expect(externalHref("javascript:alert(1)")).toBeNull();
    expect(externalHref("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(externalHref("file:///C:/Windows/System32/")).toBeNull();
    expect(externalHref("Notes/Other.md")).toBeNull();
    expect(externalHref("/etc/passwd")).toBeNull();
    expect(externalHref("https://google.com/a b")).toBeNull();
    expect(externalHref("")).toBeNull();
  });

  it("renders [text](url) in the preview as a link with the URL on it", () => {
    const html = renderMarkdown("see [Google](https://google.com) for more");
    expect(html).toContain('data-href="https://google.com"');
    expect(html).toContain(">Google</a>");
  });

  it("leaves a link with a scheme we do not open as the text it was written as", () => {
    const html = renderMarkdown("[click me](javascript:alert(1))");
    expect(html).not.toContain("data-href");
    expect(html).not.toContain("<a");
    expect(html).toContain("[click me](javascript:alert(1))");
  });

  it("keeps an image an image", () => {
    const html = renderMarkdown("![a cat](Attachments/cat.png)");
    expect(html).toContain('data-attach="Attachments/cat.png"');
    expect(html).not.toContain("data-href");
  });
});

describe("links that stay in the folder", () => {
  const notes = {
    "Thesis/Outline.md": "# Thesis outline\n\nBody.",
    "Daily notes/2026-11-05.md": "# Today\n",
  };
  const titles = { "Thesis/Outline.md": "Thesis outline", "Daily notes/2026-11-05.md": "Today" };

  it("finds a note by file name and by title", () => {
    const index = noteIndex(Object.keys(notes), titles);
    expect(noteFor("Outline", index)).toBe("Thesis/Outline.md");
    expect(noteFor("thesis OUTLINE", index)).toBe("Thesis/Outline.md"); // by title, case-insensitive
    expect(noteFor("2026-11-05", index)).toBe("Daily notes/2026-11-05.md");
    expect(noteFor("Nothing like this", index)).toBeUndefined();
  });
});
