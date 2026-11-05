type Loader = () => Promise<unknown>;
type Schedule = (run: () => void) => void;

const defaultSchedule: Schedule = (run) => {
  const w = window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void };
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 1500);
};

/**
 * Loads screens in the background once the first screen is up and the app is idle, so the first tap on a note or on Settings
 * doesn't wait for a download. Runs once; failures are ignored because the screen will simply load when opened.
 */
export function preloadWhenIdle(loaders: Loader[], schedule: Schedule = defaultSchedule): () => void {
  let cancelled = false;
  schedule(() => {
    if (cancelled) return;
    for (const load of loaders) load().catch(() => {});
  });
  return () => {
    cancelled = true;
  };
}
