/**
 * The user's REAL team, as the app stores it, and the plan to move it to a what-if lineup
 * through the server callables (F-073). Pure: every rule here is unit-tested.
 *
 * The web never writes `fantasyTeams`. A save replays the diff as callable calls, in the same
 * order the app's Pick Team uses: driver sells, constructor change, driver buys. Budget, fees,
 * contracts and locks stay server-authoritative; the numbers shown before saving are estimates
 * that mirror the server's quoteSale exactly.
 */
import type { Lineup } from './types';

export interface RosterDriver { driverId: string; name: string; shortName: string; constructorId: string; purchasePrice: number; currentPrice: number; contractLength?: number; racesHeld?: number; isReservePick?: boolean; pointsScored?: number }
export interface RosterConstructor { constructorId: string; name: string; purchasePrice: number; currentPrice: number; contractLength?: number; racesHeld?: number; isReservePick?: boolean; pointsScored?: number }

export interface RealTeam {
  id: string;
  name: string;
  leagueId: string | null;
  drivers: RosterDriver[];
  constructor: RosterConstructor | null;
  budget: number;
  isLocked: boolean;
  /**
   * F-095/F-098: the window in which the server refuses an ace change, epoch ms, or null.
   * It runs from `aceFreezeFrom` — the weekend's first session whose points the ace
   * doubles, qualifying or the sprint — to `aceLockUntil`, with one gap: once
   * `aceQualiKey` is in `scoredRaces` and before `aceLockTime` (lights out), the ace
   * moves freely. It carries an end so nothing has to ask whether the team is locked —
   * a window cannot be opened early by clearing the lock, and one nobody clears expires
   * rather than freezing the ace for ever.
   */
  aceFreezeFrom: number | null;
  aceLockTime: number | null;
  aceLockUntil: number | null;
  aceQualiKey: string | null;
  aceSprintKey: string | null;
  /** Server-written; carries `quali_<raceId>` once qualifying has been scored. */
  scoredRaces: string[];
  aceDriverId: string | null;
  totalPoints: number;
  lockedPoints: number;
  driverLockouts: Record<string, number>;
}

export const TEAM_SIZE = 5;
export const BUDGET = 1000;
export const CONTRACT_LENGTH = 3;
export const EARLY_TERMINATION_RATE = 0.03;
export const ACE_MAX_PRICE = 200;

export const teamLineup = (t: RealTeam): Lineup => ({ drivers: t.drivers.map((d) => d.driverId), ctor: t.constructor?.constructorId ?? '', ace: t.aceDriverId ?? '' });

/** Mirrors functions/src/teams/teamOperations.ts quoteSale and src/utils/saleQuote.ts exactly. */
export function saleQuote(e: { currentPrice: number; contractLength?: number; racesHeld?: number; isReservePick?: boolean }, marketPrice?: number) {
  const price = marketPrice ?? e.currentPrice;
  const racesHeld = e.racesHeld || 0;
  const contractLength = e.contractLength || CONTRACT_LENGTH;
  const racesLeft = contractLength - racesHeld;
  const feeWaived = racesHeld === 0 || e.isReservePick === true || racesLeft <= 0;
  const earlyTermFee = feeWaived ? 0 : Math.floor(price * EARLY_TERMINATION_RATE * Math.max(0, racesLeft));
  return { marketPrice: price, earlyTermFee, saleReturn: price - earlyTermFee, feeWaived };
}

export type Step =
  | { op: 'sellDriver'; id: string; name: string; returns: number; fee: number }
  | { op: 'removeConstructor'; id: string; name: string; returns: number; fee: number }
  | { op: 'setConstructor'; id: string; name: string; cost: number; contractLength: number }
  | { op: 'addDriver'; id: string; name: string; cost: number; contractLength: number };

export interface Plan {
  steps: Step[];
  bankAfter: number;
  /** why this cannot be saved, or null */
  blocked: string | null;
  changed: boolean;
}

export interface MarketPrices { drivers: Record<string, { price: number; name: string; isActive?: boolean }>; constructors: Record<string, { price: number; name: string }> }

/**
 * @param completedRaces how many races have been completed (contract-expiry lockouts are stored in that unit)
 */
