export interface SyncDevice { id: string; name: string; connected: boolean }
export interface SyncFolder { id: string; label: string; path: string; state: string; completion: number }
export interface SyncStatus { devices: SyncDevice[]; folders: SyncFolder[] }
export type Fetcher = (url: string, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Reads Syncthing's local REST API (the same one its web page uses). Needs the API key from its settings. */
export async function fetchSyncStatus(baseUrl: string, apiKey: string, fetcher: Fetcher): Promise<SyncStatus> {
  const base = baseUrl.replace(/\/+$/, "");
  const get = async (path: string) => {
    const r = await fetcher(base + path, { headers: { "X-API-Key": apiKey } });
    if (r.status === 401 || r.status === 403) throw new Error("Syncthing rejected the API key.");
    if (!r.ok) throw new Error(`Syncthing answered ${r.status} for ${path}.`);
    return r.json();
  };
  const [config, conns, sys] = await Promise.all([get("/rest/config"), get("/rest/system/connections"), get("/rest/system/status")]);
  const devices: SyncDevice[] = (config.devices ?? [])
    .filter((d: { deviceID: string }) => d.deviceID !== sys.myID)
    .map((d: { deviceID: string; name?: string }) => ({
      id: d.deviceID,
      name: d.name || d.deviceID.slice(0, 7),
      connected: !!conns.connections?.[d.deviceID]?.connected,
    }));
  const folders: SyncFolder[] = await Promise.all(
    (config.folders ?? []).map(async (f: { id: string; label?: string; path: string }) => {
      const s = await get(`/rest/db/status?folder=${encodeURIComponent(f.id)}`);
      const total = s.globalBytes ?? 0;
      const completion = total > 0 ? Math.max(0, Math.min(100, Math.round(100 - ((s.needBytes ?? 0) / total) * 100))) : 100;
      return { id: f.id, label: f.label || f.id, path: f.path, state: s.state || "unknown", completion };
    }),
  );
  return { devices, folders };
}

/**
 * Turns whatever the transport said into something a reader can act on.
 *
 * The HTTP plugin reports failures as reqwest messages ("error sending request for url (...)"), which says nothing
 * about whether Syncthing is not running, the key is wrong, or the address is another machine's.
 */
export function describeSyncError(raw: string, url: string): string {
  const u = url.replace(/\/+$/, "");
  const loopback = /(127\.0\.0\.1|localhost|\[::1\])/.test(u);
  if (/rejected the API key|unauthori[sz]ed|forbidden|\b401\b|\b403\b/i.test(raw)) {
    return `Syncthing answered at ${u}, but it did not accept that key. Copy the API key again from Settings → General.`;
  }
  if (/error sending request|dns error|connection refused|Connect\(|os error 1\d{4}|timed? ?out|network is unreachable/i.test(raw)) {
    return loopback
      ? `Nothing answered at ${u}. On this device, start Syncthing (or Syncthing-Fork) and leave it running — its web interface is what Atonacht asks. To read another device instead, use that device's address, e.g. http://192.168.1.20:8384.`
      : `Nothing answered at ${u}. Check that Syncthing is running on that device, that the address is right, and that both devices are on the same network.`;
  }
  if (/certificate|tls|ssl|handshake/i.test(raw)) {
    return `${u} answered, but its certificate was refused. For a local Syncthing use http://, or fix the certificate.`;
  }
  return `Could not read Syncthing: ${raw}`;
}

/** The other way to spell the same loopback address, when the first one refused the connection. */
export function alternateLoopback(url: string): string | null {
  if (/127\.0\.0\.1/.test(url)) return url.replace("127.0.0.1", "localhost");
  if (/localhost/.test(url)) return url.replace("localhost", "127.0.0.1");
  return null;
}

export interface Probe {
  url: string;
  /** What came back for the no-auth health endpoint: "ok" means something is listening there. */
  health: "ok" | "unreachable" | "tls" | "other";
  /** Whether the API key was accepted, when health already answered. */
  key?: "accepted" | "rejected";
  detail?: string;
}

const tlsError = (raw: string) => /certificate|tls|ssl|handshake|invalid peer/i.test(raw);
const refusedError = (raw: string) => /error sending request|dns error|connection refused|Connect\(|os error 1\d{4}|timed? ?out|network is unreachable|no route/i.test(raw);

/**
 * Asks one address whether anything is listening (Syncthing's health endpoint needs no key), then whether the key
 * works. This separates "no Syncthing here" from "wrong key" from "the web interface speaks HTTPS".
 */
export async function probeUrl(url: string, apiKey: string, fetcher: Fetcher): Promise<Probe> {
  const base = url.replace(/\/+$/, "");
  try {
    const health = await fetcher(base + "/rest/noauth/health");
    if (!health.ok) return { url: base, health: "other", detail: `health answered ${health.status}` };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return { url: base, health: tlsError(raw) ? "tls" : refusedError(raw) ? "unreachable" : "other", detail: raw };
  }
  try {
    const r = await fetcher(base + "/rest/config", { headers: { "X-API-Key": apiKey } });
    return { url: base, health: "ok", key: r.status === 401 || r.status === 403 ? "rejected" : "accepted" };
  } catch (e) {
    return { url: base, health: "ok", key: "rejected", detail: e instanceof Error ? e.message : String(e) };
  }
}

/** The addresses worth trying for one typed address: itself, the other loopback spelling, and https on both. */
export function probeCandidates(url: string): string[] {
  const base = url.replace(/\/+$/, "");
  const out = [base];
  const alt = alternateLoopback(base);
  if (alt) out.push(alt);
  for (const u of [base, alt]) {
    if (!u) continue;
    if (u.startsWith("http://")) out.push("https://" + u.slice(7));
  }
  return [...new Set(out)];
}

/**
 * Everywhere Syncthing could be listening on this device: the usual loopback spellings, IPv6 loopback, and the phone's own
 * LAN addresses, on the two ports Syncthing and Syncthing-Fork use. A phone that reports "nothing there" for all of these
 * does not have a web interface listening at all, which is a different problem from a wrong address.
 */
export function scanCandidates(typed: string, lanIps: string[]): string[] {
  const out = [typed.replace(/\/+$/, "")];
  for (const host of ["127.0.0.1", "localhost", "[::1]", ...lanIps]) {
    for (const port of [8384, 8385]) out.push(`http://${host}:${port}`);
  }
  return [...new Set(out)];
}

/** Which of those addresses actually answered (health endpoint, no key needed). */
export async function scanSyncthing(typed: string, lanIps: string[], fetcher: Fetcher): Promise<Probe[]> {
  const all = await Promise.all(scanCandidates(typed, lanIps).map((u) => probeUrl(u, "", fetcher)));
  return all.filter((p) => p.health === "ok" || p.health === "tls");
}
