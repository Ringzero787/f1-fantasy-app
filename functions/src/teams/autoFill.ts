/**
 * Value-based auto-fill for rosters that still have empty seats when the
 * weekend locks.
 *
 * Until F-044, contract expiry (Phase 3.5 of onRaceCompleted) sold the driver
 * AND immediately re-bought the cheapest car on the grid. A player who did not
 * open the app every third race ended up with a $5 Stroll in every seat and
 * $700+ idle in the bank — 37 of 40 live teams looked like that by round 16.
 *
 * Now expiry only frees the seat. The seat stays open (and the incomplete-team
 * reminders fire) until autoLockTeams locks the weekend; if the player still
 * has not filled it, this module picks the combination of affordable cars with
 * the best recent form — points per race over the last FORM_WINDOW scored
 * races — so an absent manager fields a competitive team instead of a cheap one.
 *
 * The selector is a small exact knapsack: with 22 drivers, 5 seats and a
 * budget in whole dollars the state space is a few hundred thousand cells.
 * It prefers filling more seats over a higher total, then higher form, then
 * lower cost.
 */

import * as admin from 'firebase-admin';

export const TEAM_SIZE = 5;
export const FORM_WINDOW = 5;
const CONTRACT_LENGTH_DEFAULT = 3;
// Bitmask selection tracking caps the candidate pool; 22 drivers + a rookie
// pool never gets near this, but the top-N-by-form cut keeps it safe.
const MAX_CANDIDATES = 30;

export interface FillCandidate {
  id: string;
  name: string;
  shortName: string;
  constructorId: string;
  price: number;
  /** Average fantasy points per race over the form window (0 when unscored). */
  form: number;
}

export interface FillRequest {
  budget: number;
  driverSlots: number;
  needConstructor: boolean;
  drivers: FillCandidate[];
  constructors: FillCandidate[];
}

export interface FillResult {
  drivers: FillCandidate[];
  constructor: FillCandidate | null;
  cost: number;
  form: number;
}

interface DriverPick {
  indexes: number[];
  form: number;
  cost: number;
}

const NEG = Number.NEGATIVE_INFINITY;

/**
 * Best set of at most `slots` drivers costing at most `budget`, maximising
 * (seat count, form, -cost) in that order.
 */
function bestDrivers(cands: FillCandidate[], slots: number, budget: number): DriverPick {
  const B = Math.max(0, Math.floor(budget));
  const n = cands.length;
  if (n === 0 || slots <= 0 || B <= 0) return { indexes: [], form: 0, cost: 0 };

  // form[j][b], cost[j][b], mask[j][b]: best subset of exactly j drivers with
  // total price <= b. Row 0 is the empty subset for every b.
  const form: number[][] = [];
  const cost: number[][] = [];
  const mask: number[][] = [];
  for (let j = 0; j <= slots; j++) {
    form.push(new Array(B + 1).fill(j === 0 ? 0 : NEG));
    cost.push(new Array(B + 1).fill(0));
    mask.push(new Array(B + 1).fill(0));
  }

  for (let i = 0; i < n; i++) {
    const price = Math.max(0, Math.ceil(cands[i].price));
    const f = cands[i].form;
    const bit = 1 << i;
    for (let j = slots; j >= 1; j--) {
      for (let b = B; b >= price; b--) {
        const base = form[j - 1][b - price];
        if (base === NEG) continue;
        const val = base + f;
        const c = cost[j - 1][b - price] + price;
        const cur = form[j][b];
        if (val > cur || (val === cur && c < cost[j][b])) {
          form[j][b] = val;
          cost[j][b] = c;
          mask[j][b] = mask[j - 1][b - price] | bit;
        }
      }
    }
  }

  for (let j = slots; j >= 1; j--) {
    if (form[j][B] === NEG) continue;
    const indexes: number[] = [];
    for (let i = 0; i < n; i++) if (mask[j][B] & (1 << i)) indexes.push(i);
    return { indexes, form: form[j][B], cost: cost[j][B] };
  }
  return { indexes: [], form: 0, cost: 0 };
}

