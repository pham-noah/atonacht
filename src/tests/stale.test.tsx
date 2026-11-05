// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ReactNode } from "react";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { PrefsProvider } from "../prefs";
import { StoreProvider, useActions, useStore } from "../store";
import type { Task } from "../lib/tasks";

const wrapper = ({ children }: { children: ReactNode }) => <PrefsProvider><StoreProvider>{children}</StoreProvider></PrefsProvider>;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("atonacht.prefs", JSON.stringify({ onboarded: true, root: "demo", theme: "solid" }));
  localStorage.removeItem("atonacht.demo");
});
afterEach(cleanup);

const ghost: Task = { id: "Gone/Note.md:3", path: "Gone/Note.md", line: 3, done: false, text: "x", title: "x", tags: [], links: [] };

describe("acting on a note that another device deleted", () => {
  it("does nothing instead of throwing when the row is clicked before the next refresh", async () => {
    const { result } = renderHook(() => ({ ...useStore(), ...useActions() }), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));

    // a task row left over from before a sync removed its note
    await expect(result.current.toggle(ghost)).resolves.toBeUndefined();
    await expect(result.current.drop(ghost)).resolves.toBeUndefined();
    await expect(result.current.updateTask(ghost, { title: "y" })).resolves.toBeUndefined();
    await expect(result.current.moveTask(ghost, { id: "done", title: "Done", kind: "done" })).resolves.toBeUndefined();
  });
});
