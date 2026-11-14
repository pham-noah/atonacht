// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const files = () => JSON.parse(localStorage.getItem("atonacht.demo")!).files as Record<string, { content: string }>;
const side = () => within(document.querySelector(".side") as HTMLElement);

async function boot(seed: Record<string, string>, dirs: string[] = ["Personal"]) {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem("atonacht.prefs", JSON.stringify({ onboarded: true, root: "demo", theme: "solid", carryDismissed: "" }));
  localStorage.setItem("atonacht.demo", JSON.stringify({ dirs, files: Object.fromEntries(Object.entries(seed).map(([p, content]) => [p, { content, mtime: Date.now() }])) }));
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  const { default: App } = await import("../App");
  render(<App />);
  await screen.findByText("Today’s note");
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("renaming a note", () => {
  it("keeps the notes that link to it pointing at it, and Undo puts everything back", async () => {
    await boot({
      "Personal/Alpha.md": "# Alpha\n\nWhat this note is.\n",
      "Personal/Beta.md": "# Beta\n\nSee [[Alpha]] and [[Alpha|the other one]].\n",
    });

    fireEvent.click(side().getAllByRole("button", { name: /^Notes$/ })[0]);
    fireEvent.click(await screen.findByText("Alpha", { selector: ".nt" }));
    fireEvent.click(await screen.findByRole("button", { name: "Rename or move note" }));
    fireEvent.change(await screen.findByLabelText("Note name"), { target: { value: "Gamma" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // the file moved, and every link that named it now names the new file — alias kept
    await waitFor(() => expect(files()["Personal/Gamma.md"]).toBeTruthy());
    expect(files()["Personal/Beta.md"].content).toContain("See [[Gamma]] and [[Gamma|the other one]].");
    expect(files()["Personal/Beta.md"].content).not.toContain("[[Alpha");

    // the snack says what else was touched
    expect(await screen.findByText(/Renamed to “Gamma” · 1 note updated/)).toBeTruthy();

    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(files()["Personal/Alpha.md"]).toBeTruthy());
    expect(files()["Personal/Gamma.md"]).toBeUndefined();
    expect(files()["Personal/Beta.md"].content).toBe("# Beta\n\nSee [[Alpha]] and [[Alpha|the other one]].\n");
  });

  it("moves a note to another folder without rewriting a link that still resolves", async () => {
    await boot({
      "Personal/Alpha.md": "# Alpha\n\nWhat this note is.\n",
      "Personal/Beta.md": "# Beta\n\nSee [[Alpha]].\n",
    }, ["Personal", "Archive"]);
    fireEvent.click(side().getAllByRole("button", { name: /^Notes$/ })[0]);
    fireEvent.click(await screen.findByText("Alpha", { selector: ".nt" }));
    fireEvent.click(await screen.findByRole("button", { name: "Rename or move note" }));
    fireEvent.change(await screen.findByLabelText("Folder"), { target: { value: "Archive" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(files()["Archive/Alpha.md"]).toBeTruthy());
    expect(files()["Personal/Alpha.md"]).toBeUndefined();
    // the name did not change, so the link that names it still resolves and is left exactly as written
    expect(files()["Personal/Beta.md"].content).toBe("# Beta\n\nSee [[Alpha]].\n");
  });
});
