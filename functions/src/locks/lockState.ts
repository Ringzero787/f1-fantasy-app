import * as admin from 'firebase-admin';
import { AceWindow } from '../utils/lockTime';

/**
 * `config/lockState` — the one fact firestore.rules can see about a live race weekend (F-118).
 *
 * Why it exists: `autoLockTeams` only looks at races still `upcoming`, and locking a weekend flips
 * that race to `in_progress`, so the sweep never comes back to it. A team created from that moment
 * until the race is scored was never locked and never stamped with an ace window — its roster
 * stayed editable through the sprint and the race, and `aceIsFrozen` saw no window so its ace did
 * too. The callable can read the race calendar and fix its own writes, but the shipped client
 * creates teams with a direct `addDoc`, and rules cannot run a query. One document at a fixed path
 * is the only thing they can read, so the sweep publishes the window here.
 *
 * It is bounded by its own `aceLockUntil`, the same race + 24h ceiling the per-team window uses, so
 * a marker nobody clears expires instead of freezing every new team for the rest of the season —
 * F-095's second rejected shape was a deadline with no end, and this would have been another one.
 */
export const LOCK_STATE_PATH = 'config/lockState';

export interface LockState extends AceWindow {
  raceId: string;
}

/**
 * The live weekend, or null. Null covers all three of: no document, a document from a weekend
 * whose ceiling has passed, and a document missing the ceiling entirely — because a lock state we
 * cannot date is one we must not act on.
 */
export async function liveLockState(
  db: admin.firestore.Firestore,
  now = Date.now(),
): Promise<LockState | null> {
  const snap = await db.doc(LOCK_STATE_PATH).get();
  if (!snap.exists) return null;
  const d = snap.data() as Partial<LockState> | undefined;
  const until = d?.aceLockUntil;
  if (!d?.raceId || !until || typeof until.toMillis !== 'function') return null;
  if (until.toMillis() <= now) return null;
  return d as LockState;
}

/**
 * The `lockStatus` a team created during a live weekend must carry. Locked, with the window
 * stamped, so every mechanism that already exists works unchanged: the roster callables refuse
 * because `isLocked` is true, and the ace rule freezes because the window is there.
 *
 * Stamping the real window — rather than freezing such a team by some other means — is what keeps
 * `aceIsFrozen` the single authority on a stamped team, including the deliberate F-098 gap that
 * reopens the ace once the sessions it doubles have been scored. A team frozen by the weekend
 * alone would never get that gap.
 */
export function lockedTeamStatus(state: LockState, raceName?: string) {
  return {
    isSeasonLocked: false,
    seasonLockRacesRemaining: 0,
    // The cancelled-race failsafe, the same ceiling the sweep uses. The real unlock arrives from
    // Phase 5 of onRaceCompleted, three hours after the race is scored, like every other team.
    nextUnlockTime: state.aceLockUntil,
    aceFreezeFrom: state.aceFreezeFrom,
    aceLockTime: state.aceLockTime,
    aceLockUntil: state.aceLockUntil,
    aceQualiKey: state.aceQualiKey,
    aceSprintKey: state.aceSprintKey,
    canModify: false,
    lockReason: raceName
      ? `Locked for ${raceName} — the weekend was already under way`
      : 'Locked — the race weekend was already under way',
  };
}

/**
 * Is this team stamped for THIS weekend? The gate the roster callables apply, as a pure function so
 * it can be tested without a Firestore fake.
 *
 * Identity, not presence. `!team.lockStatus?.aceLockTime` was a truthiness test, and `allow create`
 * does not constrain `lockStatus` while the shipped client creates teams with a bare `addDoc` — so
 * a payload carrying `aceLockTime: 'x'`, or last month's timestamp, passed it and all five roster
 * callables then accepted edits with the sessions already run. Comparing the instant rejects both.
 */
export function stampedForWeekend(
  team: FirebaseFirestore.DocumentData,
  live: LockState | null,
): boolean {
  if (!live) return true; // no live weekend: nothing to be stamped for
  const own = team?.lockStatus?.aceLockTime;
  return (
    typeof own?.toMillis === 'function' &&
    typeof live.aceLockTime?.toMillis === 'function' &&
    own.toMillis() === live.aceLockTime.toMillis()
  );
}