export function planSave(team: RealTeam, target: Lineup, market: MarketPrices, contractLength: number, completedRaces: number): Plan {
  const steps: Step[] = [];
  let bank = team.budget;
  const have = new Set(team.drivers.map((d) => d.driverId));
  const want = new Set(target.drivers.filter(Boolean));
  const ctorChanged = (team.constructor?.constructorId ?? '') !== target.ctor;

  // F-095: the weekend lock refuses ROSTER changes, and only those. An ace-only save in
  // the window between the qualifying lock and lights out has no steps at all, and it has
  // to get through — that window is the point of the ace, and the rules allow it until the
  // race starts. Blocking unconditionally on isLocked meant every portal ace move from
  // Saturday on died here with "locked for this weekend", which is how the relaxation in
  // state.tsx and Compare.tsx would have shipped as a change that did nothing.
  const rosterChanged = ctorChanged
    || team.drivers.some((d) => !want.has(d.driverId))
    || [...want].some((id) => !have.has(id));
  if (team.isLocked && rosterChanged) return { steps, bankAfter: bank, blocked: 'Your team is locked for this weekend.', changed: true };
  if (want.size > TEAM_SIZE) return { steps, bankAfter: bank, blocked: `A lineup holds at most ${TEAM_SIZE} drivers.`, changed: true };

  for (const d of team.drivers) if (!want.has(d.driverId)) {
    const q = saleQuote(d, market.drivers[d.driverId]?.price);
    steps.push({ op: 'sellDriver', id: d.driverId, name: d.name, returns: q.saleReturn, fee: q.earlyTermFee });
    bank += q.saleReturn;
  }
  if (ctorChanged && team.constructor) {
    const c = team.constructor;
    const q = saleQuote(c, market.constructors[c.constructorId]?.price);
    steps.push({ op: 'removeConstructor', id: c.constructorId, name: c.name, returns: q.saleReturn, fee: q.earlyTermFee });
    bank += q.saleReturn;
  }
  if (ctorChanged && target.ctor) {
    const m = market.constructors[target.ctor];
    if (!m) return { steps, bankAfter: bank, blocked: 'That constructor is not on the market.', changed: true };
    steps.push({ op: 'setConstructor', id: target.ctor, name: m.name, cost: m.price, contractLength });
    bank -= m.price;
  }
  for (const id of target.drivers) if (id && !have.has(id)) {
    const m = market.drivers[id];
    if (!m) return { steps, bankAfter: bank, blocked: 'That driver is not on the market.', changed: true };
    if (m.isActive === false) return { steps, bankAfter: bank, blocked: `${m.name} is not active this season.`, changed: true };
    const lockout = team.driverLockouts[id];
    if (typeof lockout === 'number' && lockout > completedRaces) return { steps, bankAfter: bank, blocked: `${m.name} just left your team and cannot come back until after the next race.`, changed: true };
    steps.push({ op: 'addDriver', id, name: m.name, cost: m.price, contractLength });
    bank -= m.price;
  }
  const changed = steps.length > 0;
  if (bank < 0) return { steps, bankAfter: bank, blocked: `This lineup is $${Math.abs(Math.round(bank)).toLocaleString('en-US')} over your bank.`, changed };
  return { steps, bankAfter: bank, blocked: null, changed };
}

/**
 * F-095: whether the ace is frozen for this team right now.
 *
 * Mirrors `aceIsFrozen` in firestore.rules, fallbacks and all: three sessions score with
 * the ace applied and the freeze covers them all, with one gap once qualifying has been
 * scored. The portal used to gate the ace on `isLocked`, which is the QUALIFYING lock:
 * that refused every ace move from Saturday on and threw away the window the game
 * deliberately gives you. A weekend stamped before `aceFreezeFrom` existed still freezes
 * from the race start it does carry, and a half-written window freezes nothing — fail
 * open, not shut.
 */
export function aceFrozen(team: RealTeam, now: number = Date.now()): boolean {
  const from = team.aceFreezeFrom ?? team.aceLockTime;
  if (from === null || team.aceLockUntil === null) return false;
  if (now < from || now >= team.aceLockUntil) return false;
  const qualifyingScored = team.aceQualiKey !== null && team.scoredRaces.includes(team.aceQualiKey);
  // The sprint can miss its own scoring run too, and is then folded into race scoring
  // from a live ace read. Only stamped on sprint weekends; elsewhere it asks nothing.
  const sprintSettled = team.aceSprintKey === null || team.scoredRaces.includes(team.aceSprintKey);
  return !(qualifyingScored && sprintSettled && team.aceLockTime !== null && now < team.aceLockTime);
}

/** Whether the Ace change is allowed: the driver must be on the target lineup and priced at or under the cap. */
export function aceChange(team: RealTeam, target: Lineup, market: MarketPrices): { to: string | null; blocked: string | null } {
  const current = team.aceDriverId ?? '';
  if (target.ace === current) return { to: null, blocked: null };
  if (!target.ace) return { to: '', blocked: null };
  if (!target.drivers.includes(target.ace)) return { to: null, blocked: 'The ace must be on your lineup.' };
  const price = market.drivers[target.ace]?.price ?? Number.POSITIVE_INFINITY;
  if (price > ACE_MAX_PRICE) return { to: null, blocked: `Only picks priced at $${ACE_MAX_PRICE} or less can be your ace.` };
  return { to: target.ace, blocked: null };
}
