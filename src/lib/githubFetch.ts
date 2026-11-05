import { isTauri } from "./backend";
import { Fetcher } from "./github";

/**
 * How the app reaches api.github.com.
 *
 * HTTPS to a public host is exactly what the HTTP plugin is for: it is inside the app's URL scope, it works on Android,
 * and the browser demo can use plain fetch because GitHub sends CORS headers. Syncthing is different — that one is read
 * in Rust, because it is a loopback address with a self-signed certificate.
 */
export async function githubFetcher(): Promise<Fetcher> {
  if (!isTauri()) return window.fetch.bind(window) as unknown as Fetcher;
  const { fetch } = await import("@tauri-apps/plugin-http");
  return fetch as unknown as Fetcher;
}
