// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

beforeAll(() => {
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  localStorage.setItem("atonacht.prefs", JSON.stringify({ onboarded: true, root: "demo", theme: "glass", accent: "blue", carryDismissed: "" }));
});
afterEach(cleanup);
const prefs = () => JSON.parse(localStorage.getItem("atonacht.prefs")!);
const files = () => JSON.parse(localStorage.getItem("atonacht.demo")!).files as Record<string, { content: string }>;

describe("Settings pages change how the app behaves", () => {
  it("default due date, carry-over mode, daily folder, density and reminders", async () => {
    const { default: App } = await import("../App");
    render(<App />);
    await screen.findByText("Today’s note");
    fireEvent.click(screen.getAllByRole("button", { name: "Settings" })[0]);

    // Tasks: new tasks get a default due date; carry over automatically
    fireEvent.click(await screen.findByRole("button", { name: /^Tasks/ }));
    fireEvent.click(await screen.findByRole("radio", { name: "Tomorrow" }));
    fireEvent.click(screen.getByRole("radio", { name: "Carry over" }));
    expect(prefs()).toMatchObject({ defaultDue: "tomorrow", carryOver: "auto" });

    // Interface: compact density
    fireEvent.click(screen.getByRole("button", { name: /^Interface/ }));
    fireEvent.click(await screen.findByRole("radio", { name: "Compact" }));
    await waitFor(() => expect(document.querySelector(".app.compact")).toBeTruthy());

    // Editor: font and live Markdown off
    fireEvent.click(screen.getByRole("button", { name: /^Editor/ }));
    fireEvent.click(await screen.findByRole("radio", { name: "Mono" }));
    fireEvent.click(screen.getByLabelText(/^Live Markdown/));
    expect(prefs()).toMatchObject({ editorFont: "mono", livePreview: false });

    // Reminders: enabling the weekly review reveals its day and time
    fireEvent.click(screen.getByRole("button", { name: /^Reminders/ }));
    fireEvent.click(await screen.findByLabelText(/^Weekly review$/));
    await screen.findByLabelText("Weekly review time");
    expect(prefs().remind.weeklyReview).toBe(true);

    // Daily note: a custom folder is used for the next daily note
    fireEvent.click(within(document.querySelector(".setlist") as HTMLElement).getByRole("button", { name: /^Daily note/ }));
    fireEvent.change(await screen.findByLabelText("Daily notes folder"), { target: { value: "Journal" } });
    fireEvent.click(screen.getByRole("button", { name: "Save folder" }));
    await waitFor(() => expect(prefs().dailyDir).toBe("Journal"));

    // Back to Home: today's note is created in the new folder, and the quick-add uses the default due date
    fireEvent.click(screen.getAllByRole("button", { name: "Back" })[0]);
    await screen.findByText("Today’s note");
    await waitFor(() => expect(Object.keys(files()).some((p) => /^Journal\/\d{4}-\d{2}-\d{2}\.md$/.test(p))).toBe(true));
    fireEvent.change(screen.getByPlaceholderText("Add a task to today"), { target: { value: "Dated by default" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);
    await waitFor(() => expect(Object.values(files()).some((f) => /- \[ \] Dated by default @due\(\d{4}-\d{2}-\d{2}\)/.test(f.content))).toBe(true));
  });
});
