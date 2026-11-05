import { describe, expect, it } from "vitest";
import { Fetcher, probeCandidates, probeUrl } from "../lib/syncthing";

const fetcher = (behaviour: (url: string) => { status?: number; throw?: string }): Fetcher => async (url) => {
  const b = behaviour(url);
  if (b.throw) throw new Error(b.throw);
  const status = b.status ?? 200;
  return { ok: status < 400, status, json: async () => ({}) };
};

describe("asking each Syncthing address what it is", () => {
  it("reports a refused connection as nothing listening", async () => {
    const p = await probeUrl("http://127.0.0.1:8384", "k", fetcher(() => ({ throw: "error sending request for url (http://127.0.0.1:8384/rest/noauth/health)" })));
    expect(p.health).toBe("unreachable");
    expect(p.key).toBeUndefined();
  });

  it("reports a handshake failure as HTTPS only", async () => {
    const p = await probeUrl("http://127.0.0.1:8384", "k", fetcher(() => ({ throw: "invalid peer certificate: UnknownIssuer" })));
    expect(p.health).toBe("tls");
  });

  it("separates a running Syncthing from a wrong key", async () => {
    const ok = await probeUrl("http://127.0.0.1:8384", "k", fetcher((u) => (u.endsWith("/rest/config") ? { status: 200 } : { status: 200 })));
    expect(ok).toMatchObject({ health: "ok", key: "accepted" });
    const bad = await probeUrl("http://127.0.0.1:8384", "k", fetcher((u) => (u.endsWith("/rest/config") ? { status: 403 } : { status: 200 })));
    expect(bad).toMatchObject({ health: "ok", key: "rejected" });
  });

  it("offers the other loopback spelling and https for each", () => {
    expect(probeCandidates("http://127.0.0.1:8384")).toEqual([
      "http://127.0.0.1:8384",
      "http://localhost:8384",
      "https://127.0.0.1:8384",
      "https://localhost:8384",
    ]);
  });
});
