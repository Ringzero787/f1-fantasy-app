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

/** The team with `pushed` keys no longer pending. */
export function clearDirty<T extends Pick<FantasyTeam, 'dirtyKeys'>>(team: T, pushed: readonly string[]): T {
  const left = (team.dirtyKeys ?? []).filter((k) => !pushed.includes(k));
  return { ...team, dirtyKeys: left.length ? left : undefined };
}
