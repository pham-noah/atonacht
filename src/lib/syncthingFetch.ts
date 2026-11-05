import { isTauri } from "./backend";
import { Fetcher } from "./syncthing";

/**
 * How the app reaches Syncthing.
 *
 * Inside the installed app the request is made in Rust (`sync_get`): it is a plain HTTP call to a loopback or LAN
 * address, so routing it through the web layer only adds failure modes — a plugin URL scope to configure, browser CORS,
 * and a WebView that reports every transport problem as the same "error sending request". In the browser demo there is
 * no Rust, so `fetch` is used and the demo cannot reach Syncthing at all.
 */
export async function syncthingFetcher(): Promise<Fetcher> {
  if (!isTauri()) return window.fetch.bind(window) as unknown as Fetcher;
  const { invoke } = await import("@tauri-apps/api/core");
  return async (url, init) => {
    const key = init?.headers?.["X-API-Key"] ?? "";
    const parsed = new URL(url);
    const json = await invoke("sync_get", {
      url: parsed.origin,
      path: parsed.pathname + parsed.search,
      key,
    });
    return { ok: true, status: 200, json: async () => json };
  };
}
