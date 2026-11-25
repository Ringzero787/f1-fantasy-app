/**
 * The four roster moves — sell a driver, sell the constructor, buy a constructor, buy a driver — as
 * pure steps on an in-memory team (F-176). `applyLineupSecure` runs a whole lineup change through
 * them inside ONE transaction, so a Save is one server call instead of one per change.
 *
 * The rules are the same as the single-move callables in teamOperations.ts (addDriverSecure,
 * removeDriverSecure, setConstructorSecure, removeConstructorSecure): the same sale quote, the same
 * banking of points from totalPoints into lockedPoints, the same lockouts, contract caps and budget
 * check, in the same order the app has always sent them. Pure: no Firestore, so every rule is
 * unit-tested.
 */
import {
  MIN_CONTRACT_LENGTH, MAX_CONTRACT_LENGTH, MAX_CONSECUTIVE_RACES,
  allowedContractLength, priorStreak, streaksAfterSale,
} from './contractRules';

export const TEAM_SIZE = 5;
export const CONTRACT_LENGTH_DEFAULT = 3;
/** Keep in sync with teamOperations.ts and PRICING_CONFIG.EARLY_TERMINATION_RATE. */
export const EARLY_TERMINATION_RATE = 0.03;

/** A refusal: the code and message the single-move callables throw for the same case. */
export class LineupError extends Error {
  constructor(public code: 'not-found' | 'failed-precondition' | 'already-exists' | 'invalid-argument', message: string) { super(message); }
}

export interface SaleQuote { marketPrice: number; earlyTermFee: number; saleReturn: number; feeWaived: boolean }

/** The sale quote, identical to teamOperations.ts quoteSale. */
export function quoteSale(entity: { contractLength?: number; racesHeld?: number; isReservePick?: boolean }, marketPrice: number): SaleQuote {
  const racesHeld = entity.racesHeld || 0;
  const contractLength = entity.contractLength || CONTRACT_LENGTH_DEFAULT;
  const racesLeft = contractLength - racesHeld;
  const feeWaived = racesHeld === 0 || entity.isReservePick === true || racesLeft <= 0;
  const earlyTermFee = feeWaived ? 0 : Math.floor(marketPrice * EARLY_TERMINATION_RATE * racesLeft);
  return { marketPrice, earlyTermFee, saleReturn: marketPrice - earlyTermFee, feeWaived };
}

/** A requested contract length: default 3, at least 1, clamped (not refused) to the maximum. */
export function requestedLength(raw: unknown): number {
  if (raw === undefined || raw === null) return CONTRACT_LENGTH_DEFAULT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < MIN_CONTRACT_LENGTH) {
    throw new LineupError('invalid-argument', `contractLength must be an integer of at least ${MIN_CONTRACT_LENGTH}`);
  }
  return Math.min(n, MAX_CONTRACT_LENGTH);
}

/** Safe read of the team's constructor (a missing field would otherwise read Object.prototype.constructor). */
export function teamCtor(team: Record<string, any>): Record<string, any> | null {
  const c = Object.prototype.hasOwnProperty.call(team, 'constructor') ? team['constructor'] : null;
  return c && typeof c === 'object' && !Array.isArray(c) && typeof c.constructorId === 'string' ? c : null;
}

/** The team while a lineup is being applied. */
export interface LineupState {
  drivers: any[];
  constructor: Record<string, any> | null;
  budget: number;
  totalSpent: number;
  /** points moved from totalPoints into lockedPoints by the sales so far */
  banked: number;
  driverStreaks: Record<string, any> | undefined;
  driverStreaksTouched: boolean;
  driverLockouts: Record<string, number>;
  aceDriverId: unknown;
  aceConstructorId: unknown;
  /** per-move results, for the reply */
  sales: Array<{ kind: 'driver' | 'constructor'; id: string; saleReturn: number; earlyTermFee: number; feeWaived: boolean; bankedPoints: number }>;
}

export function startState(team: Record<string, any>, defaultBudget: number): LineupState {
  return {
    drivers: Array.isArray(team.drivers) ? [...team.drivers] : [],
    constructor: teamCtor(team),
    budget: typeof team.budget === 'number' ? team.budget : defaultBudget,
    totalSpent: team.totalSpent || 0,
    banked: 0,
    driverStreaks: team.driverStreaks,
    driverStreaksTouched: false,
    driverLockouts: team.driverLockouts || {},
    aceDriverId: team.aceDriverId,
    aceConstructorId: team.aceConstructorId,
    sales: [],
  };
}

