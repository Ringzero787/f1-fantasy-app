/**
 * Which team fields the client's metadata sync may write, and which of them this device has
 * changed since it last pushed (F-101).
 *
 * The periodic sync used to push every local metadata field with a fresh timestamp, so a copy
 * rehydrated from storage reverted any rename made on the Pit Wall portal or another device
 * within a minute. Now an edit records the keys it touched, the sync writes only those, and a
 * copy nobody edited writes nothing. No clocks are compared, so a slow device clock cannot
 * swallow an edit and a stale timestamp cannot resurrect an old name.
 */
import type { FantasyTeam } from '../types';

/** Everything else on the document is the server's (roster, budget, points, locks) or created once. */
export const METADATA_SYNC_KEYS = ['name', 'avatarUrl', 'aceDriverId', 'aceConstructorId', 'leagueId'] as const;
export type MetadataSyncKey = (typeof METADATA_SYNC_KEYS)[number];

/** The team with `keys` recorded as changed here and not yet pushed. */
export function markDirty<T extends Pick<FantasyTeam, 'dirtyKeys'>>(team: T, keys: readonly MetadataSyncKey[]): T {
  const next = new Set<string>(team.dirtyKeys ?? []);
  for (const k of keys) next.add(k);
  return { ...team, dirtyKeys: [...next] };
}

/** The changed keys the sync may push, in a stable order; empty when there is nothing to push. */
export function dirtyMetadataKeys(team: Pick<FantasyTeam, 'dirtyKeys'>): MetadataSyncKey[] {
  const dirty = new Set(team.dirtyKeys ?? []);
  return METADATA_SYNC_KEYS.filter((k) => dirty.has(k));
}

/**
 * The team with `pushed` keys no longer pending — but only where the value held now is the value
 * that was pushed. An edit made while that push was in flight keeps its key, so the next sync
 * carries it; clearing by name alone dropped a league detach made during a slow sync.
 */
export function clearDirty<T extends Pick<FantasyTeam, 'dirtyKeys'>>(team: T, pushed: readonly string[], pushedValues?: Record<string, unknown>): T {
  const now = team as unknown as Record<string, unknown>;
  const left = (team.dirtyKeys ?? []).filter((k) => !(pushed.includes(k) && (!pushedValues || (now[k] ?? null) === (pushedValues[k] ?? null))));
  return { ...team, dirtyKeys: left.length ? left : undefined };
}

/**
 * A server copy adopted over a local one keeps the local values of keys still pending here, and
 * the keys themselves, so an edit waiting for its push is not lost when the team reloads.
 */
export function adoptServer<T extends Pick<FantasyTeam, 'dirtyKeys'>>(local: T, server: T): T {
  const keys = dirtyMetadataKeys(local);
  if (keys.length === 0) return server;
  const out = { ...server } as unknown as Record<string, unknown>;
  const mine = local as unknown as Record<string, unknown>;
  for (const k of keys) out[k] = mine[k];
  return { ...(out as unknown as T), dirtyKeys: [...keys] };
}
