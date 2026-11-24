/**
 * F-155: take a retired driver off every team that holds him, and give the team his price back.
 *
 * The 2027 grid seed (F-156) runs while the market is open (owner decision 2026-11-24), so teams
 * built between the rollover and the seed may hold a driver who has no 2027 seat. functions/scripts/
 * setDriverSeat.js retires him (`isActive: false`) and then writes, per holding team, the patch
 * below in its own transaction. Pure, so the patch is tested without Firestore.
 *
 * It is the sale removeDriverSecure makes (teamOperations.ts), with three differences:
 *  - the team gets his CURRENT market price back, whole: no early-termination fee — the player did
 *    not choose to break the contract;
 *  - his lockout and his streak entry are cleared, not stamped: he cannot be bought again (inactive),
 *    and if he ever returns the team owes him no lockout;
 *  - `racesSinceTransfer` is left alone. It is the stale-roster counter (calculatePoints.ts: a
 *    penalty after five races without a transfer). A sale the server forces says nothing about
 *    whether the player is active, so it must not reset the counter of an abandoned team; the
 *    player's own purchase into the empty seat resets it, as does auto-fill at the lock (F-170).
 *    In the off-season it is 0 on every team anyway (the rollover reset it).
 * The banked points move exactly as in a sale: pointsScored from totalPoints to lockedPoints, so the
 * team's total (and every league table) is unchanged. The app keeps no sale history, so there is
 * none to add to.
 *
 * The patch never carries `constructor`; the script writes it with set + mergeFields anyway, never
 * update() (#305: update() cannot write a top-level `constructor` key, and a later edit adding one
 * must not bring the bug back).
 */
type Doc = Record<string, unknown>;

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const own = (o: unknown, k: string): boolean => !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
const isDriver = (driverId: string) => (x: unknown): boolean =>
  !!x && typeof x === 'object' && ((x as Doc).driverId === driverId || (x as Doc).id === driverId);

export interface RetireSale {
  /** the fields to write (set + mergeFields over exactly these keys), plus updatedAt by the writer */
  patch: Doc;
  /** what was credited to the budget (0 when he was only the ace, or only had a lockout/streak entry) */
  refund: number;
  /** points moved from totalPoints to lockedPoints */
  banked: number;
  onRoster: boolean;
  aceCleared: boolean;
  lockoutCleared: boolean;
  streakCleared: boolean;
}

/** True when the team holds the driver in any way the retirement must undo. */
export function holdsDriver(team: Doc, driverId: string): boolean {
  return (Array.isArray(team.drivers) && team.drivers.some(isDriver(driverId)))
    || team.aceDriverId === driverId
    || own(team.driverLockouts, driverId)
    || own(team.driverStreaks, driverId);
}

/**
 * The write that removes `driverId` from `team` with his market price refunded; null when the team
 * does not hold him (a re-run, or a team that sold him meanwhile). `marketPrice` is the driver
 * document's price; when it is not a usable number the roster entry's currentPrice is refunded.
 */
export function retireSale(team: Doc, driverId: string, marketPrice: unknown): RetireSale | null {
  if (!holdsDriver(team, driverId)) return null;
  const drivers = Array.isArray(team.drivers) ? team.drivers : [];
  const entry = drivers.find(isDriver(driverId)) as Doc | undefined;
  const patch: Doc = {};
  let refund = 0;
  let banked = 0;
  if (entry) {
    refund = typeof marketPrice === 'number' && Number.isFinite(marketPrice) && marketPrice >= 0 ? marketPrice : num(entry.currentPrice);
    banked = num(entry.pointsScored);
    patch.drivers = drivers.filter((x) => !isDriver(driverId)(x));
    patch.budget = num(team.budget) + refund;
    patch.totalSpent = Math.max(0, num(team.totalSpent) - num(entry.purchasePrice));
    if (banked !== 0) {
      patch.totalPoints = num(team.totalPoints) - banked;
      patch.lockedPoints = num(team.lockedPoints) + banked;
    }
  }
  const aceCleared = team.aceDriverId === driverId;
  if (aceCleared) patch.aceDriverId = null;
  const without = (m: unknown): Doc => Object.fromEntries(Object.entries(m as Doc).filter(([k]) => k !== driverId));
  // the whole map, minus his key: mergeFields replaces a named field whole, so stale keys cannot survive
  const lockoutCleared = own(team.driverLockouts, driverId);
  if (lockoutCleared) patch.driverLockouts = without(team.driverLockouts);
  const streakCleared = own(team.driverStreaks, driverId);
  if (streakCleared) patch.driverStreaks = without(team.driverStreaks);
  return { patch, refund, banked, onRoster: !!entry, aceCleared, lockoutCleared, streakCleared };
}

/**
 * Why a retirement with refunds must not write now; empty = go. A team mid-weekend (locked, or the
 * weekend's lock marker live) is being scored from its roster: taking a driver off it would change
 * that race's result. An open Moonshot on him needs a void path first (a different decision).
 */
export function retireBlockers(i: { lockedHolders: string[]; weekendLive: boolean; openMoonshots: string[] }): string[] {
  const out: string[] = [];
  if (i.weekendLive) out.push('a race weekend is live (config/lockState): retire after it is scored');
  if (i.lockedHolders.length) out.push(`${i.lockedHolders.length} holding team(s) are locked: ${i.lockedHolders.slice(0, 10).join(', ')}`);
  if (i.openMoonshots.length) out.push(`${i.openMoonshots.length} open Moonshot call(s) on him: ${i.openMoonshots.slice(0, 10).join(', ')}`);
  return out;
}