/** removeDriverSecure. `marketPrice` is the drivers/{id} price, or the held price when there is none. */
export function sellDriver(s: LineupState, driverId: string, marketPrice: number | null, completedRaceCount: number): void {
  const driver = s.drivers.find((d) => d.driverId === driverId);
  if (!driver) throw new LineupError('not-found', 'Driver not on team');
  const quote = quoteSale(driver, marketPrice ?? (driver.currentPrice || 0));
  const bankedPoints = driver.pointsScored || 0;
  s.drivers = s.drivers.filter((d) => d.driverId !== driverId);
  s.budget = s.budget + quote.saleReturn;
  s.totalSpent = Math.max(0, s.totalSpent - (driver.purchasePrice || 0));
  s.banked += bankedPoints;
  s.driverStreaks = streaksAfterSale(s.driverStreaks, driver, completedRaceCount) ?? {};
  s.driverStreaksTouched = true;
  if (s.aceDriverId === driverId) s.aceDriverId = null;
  s.sales.push({ kind: 'driver', id: driverId, saleReturn: quote.saleReturn, earlyTermFee: quote.earlyTermFee, feeWaived: quote.feeWaived, bankedPoints });
}

/** removeConstructorSecure, and the sale half of setConstructorSecure. */
export function sellConstructor(s: LineupState, marketPrice: number | null): void {
  const ctor = s.constructor;
  if (!ctor) throw new LineupError('not-found', 'No constructor on team');
  const quote = quoteSale(ctor, marketPrice ?? (ctor.currentPrice || 0));
  const bankedPoints = ctor.pointsScored || 0;
  s.constructor = null;
  s.budget = s.budget + quote.saleReturn;
  s.totalSpent = Math.max(0, s.totalSpent - (ctor.purchasePrice || 0));
  s.banked += bankedPoints;
  if (s.aceConstructorId === ctor.constructorId) s.aceConstructorId = null;
  s.sales.push({ kind: 'constructor', id: ctor.constructorId, saleReturn: quote.saleReturn, earlyTermFee: quote.earlyTermFee, feeWaived: quote.feeWaived, bankedPoints });
}

/** The buy half of setConstructorSecure (the team must hold no constructor by now). */
export function buyConstructor(s: LineupState, constructorId: string, doc: Record<string, any> | null, length: number, clock: { completedRaceCount: number; racesLeft: number }): Record<string, any> {
  if (!doc) throw new LineupError('not-found', 'Constructor not found');
  if (doc.isActive === false) throw new LineupError('failed-precondition', 'Constructor is not active');
  if (s.constructor) throw new LineupError('already-exists', 'Constructor already on team');
  const price: number = typeof doc.price === 'number' ? doc.price : 0;
  if (price > s.budget) throw new LineupError('failed-precondition', `Cannot afford ${doc.name} ($${price}). Budget: $${s.budget}`);
  const fantasyCtor = {
    constructorId,
    name: doc.name || '',
    purchasePrice: price,
    currentPrice: price,
    pointsScored: 0,
    racesHeld: 0,
    contractLength: allowedContractLength(length, clock.racesLeft),
    addedAtRace: clock.completedRaceCount,
  };
  s.constructor = fantasyCtor;
  s.budget -= price;
  s.totalSpent += price;
  return fantasyCtor;
}

/** addDriverSecure. */
export function buyDriver(s: LineupState, driverId: string, doc: Record<string, any> | null, length: number, clock: { completedRaceCount: number; racesLeft: number }): Record<string, any> {
  if (!doc) throw new LineupError('not-found', 'Driver not found');
  if (doc.isActive === false) throw new LineupError('failed-precondition', 'Driver is not active');
  if (s.drivers.length >= TEAM_SIZE) throw new LineupError('failed-precondition', 'Team is full');
  if (s.drivers.some((d) => d.driverId === driverId)) throw new LineupError('already-exists', 'Driver already on team');
  const lockExpiry = Object.prototype.hasOwnProperty.call(s.driverLockouts, driverId) ? s.driverLockouts[driverId] : undefined;
  if (lockExpiry !== undefined && clock.completedRaceCount < lockExpiry) {
    throw new LineupError('failed-precondition', 'Driver is locked out after contract expiry');
  }
  // F-169: sold and re-bought in one window is one run; it may not pass six races, nor the season.
  const prior = priorStreak(s.driverStreaks, driverId, clock.completedRaceCount);
  const contractLength = allowedContractLength(length, clock.racesLeft, prior);
  if (contractLength === 0) {
    throw new LineupError('failed-precondition', `${doc.name || 'This driver'} has been on this team for ${MAX_CONSECUTIVE_RACES} races in a row, so is locked out until after the next race.`);
  }
  const price: number = typeof doc.price === 'number' ? doc.price : 0;
  if (price > s.budget) throw new LineupError('failed-precondition', `Cannot afford ${doc.name} ($${price}). Budget: $${s.budget}`);
  const fantasyDriver = {
    driverId: doc.id || driverId,
    name: doc.name || '',
    shortName: doc.shortName || '',
    constructorId: doc.constructorId || '',
    purchasePrice: price,
    currentPrice: price,
    pointsScored: 0,
    racesHeld: 0,
    contractLength,
    ...(prior > 0 ? { streakBefore: prior } : {}),
    addedAtRace: clock.completedRaceCount,
  };
  s.drivers = [...s.drivers, fantasyDriver];
  s.budget -= price;
  s.totalSpent += price;
  return fantasyDriver;
}

