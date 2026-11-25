/** F-175: how often the app stamps `users/{uid}.lastOpenAt` (see src/hooks/useLastOpenAt.ts). Pure. */
export const LAST_OPEN_THROTTLE_MS = 60 * 60 * 1000;

/** Write now? On first open, then at most once an hour. */
export function shouldStampOpen(lastStampMs: number | null, now: number): boolean {
  return lastStampMs === null || now - lastStampMs >= LAST_OPEN_THROTTLE_MS;
}
