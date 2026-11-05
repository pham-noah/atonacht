// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

beforeAll(() => {
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  localStorage.setItem("atonacht.prefs", JSON.stringify({ onboarded: true, root: "demo", theme: "solid", accent: "teal", carryDismissed: "" }));
});
afterEach(cleanup);
const files = () => JSON.parse(localStorage.getItem("atonacht.demo")!).files as Record<string, { content: string }>;
const side = () => within(document.querySelector(".side") as HTMLElement);

describe("Atonacht app: pins, templates, weekly review", () => {
  it("stamps @done, pins a note, adds templates and runs the weekly review", { timeout: 30000 }, async () => {
    const { default: App } = await import("../App");
    render(<App />);
    await screen.findByText("Today’s note");

    // quick add, then check it off: the file gets @done(date)
    fireEvent.change(screen.getByPlaceholderText("Add a task to today"), { target: { value: "Write tests" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);
    const box = await screen.findByLabelText("Complete: Write tests");
    fireEvent.click(box);
    await waitFor(() => expect(Object.values(files()).some((f) => /- \[x\] Write tests @done\(\d{4}-\d{2}-\d{2}\)/.test(f.content))).toBe(true));

    // pin a note from the editor
    fireEvent.click(side().getAllByRole("button", { name: /^Notes$/ })[0]);
    fireEvent.click(await screen.findByText("Tide roguelike", { selector: ".nt" }));
    fireEvent.click(await screen.findByRole("button", { name: "Pin note" }));
    await waitFor(() => expect(files()["Game ideas/Tide roguelike.md"].content.startsWith("---\npinned: true\n---\n")).toBe(true));

    // Library shows it, and starter templates can be added
    fireEvent.click(side().getByRole("button", { name: /^Library/ }));
    await screen.findByText("Templates");
    expect(screen.getAllByText("Tide roguelike").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Add starter templates" }));
    await screen.findByText("Daily note");
    expect(files()["Templates/Daily note.md"]).toBeTruthy();
    // template notes are not counted as tasks
    expect(Object.keys(files()).filter((p) => p.startsWith("Templates/")).length).toBe(3);

    // weekly review: move the overdue task to next week, then finish
    fireEvent.click(side().getByRole("button", { name: /Weekly review/ }));
    await screen.findByText("What got done");
    fireEvent.click(screen.getByRole("button", { name: "Next: still open" }));
    await screen.findByText("What’s still open?");
    const before = (await screen.findAllByRole("button", { name: "Next week" })).length;
    expect(before).toBeGreaterThanOrEqual(1); // how many more depends on the weekday the test runs on
    fireEvent.click(screen.getAllByRole("button", { name: "Next week" })[0]); // sorted by due date: "Send invoice" is first
    await waitFor(() => expect(screen.queryAllByRole("button", { name: "Next week" })).toHaveLength(before - 1));
    fireEvent.click(screen.getByRole("button", { name: "Next: plan the week" }));
    await screen.findByText("Plan next week", { selector: "h1" });
    expect(screen.getByText("Send invoice")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Finish review" }));
    await screen.findByText("Today’s note");
    const review = Object.entries(files()).find(([p]) => p.startsWith("Weekly reviews/"));
    expect(review?.[1].content).toContain("## Done (1)");
    expect(review?.[1].content).toContain("- Write tests");
  });
});
