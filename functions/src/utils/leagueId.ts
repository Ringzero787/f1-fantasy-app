/**
 * Whether a `leagueId` is something `doc()` can take (F-104).
 *
 * `db.collection('leagues').doc(id)` throws SYNCHRONOUSLY on an id containing a slash, on a bare
 * `.` or `..`, and on a reserved `__…__` name. `fantasyTeams.leagueId` is client-supplied, and an
 * unusable value there rejects every `autoLockTeams` run — no lineup lock, no ace freeze, for
 * every player — and aborts the league sync in `calculatePoints`.
 *
 * **This has to agree with `usableLeagueId` in firestore.rules.** The rule cannot call this, so
 * the expression is written twice; `functions/test/leagueId.test.js` pins the pattern string so
 * the two cannot drift silently. The rules side is covered by the emulator suite.
 *
 * Why the first character must be alphanumeric: it is how `__…__` is excluded. RE2 — what the
 * rules' `matches()` runs — has no negative lookahead, so "not starting with __" cannot be said
 * directly, and the rule and this helper keep the same shape rather than the same intent.
 *
 * Null and absent are both fine: a solo team has no league, and most teams are solo.
 */
export const LEAGUE_ID_PATTERN = '^[A-Za-z0-9][A-Za-z0-9_-]*$';
export const LEAGUE_ID_MAX = 64;

export function isUsableLeagueId(id: unknown): boolean {
  if (id === null || id === undefined) return true;
  if (typeof id !== 'string') return false;
  if (id.length === 0 || id.length > LEAGUE_ID_MAX) return false;
  return new RegExp(LEAGUE_ID_PATTERN).test(id);
}
