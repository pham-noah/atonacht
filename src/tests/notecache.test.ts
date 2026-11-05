// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createIdbCache } from "../lib/noteCache";

/** A factory whose first open fails, then behaves like the real one: the browser can refuse the first request and allow the next. */
function flakyFactory(): { factory: IDBFactory; opens: () => number } {
  const real = new IDBFactory();
  let opens = 0;
  const factory = {
    open(...args: Parameters<IDBFactory["open"]>) {
      opens++;
      if (opens === 1) {
        const req = { error: new Error("the browser refused the first open"), onsuccess: null, onerror: null, onupgradeneeded: null } as unknown as IDBOpenDBRequest;
        setTimeout(() => req.onerror?.(new Event("error") as never), 0);
        return req;
      }
      return real.open(...args);
    },
  } as unknown as IDBFactory;
  return { factory, opens: () => opens };
}

describe("the startup note cache", () => {
  it("tries again after a failed open instead of staying dead for the session", async () => {
    const { factory, opens } = flakyFactory();
    const cache = createIdbCache(factory);
    await expect(cache.load("/notes")).rejects.toBeTruthy(); // first attempt: IndexedDB says no
    expect(opens()).toBe(1);

    await cache.put("/notes", { "a.md": { content: "hello", mtime: 1, size: 5 } }); // second attempt: it says yes
    expect(opens()).toBe(2);
    expect(await cache.load("/notes")).toEqual({ "a.md": { content: "hello", mtime: 1, size: 5 } });
  });

  it("keeps notes of one folder apart from another's", async () => {
    const cache = createIdbCache(new IDBFactory());
    await cache.put("/one", { "a.md": { content: "1", mtime: 1, size: 1 } });
    await cache.put("/two", { "a.md": { content: "2", mtime: 2, size: 1 } });
    expect((await cache.load("/one"))["a.md"].content).toBe("1");
    expect((await cache.load("/two"))["a.md"].content).toBe("2");
    await cache.clear("/one");
    expect(await cache.load("/one")).toEqual({});
    expect((await cache.load("/two"))["a.md"].content).toBe("2");
  });
});
