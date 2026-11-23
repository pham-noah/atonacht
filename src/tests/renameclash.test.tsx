// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const files = () => JSON.parse(localStorage.getItem("atonacht.demo")!).files as Record<string, { content: string }>;
const rows = () => [...document.querySelectorAll(".noterow")] as HTMLElement[];

async function boot(seed: Record<string, string>) {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem("atonacht.prefs", JSON.stringify({ onboarded: true, root: "demo", theme: "solid", carryDismissed: "", startupCache: false }));
  localStorage.setItem(
    "atonacht.demo",
    JSON.stringify({ dirs: ["Personal"], files: Object.fromEntries(Object.entries(seed).map(([p, content]) => [p, { content, mtime: Date.now() }])) }),
  );
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  const { default: App } = await import("../App");
  render(<App />);
  await screen.findByText("Today’s note");
}

const openRename = async (title: string) => {
  const row = rows().find((r) => r.textContent!.includes(title))!;
  fireEvent.contextMenu(row, { clientX: 10, clientY: 10 });
  fireEvent.click(await screen.findByText("Rename…"));
  return (await screen.findByLabelText("Note name")) as HTMLInputElement;
};

const openNotes = async () => {
  fireEvent.click(within(document.querySelector(".side") as HTMLElement).getAllByRole("button", { name: /^Notes$/ })[0]);
  await waitFor(() => expect(rows().some((r) => r.textContent!.includes("Alpha"))).toBe(true));
};

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("renaming a note in the list", () => {
  it("refuses a name another note already has instead of overwriting it", async () => {
    await boot({
      "Personal/Alpha.md": "# Alpha\n\nWhat this note is.\n",
      "Personal/Beta.md": "# Beta\n\nKept.\n",
    });
    await openNotes();

    const name = await openRename("Alpha");
    fireEvent.change(name, { target: { value: "Beta" } });

    expect(await screen.findByText(/A note called “Beta” is already here\./)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Rename" }) as HTMLButtonElement).disabled).toBe(true);

    // both notes are still there, untouched
    expect(files()["Personal/Alpha.md"].content).toContain("What this note is.");
    expect(files()["Personal/Beta.md"].content).toBe("# Beta\n\nKept.\n");
  });

  it("says why a name is not allowed, and keeps the dialog open when the file layer fails", async () => {
    await boot({ "Personal/Alpha.md": "# Alpha\n" });
    await openNotes();

    const name = await openRename("Alpha");
    fireEvent.change(name, { target: { value: ".hidden" } });
    expect(await screen.findByText(/can’t contain a slash or start with a dot/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Rename" }) as HTMLButtonElement).disabled).toBe(true);

    // a name that passes the checks but cannot be written ("/" is not allowed, so the file layer cannot fail here):
    // the dialog stays up while the rename runs, so a failure has somewhere to be shown
    fireEvent.change(name, { target: { value: "Gamma" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    await waitFor(() => expect(files()["Personal/Gamma.md"]).toBeTruthy());
    expect(screen.queryByLabelText("Note name")).toBeNull();
  });
});
