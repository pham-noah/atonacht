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
