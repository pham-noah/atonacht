import { describe, expect, it, vi } from "vitest";
import { preloadWhenIdle } from "../lib/preload";

describe("preloadWhenIdle", () => {
  it("waits for idle time, loads everything once, and can be cancelled", async () => {
    let run: (() => void) | undefined;
    const a = vi.fn().mockResolvedValue(1);
    const b = vi.fn().mockRejectedValue(new Error("offline")); // a failure must not break anything
    preloadWhenIdle([a, b], (f) => (run = f));
    expect(a).not.toHaveBeenCalled(); // nothing happens until the app is idle
    run!();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    await Promise.resolve();

    let run2: (() => void) | undefined;
    const c = vi.fn().mockResolvedValue(1);
    const cancel = preloadWhenIdle([c], (f) => (run2 = f));
    cancel();
    run2!();
    expect(c).not.toHaveBeenCalled();
  });
});
