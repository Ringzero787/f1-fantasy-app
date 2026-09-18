/**
 * Pick Team planning — pure. The Picker edits a *pending* lineup locally and
 * commits once on SAVE LINEUP; this module turns (current roster, pending
 * lineup, market prices) into the sells and buys that commit implies, with
 * the same early-termination quote the server charges.
 */
import { estimateSaleQuote } from '../../utils/saleQuote';

export type Kind = 'driver' | 'constructor';

export interface RosterEntry {
  id: string;
  name: string;
  currentPrice: number;
  contractLength?: number;
  racesHeld?: number;
  isReservePick?: boolean;
}

export interface MarketEntry {
  id: string;
  name: string;
  price: number;
}

export interface CurrentLineup {
  drivers: RosterEntry[];
  constructor: RosterEntry | null;
  budget: number;
}

export interface PendingLineup {
  driverIds: string[];
  constructorId: string | null;
  /** contract length chosen for each *new* pick */
  contracts: Record<string, number>;
}

export interface Sell { kind: Kind; id: string; name: string; marketPrice: number; fee: number; saleReturn: number }
export interface Buy { kind: Kind; id: string; name: string; price: number; contract: number }

export interface LineupPlan {
  sells: Sell[];
  buys: Buy[];
  budgetBefore: number;
  budgetAfter: number;
  changed: boolean;
  /** 5 drivers + 1 constructor in the pending lineup */
  complete: boolean;
  missingDrivers: number;
  missingConstructor: boolean;
}

export function pendingFromCurrent(current: CurrentLineup): PendingLineup {
  return { driverIds: current.drivers.map((d) => d.id), constructorId: current.constructor?.id ?? null, contracts: {} };
}

function sellOf(kind: Kind, e: RosterEntry, marketPrice?: number): Sell {
  const q = estimateSaleQuote({ currentPrice: e.currentPrice, contractLength: e.contractLength, racesHeld: e.racesHeld, isReservePick: e.isReservePick }, marketPrice);
  return { kind, id: e.id, name: e.name, marketPrice: q.marketPrice, fee: q.earlyTermFee, saleReturn: q.saleReturn };
}

export function planLineup(
  current: CurrentLineup,
  pending: PendingLineup,
  market: { drivers: Record<string, MarketEntry>; constructors: Record<string, MarketEntry> },
  opts: { teamSize: number; defaultContract: number },
): LineupPlan {
  const sells: Sell[] = [];
  const buys: Buy[] = [];
  const keep = new Set(pending.driverIds);

  for (const d of current.drivers) {
    if (!keep.has(d.id)) sells.push(sellOf('driver', d, market.drivers[d.id]?.price));
  }
  const have = new Set(current.drivers.map((d) => d.id));
  for (const id of pending.driverIds) {
    if (have.has(id)) continue;
    const m = market.drivers[id];
    if (!m) continue;
    buys.push({ kind: 'driver', id, name: m.name, price: m.price, contract: pending.contracts[id] ?? opts.defaultContract });
  }

  const curCtor = current.constructor?.id ?? null;
  if (curCtor !== pending.constructorId) {
    if (current.constructor) sells.push(sellOf('constructor', current.constructor, market.constructors[current.constructor.id]?.price));
    if (pending.constructorId) {
      const m = market.constructors[pending.constructorId];
      if (m) buys.push({ kind: 'constructor', id: m.id, name: m.name, price: m.price, contract: pending.contracts[m.id] ?? opts.defaultContract });
    }
  }

  const budgetAfter = current.budget + sells.reduce((s, x) => s + x.saleReturn, 0) - buys.reduce((s, x) => s + x.price, 0);
  const missingDrivers = Math.max(0, opts.teamSize - pending.driverIds.length);
  const missingConstructor = !pending.constructorId;
  return {
    sells,
    buys,
    budgetBefore: current.budget,
    budgetAfter,
    changed: sells.length > 0 || buys.length > 0,
    complete: missingDrivers === 0 && !missingConstructor,
    missingDrivers,
    missingConstructor,
  };
}

/** Can this unselected market entry be added on top of the pending plan? */
export function canAffordAdd(plan: LineupPlan, price: number): boolean {
  return price <= plan.budgetAfter;
}

/**
 * Budget available to *replace* the pending constructor with another one:
 * dropping the pending pick refunds its buy price (new pick) or its sale
 * return (the current constructor).
 */
export function constructorSwapBudget(plan: LineupPlan, current: CurrentLineup, pending: PendingLineup, market: Record<string, MarketEntry>): number {
  if (!pending.constructorId) return plan.budgetAfter;
  const isCurrent = current.constructor?.id === pending.constructorId;
  if (isCurrent && current.constructor) {
    return plan.budgetAfter + sellOf('constructor', current.constructor, market[current.constructor.id]?.price).saleReturn;
  }
  return plan.budgetAfter + (market[pending.constructorId]?.price ?? 0);
}

/** Save-button label per TRANSITION.md §4. */
export function saveLabel(plan: LineupPlan, locked: boolean): { label: string; ready: boolean } {
  if (locked) return { label: 'LOCKED · AUTO-FILL ON', ready: false };
  if (!plan.complete) {
    const n = plan.missingDrivers + (plan.missingConstructor ? 1 : 0);
    return { label: `PICK ${n} MORE`, ready: false };
  }
  if (!plan.changed) return { label: 'LINEUP SAVED', ready: false };
  return { label: 'SAVE LINEUP', ready: true };
}