export interface LineupPlan {
  sellDrivers: string[];
  /** sell the constructor without buying one (a constructor buy sells the current one itself) */
  sellConstructor: boolean;
  buyConstructor: { id: string; contractLength?: unknown } | null;
  buyDrivers: Array<{ id: string; contractLength?: unknown }>;
}

/** Validate the request shape. Anything malformed is refused before a read is made. */
export function parsePlan(data: unknown): LineupPlan {
  const d = (data ?? {}) as Record<string, unknown>;
  const ids = (v: unknown, what: string): string[] => {
    if (v === undefined) return [];
    if (!Array.isArray(v) || v.length > TEAM_SIZE || v.some((x) => typeof x !== 'string' || !x || x.includes('/'))) {
      throw new LineupError('invalid-argument', `${what} must be up to ${TEAM_SIZE} ids`);
    }
    return v as string[];
  };
  const sellDrivers = ids(d.sellDrivers, 'sellDrivers');
  const buysRaw = d.buyDrivers === undefined ? [] : d.buyDrivers;
  if (!Array.isArray(buysRaw) || buysRaw.length > TEAM_SIZE) throw new LineupError('invalid-argument', `buyDrivers must be up to ${TEAM_SIZE} entries`);
  const buyDrivers = buysRaw.map((b) => {
    const id = (b as { id?: unknown })?.id;
    if (typeof id !== 'string' || !id || id.includes('/')) throw new LineupError('invalid-argument', 'buyDrivers entries need an id');
    return { id, contractLength: (b as { contractLength?: unknown }).contractLength };
  });
  if (new Set(sellDrivers).size !== sellDrivers.length || new Set(buyDrivers.map((b) => b.id)).size !== buyDrivers.length) {
    throw new LineupError('invalid-argument', 'Duplicate drivers not allowed');
  }
  let buyCtor: LineupPlan['buyConstructor'] = null;
  if (d.buyConstructor !== undefined && d.buyConstructor !== null) {
    const id = (d.buyConstructor as { id?: unknown }).id;
    if (typeof id !== 'string' || !id || id.includes('/')) throw new LineupError('invalid-argument', 'buyConstructor needs an id');
    buyCtor = { id, contractLength: (d.buyConstructor as { contractLength?: unknown }).contractLength };
  }
  const sellCtor = d.sellConstructor === true;
  if (!sellDrivers.length && !sellCtor && !buyCtor && !buyDrivers.length) throw new LineupError('invalid-argument', 'Nothing to change');
  return { sellDrivers, sellConstructor: sellCtor, buyConstructor: buyCtor, buyDrivers };
}

/**
 * Apply a whole plan, in the order the app has always sent the single moves: driver sales, a
 * constructor sale, a constructor buy (selling the held one first, as setConstructorSecure does),
 * then driver buys. All or nothing: a refusal at any step throws, and the transaction writes nothing.
 */
export function applyPlan(
  s: LineupState,
  plan: LineupPlan,
  prices: { drivers: Map<string, Record<string, any> | null>; constructors: Map<string, Record<string, any> | null> },
  clock: { completedRaceCount: number; racesLeft: number },
): { boughtDrivers: Record<string, any>[]; boughtConstructor: Record<string, any> | null } {
  const price = (doc: Record<string, any> | null | undefined): number | null => (doc && typeof doc.price === 'number' ? doc.price : null);
  for (const id of plan.sellDrivers) sellDriver(s, id, price(prices.drivers.get(id)), clock.completedRaceCount);
  if (plan.sellConstructor && !plan.buyConstructor) sellConstructor(s, price(s.constructor ? prices.constructors.get(s.constructor.constructorId) : null));
  let boughtConstructor: Record<string, any> | null = null;
  if (plan.buyConstructor) {
    if (s.constructor && s.constructor.constructorId === plan.buyConstructor.id) throw new LineupError('already-exists', 'Constructor already on team');
    if (s.constructor) sellConstructor(s, price(prices.constructors.get(s.constructor.constructorId)));
    boughtConstructor = buyConstructor(s, plan.buyConstructor.id, prices.constructors.get(plan.buyConstructor.id) ?? null, requestedLength(plan.buyConstructor.contractLength), clock);
  }
  const boughtDrivers = plan.buyDrivers.map((b) => buyDriver(s, b.id, prices.drivers.get(b.id) ?? null, requestedLength(b.contractLength), clock));
  return { boughtDrivers, boughtConstructor };
}
