// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const side = () => document.querySelector(".side") as HTMLElement;
const page = () => within(document.querySelector(".content") as HTMLElement);
const rows = () => [...document.querySelectorAll(".noterow")] as HTMLElement[];

async function boot(seed: Record<string, string>) {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem("atonacht.prefs", JSON.stringify({ onboarded: true, root: "demo", theme: "solid", startupCache: false }));
  localStorage.setItem(
    "atonacht.demo",
    JSON.stringify({ dirs: ["Notes"], files: Object.fromEntries(Object.entries(seed).map(([p, content]) => [p, { content, mtime: Date.now() }])) }),
  );
  // a phone-sized window: the sidebar lives in a drawer, so the page keeps its own search field
  window.matchMedia = ((q: string) => ({ matches: !q.includes("min-width: 900px"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  const { default: App } = await import("../App");
  render(<App />);
  await screen.findByText("Today’s note");
  fireEvent.click([...side().querySelectorAll(".navitem")].find((e) => /^Notes/.test((e.textContent ?? "").trim())) as HTMLElement);
  await waitFor(() => expect(rows().length).toBeGreaterThan(0));
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("why a search result is a result", () => {
  it("shows the line that matched, with the term marked, even when it is far down the note", async () => {
    // 39 lines of meeting notes, and the one line that mentions rent on line 41
    const body = Array.from({ length: 39 }, (_, i) => `line ${i + 1} of the meeting notes`).join("\n");
    await boot({ "Notes/Meeting.md": `# Meeting\n\n${body}\n- [ ] Pay rent by Friday\n` });

    fireEvent.change(page().getByLabelText("Search notes"), { target: { value: "rent" } });
    await waitFor(() => expect(rows()).toHaveLength(1));

    const row = rows()[0];
    expect(row.querySelector("mark")!.textContent).toBe("rent");
    expect(row.textContent).toContain("- [ ] Pay rent by Friday"); // the matched line itself
    expect(row.textContent).not.toContain("line 1 of the meeting notes"); // not the note's opening line
  });

  it("falls back to the opening line when only the file name matched", async () => {
    await boot({ "Notes/Rent ledger.md": "# Ledger\n\nnothing about money in this note\n" });
    fireEvent.change(page().getByLabelText("Search notes"), { target: { value: "rent" } });
    await waitFor(() => expect(rows()).toHaveLength(1));

    const row = rows()[0];
    expect(row.querySelector("mark")).toBeNull();
    expect(row.textContent).toContain("nothing about money in this note");
  });

  it("matches case-insensitively and marks the note's own spelling", async () => {
    await boot({ "Notes/Bills.md": "# Bills\n\nfirst line\n\nREMEMBER the RENT\n" });
    fireEvent.change(page().getByLabelText("Search notes"), { target: { value: "rent" } });
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0].querySelector("mark")!.textContent).toBe("RENT");
    expect(rows()[0].textContent).toContain("REMEMBER the RENT");
  });
});
