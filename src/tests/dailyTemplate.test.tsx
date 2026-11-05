// @vitest-environment jsdom
import { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";

const template = "# {{long_date}}\n\n## Plan\n\n## Journal\n- [ ] Morning pages\n";

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem("atonacht.prefs", JSON.stringify({ onboarded: true, root: "demo", theme: "solid" }));
  localStorage.setItem("atonacht.demo", JSON.stringify({ dirs: ["Templates"], files: { "Templates/Daily note.md": { content: template, mtime: 1 } } }));
});
afterEach(cleanup);

describe("today's note and your template", () => {
  it("starts the day from Templates/Daily note.md", async () => {
    const { PrefsProvider } = await import("../prefs");
    const { StoreProvider, useActions, useStore } = await import("../store");
    const wrapper = ({ children }: { children: ReactNode }) => <PrefsProvider><StoreProvider>{children}</StoreProvider></PrefsProvider>;
    const { result } = renderHook(() => ({ ...useStore(), ...useActions() }), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));

    const created = await result.current.openDaily("2026-11-06");
    const files = JSON.parse(localStorage.getItem("atonacht.demo")!).files as Record<string, { content: string }>;
    expect(files[created].content).toContain("## Journal"); // your template, not the built-in one
    expect(files[created].content).toContain("- [ ] Morning pages");
    expect(files[created].content).toContain("Friday, 6 November"); // {{long_date}} filled in
  });
});
