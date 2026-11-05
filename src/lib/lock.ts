/** Lock again when the app has been in the background for at least `lockAfterMs` (0 = every time). */
export const shouldLock = (hiddenAt: number | null, now: number, lockAfterMs: number) =>
  hiddenAt !== null && now - hiddenAt >= lockAfterMs;
