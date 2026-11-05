// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const files = () => JSON.parse(localStorage.getItem("atonacht.demo")!).files as Record<string, { content: string }>;
const side = () => within(document.querySelector(".side") as HTMLElement);
const prefs = (extra: Record<string, unknown> = {}) => JSON.stringify({ onboarded: true, root: "demo", theme: "solid", carryDismissed: "", ...extra });

async function boot(seed: Record<string, string>) {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem("atonacht.prefs", prefs());
  localStorage.setItem("atonacht.demo", JSON.stringify({ dirs: Object.keys(seed), files: Object.fromEntries(Object.entries(seed).map(([p, content]) => [p, { content, mtime: Date.now() }])) }));
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  const { default: App } = await import("../App");
  render(<App />);
  await screen.findByText("Today’s note");
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("calendar shows the day's own tasks", () => {
  it("lists tasks written in the selected day's note, not only the ones with a due date", async () => {
    // seed the real day: a hardcoded date quietly becomes "yesterday" when a run crosses midnight
    const { today } = await import("../lib/dates");
    const t = today();
    await boot({
      [`Daily notes/${t}.md`]: `# Today\n\n## Plan\n- [ ] Take a shower\n- [ ] Buy milk @due(${t})\n\n## Notes\n## Done\n`,
      "Personal/Packing list.md": `- [ ] Passport @due(${t})\n`,
    });
    fireEvent.click(side().getAllByRole("button", { name: /^Calendar/ })[0]);
    // today is the seeded day in the test's clock; the card is for whatever day is selected
    const card = (await screen.findByRole("button", { name: /Open note|Create note/ })).closest("section")!;
    // the folder is read asynchronously: wait for the day's tasks instead of assuming they are already parsed
    expect(await within(card).findByText("Take a shower")).toBeTruthy(); // no due date, but it lives in that note
    expect(await within(card).findByText("Buy milk")).toBeTruthy();
    expect(await within(card).findByText("Passport")).toBeTruthy(); // and tasks due that day from other notes
  });
});

describe("editing one line in the preview", () => {
  it("opens the source line on double-click and writes just that line back", async () => {
    const original = "# Thesis outline\n\nIntro paragraph.\n\n- [ ] Draft methods @due(2026-11-05)\n- [ ] Email supervisor\n";
    await boot({ "Thesis/Outline.md": original });

    fireEvent.click(side().getAllByRole("button", { name: /^Notes$/ })[0]);
    fireEvent.click(await screen.findByText("Thesis outline", { selector: ".nt" }));
    await screen.findByRole("button", { name: "Preview" });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    const line = await screen.findByText("Email supervisor");
    fireEvent.doubleClick(line);

    const box = await screen.findByLabelText("Edit this line");
    expect((box as HTMLTextAreaElement).value).toBe("- [ ] Email supervisor");
    fireEvent.change(box, { target: { value: "- [x] Email supervisor @done(2026-11-04)" } });
    fireEvent.keyDown(box, { key: "Enter" });

    await waitFor(() => expect(files()["Thesis/Outline.md"].content).toContain("- [x] Email supervisor @done(2026-11-04)"));
    // everything else is untouched, including the newline layout
    expect(files()["Thesis/Outline.md"].content).toBe(original.replace("- [ ] Email supervisor", "- [x] Email supervisor @done(2026-11-04)"));
    expect(screen.queryByLabelText("Edit this line")).toBeNull();
  });

  it("cancels with Escape without touching the note", async () => {
    const original = "# Notes\n\nOne line.\n";
    await boot({ "Personal/Notes.md": original });
    fireEvent.click(side().getAllByRole("button", { name: /^Notes$/ })[0]);
    fireEvent.click(await screen.findByText("Notes", { selector: ".nt" }));
    fireEvent.click(await screen.findByRole("button", { name: "Preview" }));

    const line = await screen.findByText("One line.");
    fireEvent.doubleClick(line);
    const box = await screen.findByLabelText("Edit this line");
    fireEvent.change(box, { target: { value: "Changed." } });
    fireEvent.keyDown(box, { key: "Escape" });
    await waitFor(() => expect(screen.queryByLabelText("Edit this line")).toBeNull());
    expect(files()["Personal/Notes.md"].content).toBe(original);
  });
});
