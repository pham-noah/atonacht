// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const demo = () => JSON.parse(localStorage.getItem("atonacht.demo")!) as { files: Record<string, { content: string }> };

async function boot() {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem("atonacht.prefs", JSON.stringify({ onboarded: true, root: "demo", theme: "solid", startupCache: false }));
  localStorage.setItem("atonacht.demo", JSON.stringify({ dirs: [], files: { "Note.md": { content: "# Note\n\nSome text.\n", mtime: Date.now() } } }));
  window.matchMedia = ((q: string) => ({ matches: !q.includes("min-width: 900px"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  const { default: App } = await import("../App");
  render(<App />);
  await screen.findByText("Today’s note");
  // the sidebar and the tab bar can both offer "Notes"; the tab bar is the one that navigates here
  fireEvent.click(screen.getAllByRole("button", { name: /^Notes$/ })[0]);
  fireEvent.click(await screen.findByText("Note", { selector: ".nt" }));
  await screen.findByRole("button", { name: "Edit" }); // a note opens in preview
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("attaching a picture", () => {
  it("writes the bytes into Attachments/ and links them from the note", async () => {
    await boot();
    const png = new File([new Uint8Array([137, 80, 78, 71])], "shot.png", { type: "image/png" });
    const input = screen.getByLabelText("Choose a picture to attach") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [png] } });

    await waitFor(() => {
      const note = demo().files["Note.md"].content;
      expect(note).toMatch(/!\[shot\.png\]\(Attachments\/\d{4}-\d{2}-\d{2}-\d{6}-shot\.png\)/);
    });
    // the picture itself is in the folder, not only referenced
    const saved = Object.keys(demo().files).find((p) => /^Attachments\/.*shot\.png$/.test(p));
    expect(saved).toBeTruthy();
  });

  it("shows the picture in the preview by reading the bytes back", async () => {
    // jsdom has no object URLs; the test only needs to know one was made from the file's bytes
    const made: string[] = [];
    URL.createObjectURL = vi.fn(() => {
      const url = `blob:test/${made.length}`;
      made.push(url);
      return url;
    }) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;

    vi.resetModules();
    localStorage.clear();
    localStorage.setItem("atonacht.prefs", JSON.stringify({ onboarded: true, root: "demo", theme: "solid", startupCache: false }));
    localStorage.setItem("atonacht.demo", JSON.stringify({
      dirs: [],
      files: {
        "Note.md": { content: "# Note\n\n![shot](Attachments/shot.png)\n", mtime: Date.now() },
        "Attachments/shot.png": { content: `data:image/png;base64,${btoa("PNG")}`, mtime: Date.now() },
      },
    }));
    window.matchMedia = ((q: string) => ({ matches: !q.includes("min-width: 900px"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    const { default: App } = await import("../App");
    render(<App />);
    await screen.findByText("Today’s note");
    // the sidebar and the tab bar can both offer "Notes"; the tab bar is the one that navigates here
  fireEvent.click(screen.getAllByRole("button", { name: /^Notes$/ })[0]);
    fireEvent.click(await screen.findByText("Note", { selector: ".nt" }));

    await waitFor(() => {
      const img = document.querySelector("img[data-attach]") as HTMLImageElement | null;
      expect(img).toBeTruthy();
      expect(img!.src).toMatch(/^blob:test\//);
    });
  });
});
