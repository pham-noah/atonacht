import { describe, expect, it } from "vitest";
import { alternateLoopback, describeSyncError } from "../lib/syncthing";

describe("explaining a Syncthing failure", () => {
  it("says nothing is listening when the transport fails on this device", () => {
    const msg = describeSyncError(
      "error sending request for url (http://127.0.0.1:8384/rest/system/connections)",
      "http://127.0.0.1:8384",
    );
    expect(msg).toContain("Nothing answered at http://127.0.0.1:8384");
    expect(msg).toContain("Syncthing-Fork"); // the phone case is called out
    expect(msg).toContain("192.168.1.20"); // and how to point at another device
  });

  it("distinguishes a rejected key from an unreachable host", () => {
    expect(describeSyncError("Syncthing rejected the API key.", "http://127.0.0.1:8384")).toContain("did not accept that key");
    expect(describeSyncError("Syncthing answered 403 for /rest/config.", "http://x:8384")).toContain("did not accept that key");
  });

  it("explains a remote host differently from loopback", () => {
    const msg = describeSyncError("error sending request for url (http://192.168.1.20:8384/rest/config)", "http://192.168.1.20:8384");
    expect(msg).toContain("same network");
    expect(msg).not.toContain("Syncthing-Fork");
  });

  it("names the other spelling of loopback", () => {
    expect(alternateLoopback("http://127.0.0.1:8384")).toBe("http://localhost:8384");
    expect(alternateLoopback("http://localhost:8384")).toBe("http://127.0.0.1:8384");
    expect(alternateLoopback("http://192.168.1.20:8384")).toBeNull();
  });
});
