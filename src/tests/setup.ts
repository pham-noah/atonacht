import "fake-indexeddb/auto"; // jsdom has no IndexedDB
import { beforeAll } from "vitest";
import { configure } from "@testing-library/react";

// waitFor gives up after one second by default. These are whole-app integration tests: when four of them mount at once
// on a busy machine, a second is not enough and a passing test fails at random. Five seconds is still a real limit.
configure({ asyncUtilTimeout: 5000 });

// The startup cache is per notes folder ("demo" in almost every test), so notes cached by one test file were replayed
// at the start of the next one - before refresh() corrected it. Once per file, so a file can still test the cache itself.
beforeAll(async () => {
  if (!globalThis.indexedDB) return;
  await new Promise<void>((done) => {
    const req = indexedDB.deleteDatabase("atonacht-cache-v1");
    req.onsuccess = req.onerror = req.onblocked = () => done();
  });
});
// CodeMirror measures text with browser APIs that jsdom doesn't implement. These stubs let it run in tests.
if (typeof document !== "undefined") {
  const rect = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON() {} };
  const rects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => rect as DOMRect;
  Range.prototype.getClientRects = rects;
  Element.prototype.getClientRects = rects;
  document.elementFromPoint = (() => null) as typeof document.elementFromPoint;
}

// Older jsdom builds lack these; the backup tests read files as bytes.
if (typeof Blob !== "undefined" && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function () {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as ArrayBuffer);
      r.onerror = () => rej(r.error);
      r.readAsArrayBuffer(this);
    });
  };
}
