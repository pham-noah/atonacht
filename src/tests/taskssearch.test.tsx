// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const side = () => within(document.querySelector(".side") as HTMLElement);
const rows = () => [...document.querySelectorAll(".card .row")].map((r) => r.textContent ?? "");

async function boot(seed: Record<string, string>, prefs: Record<string, unknown> = {}) {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem("atonacht.prefs", JSON.stringify({ onboarded: true, root: "demo", theme: "solid", startupCache: false, carryDismissed: "", ...prefs }));
  localStorage.setItem("atonacht.demo", JSON.stringify({ dirs: [], files: Object.fromEntries(Object.entries(seed).map(([p, content]) => [p, { content, mtime: Date.now() }])) }));
  window.matchMedia = ((q: string) => ({ matches: !q.includes("min-width: 900px"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  const { default: App } = await import("../App");
  render(<App />);
  await screen.findByText("Today’s note");
  fireEvent.click(side().getAllByRole("button", { name: /^All tasks/ })[0]);
  await screen.findByText("All tasks", { selector: "h1" });
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("the task search", () => {
  it("narrows the list by a word in the title, keeping the tag pills in force", async () => {
    const { today } = await import("../lib/dates");
    await boot({
      "Personal/Errands.md": `# Errands\n\n- [ ] Pay rent #home\n- [ ] Renew bus pass #home\n- [ ] Buy milk #shopping @due(${today()})\n`,
    });

    expect(rows()).toHaveLength(3);
    fireEvent.change(screen.getByLabelText("Search tasks"), { target: { value: "rent" } });
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toContain("Pay rent");

    // a tag typed in the search box filters too, and says what it understood
    fireEvent.change(screen.getByLabelText("Search tasks"), { target: { value: "#shopping" } });
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toContain("Buy milk");
    expect(screen.getByText(/tag #shopping · 1 task/)).toBeTruthy();

    // a tag pill still applies on top of the search: two filters at once leave nothing
    fireEvent.click(screen.getByRole("button", { name: "#home" }));
    await waitFor(() => expect(screen.getByText("Nothing matches this search.")).toBeTruthy());
  });
});

describe("the Done list", () => {
  it("pages past 100 rows instead of stopping dead there", async () => {
    const { today } = await import("../lib/dates");
    const done = Array.from({ length: 120 }, (_, i) => `- [x] Finished task ${i} @done(${today()})`).join("\n");
    await boot({ "Personal/Archive.md": `# Archive\n\n${done}\n` });

    fireEvent.click(screen.getByRole("button", { name: /^Done/ }));
    await waitFor(() => expect(rows()).toHaveLength(100));

    const more = screen.getByRole("button", { name: "Show 20 more" });
    fireEvent.click(more);
    await waitFor(() => expect(rows()).toHaveLength(120));
    expect(screen.getByText("Finished task 119")).toBeTruthy(); // the oldest row is reachable
    expect(screen.queryByRole("button", { name: /^Show \d+ more$/ })).toBeNull();
  });
});