function topByForm(cands: FillCandidate[]): FillCandidate[] {
  if (cands.length <= MAX_CANDIDATES) return cands;
  return [...cands].sort((a, b) => b.form - a.form || a.price - b.price).slice(0, MAX_CANDIDATES);
}

/**
 * Pure selector. Callers pass only eligible candidates (not on the team, not
 * locked out, active). Returns the seats to fill; never touches Firestore.
 */
export function selectValueFill(req: FillRequest): FillResult {
  const budget = Math.max(0, Math.floor(req.budget));
  const slots = Math.max(0, req.driverSlots);
  const drivers = topByForm(req.drivers.filter((d) => d.price <= budget));

  const driverOnly = (): FillResult => {
    const pick = bestDrivers(drivers, slots, budget);
    return {
      drivers: pick.indexes.map((i) => drivers[i]),
      constructor: null,
      cost: pick.cost,
      form: pick.form,
    };
  };

  if (!req.needConstructor) return driverOnly();

  let best: FillResult | null = null;
  const seats = (r: FillResult) => r.drivers.length + (r.constructor ? 1 : 0);
  const better = (a: FillResult, b: FillResult | null) => {
    if (!b) return true;
    if (seats(a) !== seats(b)) return seats(a) > seats(b);
    if (a.form !== b.form) return a.form > b.form;
    return a.cost < b.cost;
  };

  for (const ctor of req.constructors) {
    if (ctor.price > budget) continue;
    const pick = bestDrivers(drivers, slots, budget - ctor.price);
    const r: FillResult = {
      drivers: pick.indexes.map((i) => drivers[i]),
      constructor: ctor,
      cost: pick.cost + ctor.price,
      form: pick.form + ctor.form,
    };
    if (better(r, best)) best = r;
  }

  // No affordable constructor: fill what we can on the driver side.
  const fallback = driverOnly();
  return best && better(best, fallback) ? best : fallback;
}

// ─── Firestore side ───

export interface FillContext {
  drivers: FillCandidate[];
  constructors: FillCandidate[];
  completedRaceCount: number;
  formRaceIds: string[];
}

/** Safe read of a team's constructor (a doc without the field returns Object.prototype.constructor). */
export function getTeamCtor(team: Record<string, any>): Record<string, any> | null {
  const c = Object.prototype.hasOwnProperty.call(team, 'constructor') ? team['constructor'] : null;
  if (c && typeof c === 'object' && !Array.isArray(c) && typeof c.constructorId === 'string') return c;
  return null;
}

/** True when the roster has an empty driver seat or no constructor. */
export function isIncomplete(team: Record<string, any>): boolean {
  const drivers = Array.isArray(team.drivers) ? team.drivers : [];
  return drivers.length < TEAM_SIZE || !getTeamCtor(team);
}

/**
 * A team that has never fielded anything is not "forgot to fill" — it is a
 * shell someone created and walked away from. Filling it would put a roster
 * on the league table that nobody chose. Teams that have held a car or been
 * scored before are the ones expiry can hollow out.
 */
export function hasEverFielded(team: Record<string, any>): boolean {
  const drivers = Array.isArray(team.drivers) ? team.drivers : [];
  if (drivers.length > 0 || getTeamCtor(team)) return true;
  const scored = Array.isArray(team.scoredRaces) ? team.scoredRaces : [];
  return scored.length > 0;
}

/**
 * Market + recent form, loaded once per lock run. Form is the mean of each
 * entity's raceScores totalPoints over the last FORM_WINDOW completed rounds
 * (a round with no row counts as 0, so absentees and fresh rookies rank low).
 */
