// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

beforeAll(() => {
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  localStorage.setItem("atonacht.prefs", JSON.stringify({ onboarded: true, root: "demo", theme: "glass", accent: "blue", carryDismissed: "" }));
});
afterEach(cleanup);
const files = () => JSON.parse(localStorage.getItem("atonacht.demo")!).files as Record<string, { content: string }>;
const side = () => within(document.querySelector(".side") as HTMLElement);

describe("file management", () => {
  it("renames and moves a note, renames and deletes a folder, restores from the trash", async () => {
    const { default: App } = await import("../App");
    render(<App />);
    await screen.findByText("Today’s note");

    // rename + move a note from the editor
    fireEvent.click(side().getAllByRole("button", { name: /^Notes$/ })[0]);
    fireEvent.click(await screen.findByText("Packing list", { selector: ".nt" }));
    fireEvent.click(await screen.findByRole("button", { name: "Rename or move note" }));
    fireEvent.change(await screen.findByLabelText("Note name"), { target: { value: "Trip checklist" } });
    fireEvent.change(screen.getByLabelText("Folder"), { target: { value: "Game ideas" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(files()["Game ideas/Trip checklist.md"]).toBeTruthy());
    expect(files()["Personal/Packing list.md"]).toBeUndefined();

    // rename a folder: its notes move with it
    fireEvent.click(side().getByRole("button", { name: /^Game ideas/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Rename" }));
    fireEvent.change(await screen.findByLabelText("Folder name"), { target: { value: "Ideas" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Rename" }).pop()!);
    await waitFor(() => expect(files()["Ideas/Tide roguelike.md"]).toBeTruthy());
    expect(files()["Ideas/Trip checklist.md"]).toBeTruthy();
    expect(Object.keys(files()).some((p) => p.startsWith("Game ideas/"))).toBe(false);

    // delete the folder: notes go to the trash, not away
    await screen.findByRole("heading", { name: "Ideas" });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete folder" }));
    await waitFor(() => expect(Object.keys(files()).some((p) => /^\.trash\/Ideas\/Tide roguelike \(trashed \d+\)\.md$/.test(p))).toBe(true));
    expect(files()["Ideas/Tide roguelike.md"]).toBeUndefined();

    // restore one from the trash screen
    fireEvent.click(side().getByRole("button", { name: "Trash" }));
    await screen.findByText("Tide roguelike");
    fireEvent.click(screen.getAllByRole("button", { name: "Restore" })[0]);
    await waitFor(() => expect(Object.keys(files()).filter((p) => p.startsWith("Ideas/")).length).toBe(1));

    // deleting for good removes it from the trash
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(await screen.findByRole("button", { name: "Empty trash" }));
    await screen.findByText("The trash is empty.");
    expect(Object.keys(files()).filter((p) => p.startsWith(".trash/"))).toEqual([]);
  });
});
