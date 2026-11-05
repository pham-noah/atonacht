import { describe, expect, it } from "vitest";
import { Fetcher, probeCandidates, probeUrl, scanCandidates, scanSyncthing } from "../lib/syncthing";

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

describe("scanning this device for a listening Syncthing", () => {
  it("covers loopback, IPv6 and the LAN addresses on both ports", () => {
    const list = scanCandidates("http://127.0.0.1:8384", ["192.168.1.50"]);
    expect(list).toContain("http://[::1]:8384");
    expect(list).toContain("http://192.168.1.50:8384");
    expect(list).toContain("http://127.0.0.1:8385");
    expect(new Set(list).size).toBe(list.length); // no duplicates
  });

  it("keeps only the addresses that answered", async () => {
    const fetcher: Fetcher = async (url) => {
      if (url.startsWith("http://192.168.1.50:8384")) return { ok: true, status: 200, json: async () => ({}) };
      throw new Error("error sending request for url (" + url + ")");
    };
    const hits = await scanSyncthing("http://127.0.0.1:8384", ["192.168.1.50"], fetcher);
    expect(hits.map((h) => h.url)).toEqual(["http://192.168.1.50:8384"]);
  });
});
