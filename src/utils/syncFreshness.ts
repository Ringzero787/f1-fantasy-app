/**
 * Whether the server's copy of a team is newer than the one this device holds (F-101).
 *
 * `updatedAt` reaches the client in four shapes: a Firestore Timestamp straight from a read, the
 * plain `{ seconds, nanoseconds }` object that Timestamp becomes after the store is persisted as
 * JSON, a Date set by a local mutation, or an ISO string / number after persistence. All are read
 * as milliseconds; anything unreadable counts as "unknown", and an unknown local time never wins.
 */
export function toMillis(v: unknown): number | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.getTime() : null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') { const t = Date.parse(v); return Number.isFinite(t) ? t : null; }
  if (typeof v === 'object') {
    const o = v as { toMillis?: () => number; seconds?: number; _seconds?: number; nanoseconds?: number; _nanoseconds?: number };
    if (typeof o.toMillis === 'function') return o.toMillis();
    const s = typeof o.seconds === 'number' ? o.seconds : typeof o._seconds === 'number' ? o._seconds : null;
    if (s !== null) { const ns = typeof o.nanoseconds === 'number' ? o.nanoseconds : typeof o._nanoseconds === 'number' ? o._nanoseconds : 0; return s * 1000 + Math.floor(ns / 1e6); }
  }
  return null;
}

/**
 * The server wins unless this device changed the team after the server's last write. A local time
 * that cannot be read, or that is older than the server's, means the local copy is stale and must
 * not be pushed back (the periodic sync used to do exactly that, reverting renames made on the web).
 */
export function serverIsNewer(localUpdatedAt: unknown, serverUpdatedAt: unknown): boolean {
  const server = toMillis(serverUpdatedAt);
  if (server === null) return false;
  const local = toMillis(localUpdatedAt);
  if (local === null) return true;
  return server > local;
}