export async function loadFillContext(db: admin.firestore.Firestore): Promise<FillContext> {
  const [completedSnap, driversSnap, ctorsSnap] = await Promise.all([
    db.collection('races').where('status', '==', 'completed').get(),
    db.collection('drivers').where('isActive', '==', true).get(),
    db.collection('constructors').where('isActive', '==', true).get(),
  ]);

  const completed = completedSnap.docs
    .map((d) => ({ id: d.id, round: Number(d.data().round) || 0 }))
    .sort((a, b) => b.round - a.round);
  const formRaceIds = completed.slice(0, FORM_WINDOW).map((r) => r.id);

  const formSum = new Map<string, number>();
  if (formRaceIds.length > 0) {
    const scoresSnap = await db.collection('raceScores').where('raceId', 'in', formRaceIds).get();
    for (const doc of scoresSnap.docs) {
      const s = doc.data();
      const pts = typeof s.totalPoints === 'number' && Number.isFinite(s.totalPoints) ? s.totalPoints : 0;
      formSum.set(s.entityId, (formSum.get(s.entityId) || 0) + pts);
    }
  }
  const window = Math.max(1, formRaceIds.length);
  const formOf = (id: string) => Math.round(((formSum.get(id) || 0) / window) * 10) / 10;

  const toCandidate = (doc: FirebaseFirestore.QueryDocumentSnapshot): FillCandidate | null => {
    const data = doc.data();
    const price = typeof data.price === 'number' && Number.isFinite(data.price) ? data.price : NaN;
    if (!Number.isFinite(price)) return null;
    return {
      id: doc.id,
      name: data.name || '',
      shortName: data.shortName || '',
      constructorId: data.constructorId || '',
      price,
      form: formOf(doc.id),
    };
  };

  return {
    drivers: driversSnap.docs.map(toCandidate).filter((c): c is FillCandidate => !!c),
    constructors: ctorsSnap.docs.map(toCandidate).filter((c): c is FillCandidate => !!c),
    completedRaceCount: completedSnap.size,
    formRaceIds,
  };
}

export interface AutoFillPlan {
  drivers: Record<string, any>[];
  constructor: Record<string, any> | null;
  budget: number;
  cost: number;
  filledDriverIds: string[];
  filledConstructorId: string | null;
}

/**
 * Decide what to add to an incomplete team. Returns null when there is nothing
 * to do: the roster is complete, the team never fielded anything, or nothing
 * eligible fits the bank.
 */
export function planAutoFill(team: Record<string, any>, ctx: FillContext): AutoFillPlan | null {
  if (!isIncomplete(team) || !hasEverFielded(team)) return null;

  const drivers: Record<string, any>[] = Array.isArray(team.drivers) ? team.drivers : [];
  const ctor = getTeamCtor(team);
  const budget = typeof team.budget === 'number' && Number.isFinite(team.budget) ? team.budget : 0;
  const onTeam = new Set(drivers.map((d) => d.driverId));
  const lockouts: Record<string, number> = team.driverLockouts || {};

  const eligible = ctx.drivers.filter((c) => {
    if (onTeam.has(c.id)) return false;
    const expiry = lockouts[c.id];
    if (expiry !== undefined && ctx.completedRaceCount < expiry) return false;
    return true;
  });

  const result = selectValueFill({
    budget,
    driverSlots: TEAM_SIZE - drivers.length,
    needConstructor: !ctor,
    drivers: eligible,
    constructors: ctx.constructors,
  });
  if (result.drivers.length === 0 && !result.constructor) return null;

  const stamp = (c: FillCandidate, withCtorId: boolean) => ({
    ...(withCtorId ? { driverId: c.id, shortName: c.shortName, constructorId: c.constructorId } : { constructorId: c.id }),
    name: c.name,
    purchasePrice: c.price,
    currentPrice: c.price,
    pointsScored: 0,
    racesHeld: 0,
    contractLength: CONTRACT_LENGTH_DEFAULT,
    isReservePick: true,
    addedAtRace: ctx.completedRaceCount,
  });

  return {
    drivers: [...drivers, ...result.drivers.map((c) => stamp(c, true))],
    constructor: ctor ?? (result.constructor ? stamp(result.constructor, false) : null),
    budget: Math.round(budget - result.cost),
    cost: result.cost,
    filledDriverIds: result.drivers.map((c) => c.id),
    filledConstructorId: result.constructor ? result.constructor.id : null,
  };
}
