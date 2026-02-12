/**
 * teamAI.ts — 25 AI user definitions + strategy logic
 */

import type {
  SimUser, SimDriverState, SimConstructorState, SimRaceResult,
  PRNG, TradeLogEntry,
} from './engine';
import {
  executeSell, executeBuy, executeSellConstructor, executeBuyConstructor,
  isDriverLockedOut, getStrength, PRICING_CONFIG,
} from './engine';

// ============================================
// Strategy Decision Interface
// ============================================
export interface StrategyDecision {
  sellDriverIds: string[];
  buyDriverIds: string[];
  aceId: string | null;
  sellConstructor: boolean;
  buyConstructorId: string | null;
}

export type StrategyFn = (ctx: StrategyContext) => StrategyDecision;

export interface StrategyContext {
  user: SimUser;
  drivers: Map<string, SimDriverState>;
  constructors: Map<string, SimConstructorState>;
  round: number;
  completedRaces: number;
  lastResults: SimRaceResult[];
  prng: PRNG;
  allDriverIds: string[];
}

// ============================================
// AI User Definition
// ============================================
export interface AIUserDef {
  name: string;
  strategyTags: string[];
  initialPick: (ctx: StrategyContext) => { driverIds: string[]; constructorId: string | null };
  perRace: StrategyFn;
}

// ============================================
// Helper: pick best-form ace (eligible = price <= 100)
// ============================================
function bestFormAce(user: SimUser, drivers: Map<string, SimDriverState>, lastResults: SimRaceResult[]): string | null {
  let best: string | null = null;
  let bestScore = -1;
  for (const c of user.drivers) {
    if (c.currentPrice > PRICING_CONFIG.ACE_MAX_PRICE) continue;
    const ds = drivers.get(c.driverId);
    if (!ds) continue;
    const form = ds.rollingPoints.slice(0, 3).reduce((a, b) => a + b, 0);
    if (form > bestScore) { bestScore = form; best = c.driverId; }
  }
  return best;
}

function consistentAce(user: SimUser, drivers: Map<string, SimDriverState>): string | null {
  let best: string | null = null;
  let bestConsistency = -1;
  for (const c of user.drivers) {
    if (c.currentPrice > PRICING_CONFIG.ACE_MAX_PRICE) continue;
    const s = getStrength(c.driverId);
    if (s.consistency > bestConsistency) { bestConsistency = s.consistency; best = c.driverId; }
  }
  return best;
}

function lastRaceBestAce(user: SimUser, lastResults: SimRaceResult[]): string | null {
  let best: string | null = null;
  let bestPts = -1;
  for (const c of user.drivers) {
    if (c.currentPrice > PRICING_CONFIG.ACE_MAX_PRICE) continue;
    const r = lastResults.find(lr => lr.driverId === c.driverId);
    const pts = r ? r.totalPoints : 0;
    if (pts > bestPts) { bestPts = pts; best = c.driverId; }
  }
  return best;
}

function cheapestAvailable(
  ctx: StrategyContext,
  exclude: Set<string>,
  count: number,
  budget: number,
): string[] {
  const sorted = [...ctx.drivers.entries()]
    .filter(([id]) => !exclude.has(id) && !isDriverLockedOut(ctx.user.driverLockouts, id, ctx.completedRaces))
    .sort((a, b) => a[1].price - b[1].price);
  const picks: string[] = [];
  let rem = budget;
  for (const [id, ds] of sorted) {
    if (picks.length >= count) break;
    if (ds.price <= rem) { picks.push(id); rem -= ds.price; }
  }
  return picks;
}

function bestFormAvailable(
  ctx: StrategyContext,
  exclude: Set<string>,
  maxPrice: number,
): string | null {
  let best: string | null = null;
  let bestForm = -Infinity;
  for (const [id, ds] of ctx.drivers) {
    if (exclude.has(id)) continue;
    if (isDriverLockedOut(ctx.user.driverLockouts, id, ctx.completedRaces)) continue;
    if (ds.price > maxPrice) continue;
    const form = ds.rollingPoints.slice(0, 3).reduce((a, b) => a + b, 0);
    if (form > bestForm) { bestForm = form; best = id; }
  }
  return best;
}

function driverPrice(ctx: StrategyContext, id: string): number {
  return ctx.drivers.get(id)?.price ?? 999;
}

function noOp(): StrategyDecision {
  return { sellDriverIds: [], buyDriverIds: [], aceId: null, sellConstructor: false, buyConstructorId: null };
}

function greedyPick(ctx: StrategyContext, preferred: string[]): { driverIds: string[]; constructorId: string | null } {
  let budget = PRICING_CONFIG.STARTING_BUDGET;
  const picked: string[] = [];
  let conId: string | null = null;

  // Try to buy a mid-range constructor first
  const sortedCons = [...ctx.constructors.entries()].sort((a, b) => b[1].price - a[1].price);
  for (const [cid, cs] of sortedCons) {
    if (cs.price <= budget * 0.3) { conId = cid; budget -= cs.price; break; }
  }

  for (const id of preferred) {
    if (picked.length >= 5) break;
    const p = driverPrice(ctx, id);
    if (p <= budget) { picked.push(id); budget -= p; }
  }
  // Fill remaining
  if (picked.length < 5) {
    const cheap = cheapestAvailable(ctx, new Set(picked), 5 - picked.length, budget);
    picked.push(...cheap);
  }
  return { driverIds: picked.slice(0, 5), constructorId: conId };
}

function specificPick(
  ctx: StrategyContext,
  driverIds: string[],
  constructorId: string | null,
): { driverIds: string[]; constructorId: string | null } {
  let budget = PRICING_CONFIG.STARTING_BUDGET;
  let conId: string | null = null;

  if (constructorId) {
    const cs = ctx.constructors.get(constructorId);
    if (cs && cs.price <= budget) { conId = constructorId; budget -= cs.price; }
  }

  const picked: string[] = [];
  for (const id of driverIds) {
    if (picked.length >= 5) break;
    const p = driverPrice(ctx, id);
    if (p <= budget) { picked.push(id); budget -= p; }
  }
  if (picked.length < 5) {
    const cheap = cheapestAvailable(ctx, new Set(picked), 5 - picked.length, budget);
    picked.push(...cheap);
  }
  return { driverIds: picked.slice(0, 5), constructorId: conId };
}

// ============================================
// Worst driver on team (by recent form)
// ============================================
function worstDriverOnTeam(user: SimUser, drivers: Map<string, SimDriverState>): string | null {
  let worst: string | null = null;
  let worstForm = Infinity;
  for (const c of user.drivers) {
    const ds = drivers.get(c.driverId);
    if (!ds) continue;
    const form = ds.rollingPoints.slice(0, 3).reduce((a, b) => a + b, 0);
    if (form < worstForm) { worstForm = form; worst = c.driverId; }
  }
  return worst;
}

// ============================================
// 25 AI Strategies
// ============================================

// --- Group 1: Top Heavy ---
const MaxPower_Mike: AIUserDef = {
  name: 'MaxPower_Mike',
  strategyTags: ['top-heavy', 'active'],
  initialPick: (ctx) => specificPick(ctx, ['verstappen', 'norris', 'bottas', 'perez', 'colapinto'], null),
  perRace: (ctx) => {
    const d: StrategyDecision = { sellDriverIds: [], buyDriverIds: [], aceId: bestFormAce(ctx.user, ctx.drivers, ctx.lastResults), sellConstructor: false, buyConstructorId: null };
    if (ctx.round > 1 && ctx.round % 3 === 0) {
      const worst = worstDriverOnTeam(ctx.user, ctx.drivers);
      if (worst) {
        const owned = new Set(ctx.user.drivers.map(c => c.driverId));
        const worstDs = ctx.drivers.get(worst);
        const maxBudget = ctx.user.budget + (worstDs?.price ?? 0);
        const replacement = bestFormAvailable(ctx, owned, maxBudget);
        if (replacement && replacement !== worst) {
          d.sellDriverIds = [worst];
          d.buyDriverIds = [replacement];
        }
      }
    }
    return d;
  },
};

const BigBudget_Brenda: AIUserDef = {
  name: 'BigBudget_Brenda',
  strategyTags: ['top-heavy', 'passive'],
  initialPick: (ctx) => specificPick(ctx, ['piastri', 'leclerc', 'russell', 'bottas', 'perez'], null),
  perRace: (ctx) => ({
    ...noOp(),
    aceId: consistentAce(ctx.user, ctx.drivers),
  }),
};

const McLarenStack_Marco: AIUserDef = {
  name: 'McLarenStack_Marco',
  strategyTags: ['top-heavy', 'passive', 'stacker'],
  initialPick: (ctx) => specificPick(ctx, ['norris', 'piastri', 'bottas', 'perez', 'colapinto'], 'mclaren'),
  perRace: (ctx) => ({
    ...noOp(),
    aceId: bestFormAce(ctx.user, ctx.drivers, ctx.lastResults),
  }),
};

// --- Group 2: Balanced ---
const Balanced_Beth: AIUserDef = {
  name: 'Balanced_Beth',
  strategyTags: ['balanced', 'moderate'],
  initialPick: (ctx) => specificPick(ctx, ['hamilton', 'sainz', 'alonso', 'antonelli', 'albon'], null),
  perRace: (ctx) => {
    const d: StrategyDecision = { ...noOp(), aceId: bestFormAce(ctx.user, ctx.drivers, ctx.lastResults) };
    if (ctx.round > 4 && ctx.round % 4 === 0) {
      const worst = worstDriverOnTeam(ctx.user, ctx.drivers);
      if (worst) {
        const owned = new Set(ctx.user.drivers.map(c => c.driverId));
        const maxBudget = ctx.user.budget + (ctx.drivers.get(worst)?.price ?? 0);
        const repl = bestFormAvailable(ctx, owned, maxBudget);
        if (repl) { d.sellDriverIds = [worst]; d.buyDriverIds = [repl]; }
      }
    }
    return d;
  },
};

const Steady_Steve: AIUserDef = {
  name: 'Steady_Steve',
  strategyTags: ['balanced', 'passive'],
  initialPick: (ctx) => specificPick(ctx, ['leclerc', 'sainz', 'gasly', 'ocon', 'bearman'], null),
  perRace: (ctx) => ({ ...noOp(), aceId: consistentAce(ctx.user, ctx.drivers) }),
};

const FormChaser_Fiona: AIUserDef = {
  name: 'FormChaser_Fiona',
  strategyTags: ['balanced', 'active'],
  initialPick: (ctx) => specificPick(ctx, ['russell', 'hamilton', 'albon', 'stroll', 'hulkenberg'], null),
  perRace: (ctx) => {
    const d: StrategyDecision = { ...noOp(), aceId: lastRaceBestAce(ctx.user, ctx.lastResults) };
    if (ctx.round > 2 && ctx.round % 2 === 0) {
      const worst = worstDriverOnTeam(ctx.user, ctx.drivers);
      if (worst) {
        const owned = new Set(ctx.user.drivers.map(c => c.driverId));
        const maxBudget = ctx.user.budget + (ctx.drivers.get(worst)?.price ?? 0);
        const repl = bestFormAvailable(ctx, owned, maxBudget);
        if (repl) { d.sellDriverIds = [worst]; d.buyDriverIds = [repl]; }
      }
    }
    return d;
  },
};

const Optimizer_Oscar: AIUserDef = {
  name: 'Optimizer_Oscar',
  strategyTags: ['balanced', 'value'],
  initialPick: (ctx) => {
    // Best points-per-dollar
    const sorted = [...ctx.drivers.entries()]
      .map(([id, ds]) => ({ id, ppd: getStrength(id).baseStrength / Math.max(ds.price, 1) }))
      .sort((a, b) => b.ppd - a.ppd)
      .map(x => x.id);
    return greedyPick(ctx, sorted);
  },
  perRace: (ctx) => {
    const d: StrategyDecision = { ...noOp(), aceId: bestFormAce(ctx.user, ctx.drivers, ctx.lastResults) };
    // Sell on 20%+ price rise
    for (const c of ctx.user.drivers) {
      if (c.currentPrice >= c.purchasePrice * 1.2 && c.racesHeld >= 2) {
        const owned = new Set(ctx.user.drivers.map(cc => cc.driverId));
        const repl = bestFormAvailable(ctx, owned, ctx.user.budget + c.currentPrice);
        if (repl) {
          d.sellDriverIds.push(c.driverId);
          d.buyDriverIds.push(repl);
          break; // one trade per race
        }
      }
    }
    return d;
  },
};

// --- Group 3: Budget / Value ---
const Bargain_Bob: AIUserDef = {
  name: 'Bargain_Bob',
  strategyTags: ['budget', 'passive'],
  initialPick: (ctx) => {
    const sorted = [...ctx.drivers.entries()].sort((a, b) => a[1].price - b[1].price).map(([id]) => id);
    const cheapCon = [...ctx.constructors.entries()].sort((a, b) => a[1].price - b[1].price)[0]?.[0] ?? null;
    return specificPick(ctx, sorted.slice(0, 5), cheapCon);
  },
  perRace: (ctx) => ({ ...noOp(), aceId: bestFormAce(ctx.user, ctx.drivers, ctx.lastResults) }),
};

const ValuePick_Vera: AIUserDef = {
  name: 'ValuePick_Vera',
  strategyTags: ['budget', 'active', 'value'],
  initialPick: (ctx) => {
    const cheap = [...ctx.drivers.entries()]
      .filter(([, ds]) => ds.price <= 30)
      .sort((a, b) => a[1].price - b[1].price)
      .map(([id]) => id);
    return specificPick(ctx, ['sainz', ...cheap], null);
  },
  perRace: (ctx) => {
    const d: StrategyDecision = { ...noOp(), aceId: bestFormAce(ctx.user, ctx.drivers, ctx.lastResults) };
    if (ctx.round > 2 && ctx.round % 2 === 0) {
      for (const c of ctx.user.drivers) {
        if (c.currentPrice >= c.purchasePrice * 1.15) {
          const owned = new Set(ctx.user.drivers.map(cc => cc.driverId));
          const repl = bestFormAvailable(ctx, owned, ctx.user.budget + c.currentPrice);
          if (repl) { d.sellDriverIds.push(c.driverId); d.buyDriverIds.push(repl); break; }
        }
      }
    }
    return d;
  },
};

const PennyWise_Pat: AIUserDef = {
  name: 'PennyWise_Pat',
  strategyTags: ['budget', 'moderate'],
  initialPick: (ctx) => {
    const sorted = [...ctx.drivers.entries()].sort((a, b) => a[1].price - b[1].price).map(([id]) => id);
    return specificPick(ctx, sorted.slice(0, 5), null);
  },
  perRace: (ctx) => {
    const d: StrategyDecision = { ...noOp(), aceId: bestFormAce(ctx.user, ctx.drivers, ctx.lastResults) };
    // Trade exactly every 5 races to avoid stale
    if (ctx.user.racesSinceTransfer >= PRICING_CONFIG.STALE_ROSTER_THRESHOLD) {
      const worst = worstDriverOnTeam(ctx.user, ctx.drivers);
      if (worst) {
        const owned = new Set(ctx.user.drivers.map(c => c.driverId));
        const repl = bestFormAvailable(ctx, owned, ctx.user.budget + (ctx.drivers.get(worst)?.price ?? 0));
        if (repl) { d.sellDriverIds = [worst]; d.buyDriverIds = [repl]; }
      }
    }
    return d;
  },
};

const RisingStars_Rita: AIUserDef = {
  name: 'RisingStars_Rita',
  strategyTags: ['budget', 'rookies', 'moderate'],
  initialPick: (ctx) => specificPick(ctx, ['antonelli', 'hadjar', 'bearman', 'lawson', 'bortoleto'], null),
  perRace: (ctx) => {
    const d: StrategyDecision = { ...noOp(), aceId: bestFormAce(ctx.user, ctx.drivers, ctx.lastResults) };
    // Hold mostly, swap worst every 5 races
    if (ctx.round > 5 && ctx.round % 5 === 0) {
      const worst = worstDriverOnTeam(ctx.user, ctx.drivers);
      if (worst) {
        const owned = new Set(ctx.user.drivers.map(c => c.driverId));
        const repl = bestFormAvailable(ctx, owned, ctx.user.budget + (ctx.drivers.get(worst)?.price ?? 0));
        if (repl) { d.sellDriverIds = [worst]; d.buyDriverIds = [repl]; }
      }
    }
    return d;
  },
};

// --- Group 4: Team Stackers ---
const FerrariForever_Franco: AIUserDef = {
  name: 'FerrariForever_Franco',
  strategyTags: ['stacker', 'moderate'],
  initialPick: (ctx) => specificPick(ctx, ['leclerc', 'hamilton', 'bottas', 'perez', 'colapinto'], 'ferrari'),
  perRace: (ctx) => {
    const d: StrategyDecision = { ...noOp(), aceId: bestFormAce(ctx.user, ctx.drivers, ctx.lastResults) };
    if (ctx.round > 4 && ctx.round % 5 === 0) {
      const worst = worstDriverOnTeam(ctx.user, ctx.drivers);
      if (worst && worst !== 'leclerc' && worst !== 'hamilton') {
        const owned = new Set(ctx.user.drivers.map(c => c.driverId));
        const repl = bestFormAvailable(ctx, owned, ctx.user.budget + (ctx.drivers.get(worst)?.price ?? 0));
        if (repl) { d.sellDriverIds = [worst]; d.buyDriverIds = [repl]; }
      }
    }
    return d;
  },
};

const RedBull_Ravi: AIUserDef = {
  name: 'RedBull_Ravi',
  strategyTags: ['stacker', 'moderate'],
  initialPick: (ctx) => specificPick(ctx, ['verstappen', 'hadjar', 'bottas', 'perez', 'colapinto'], 'red_bull'),
  perRace: (ctx) => {
    const d: StrategyDecision = { ...noOp(), aceId: bestFormAce(ctx.user, ctx.drivers, ctx.lastResults) };
    if (ctx.round > 4 && ctx.round % 5 === 0) {
      const worst = worstDriverOnTeam(ctx.user, ctx.drivers);
      if (worst && worst !== 'verstappen' && worst !== 'hadjar') {
        const owned = new Set(ctx.user.drivers.map(c => c.driverId));
        const repl = bestFormAvailable(ctx, owned, ctx.user.budget + (ctx.drivers.get(worst)?.price ?? 0));
        if (repl) { d.sellDriverIds = [worst]; d.buyDriverIds = [repl]; }
      }
    }
    return d;
  },
};

const Mercedes_Maya: AIUserDef = {
  name: 'Mercedes_Maya',
  strategyTags: ['stacker', 'moderate'],
  initialPick: (ctx) => specificPick(ctx, ['russell', 'antonelli', 'bottas', 'perez', 'colapinto'], 'mercedes'),
  perRace: (ctx) => {
    const d: StrategyDecision = { ...noOp(), aceId: bestFormAce(ctx.user, ctx.drivers, ctx.lastResults) };
    if (ctx.round > 4 && ctx.round % 5 === 0) {
      const worst = worstDriverOnTeam(ctx.user, ctx.drivers);
      if (worst && worst !== 'russell' && worst !== 'antonelli') {
        const owned = new Set(ctx.user.drivers.map(c => c.driverId));
        const repl = bestFormAvailable(ctx, owned, ctx.user.budget + (ctx.drivers.get(worst)?.price ?? 0));
        if (repl) { d.sellDriverIds = [worst]; d.buyDriverIds = [repl]; }
      }
    }
    return d;
  },
};

// --- Group 5: Active Traders ---
const DayTrader_Dan: AIUserDef = {
  name: 'DayTrader_Dan',
  strategyTags: ['active', 'aggressive'],
  initialPick: (ctx) => specificPick(ctx, ['hamilton', 'sainz', 'albon', 'gasly', 'ocon'], null),
  perRace: (ctx) => {
    const d: StrategyDecision = { ...noOp(), aceId: bestFormAce(ctx.user, ctx.drivers, ctx.lastResults) };
    // Trade EVERY race
    if (ctx.round > 1) {
      const worst = worstDriverOnTeam(ctx.user, ctx.drivers);
      if (worst) {
        const owned = new Set(ctx.user.drivers.map(c => c.driverId));
        const repl = bestFormAvailable(ctx, owned, ctx.user.budget + (ctx.drivers.get(worst)?.price ?? 0));
        if (repl) { d.sellDriverIds = [worst]; d.buyDriverIds = [repl]; }
      }
    }
    return d;
  },
};

const SwingTrader_Sam: AIUserDef = {
  name: 'SwingTrader_Sam',
  strategyTags: ['active', 'value'],
  initialPick: (ctx) => {
    const cheap = [...ctx.drivers.entries()].sort((a, b) => a[1].price - b[1].price).map(([id]) => id);
    return specificPick(ctx, cheap.slice(0, 5), null);
  },
  perRace: (ctx) => {
    const d: StrategyDecision = { ...noOp(), aceId: bestFormAce(ctx.user, ctx.drivers, ctx.lastResults) };
    if (ctx.round > 2 && ctx.round % 2 === 0) {
      // Sell biggest gainer
      let bestProfit = 0;
      let sellId: string | null = null;
      for (const c of ctx.user.drivers) {
        const profit = c.currentPrice - c.purchasePrice;
        if (profit > bestProfit) { bestProfit = profit; sellId = c.driverId; }
      }
      if (sellId && bestProfit > 5) {
        const owned = new Set(ctx.user.drivers.map(c => c.driverId));
        // Buy cheapest available
        const cheapest = [...ctx.drivers.entries()]
          .filter(([id]) => !owned.has(id) && !isDriverLockedOut(ctx.user.driverLockouts, id, ctx.completedRaces))
          .sort((a, b) => a[1].price - b[1].price)[0];
        if (cheapest) { d.sellDriverIds = [sellId]; d.buyDriverIds = [cheapest[0]]; }
      }
    }
    return d;
  },
};

const HotHand_Hannah: AIUserDef = {
  name: 'HotHand_Hannah',
  strategyTags: ['active', 'hot-hand'],
  initialPick: (ctx) => specificPick(ctx, ['russell', 'sainz', 'albon', 'gasly', 'hulkenberg'], null),
  perRace: (ctx) => {
    const d: StrategyDecision = { ...noOp(), aceId: bestFormAce(ctx.user, ctx.drivers, ctx.lastResults) };
    if (ctx.round > 1 && ctx.lastResults.length > 0) {
      // Find last-race podium finisher not on team
      const owned = new Set(ctx.user.drivers.map(c => c.driverId));
      const hero = ctx.lastResults
        .filter(r => !r.dnf && r.position <= 3 && !owned.has(r.driverId))
        .sort((a, b) => a.position - b.position)[0];
      if (hero) {
        const worst = worstDriverOnTeam(ctx.user, ctx.drivers);
        if (worst) {
          const maxBudget = ctx.user.budget + (ctx.drivers.get(worst)?.price ?? 0);
          if ((ctx.drivers.get(hero.driverId)?.price ?? 999) <= maxBudget) {
            d.sellDriverIds = [worst];
            d.buyDriverIds = [hero.driverId];
          }
        }
      }
    }
    return d;
  },
};

// --- Group 6: Passive / Set-and-Forget ---
const SetForget_Sean: AIUserDef = {
  name: 'SetForget_Sean',
  strategyTags: ['passive', 'set-and-forget'],
  initialPick: (ctx) => {
    // Best greedy team
    const sorted = [...ctx.drivers.entries()]
      .sort((a, b) => getStrength(b[0]).baseStrength - getStrength(a[0]).baseStrength)
      .map(([id]) => id);
    return greedyPick(ctx, sorted);
  },
  perRace: (ctx) => ({
    ...noOp(),
    aceId: bestFormAce(ctx.user, ctx.drivers, ctx.lastResults),
  }),
};

const Lazy_Larry: AIUserDef = {
  name: 'Lazy_Larry',
  strategyTags: ['passive', 'no-ace'],
  initialPick: (ctx) => {
    // Random team
    const shuffled = ctx.prng.shuffle(ctx.allDriverIds);
    let budget = PRICING_CONFIG.STARTING_BUDGET;
    const picked: string[] = [];
    for (const id of shuffled) {
      if (picked.length >= 5) break;
      const p = ctx.drivers.get(id)?.price ?? 999;
      if (p <= budget) { picked.push(id); budget -= p; }
    }
    return { driverIds: picked, constructorId: null };
  },
  perRace: () => noOp(), // Never trades, never sets ace
};

const OnceAYear_Olivia: AIUserDef = {
  name: 'OnceAYear_Olivia',
  strategyTags: ['passive', 'rare-trader'],
  initialPick: (ctx) => specificPick(ctx, ['hamilton', 'sainz', 'alonso', 'gasly', 'bearman'], null),
  perRace: (ctx) => {
    const d: StrategyDecision = { ...noOp(), aceId: bestFormAce(ctx.user, ctx.drivers, ctx.lastResults) };
    // Single trade at race 12
    if (ctx.round === 12) {
      const worst = worstDriverOnTeam(ctx.user, ctx.drivers);
      if (worst) {
        const owned = new Set(ctx.user.drivers.map(c => c.driverId));
        const repl = bestFormAvailable(ctx, owned, ctx.user.budget + (ctx.drivers.get(worst)?.price ?? 0));
        if (repl) { d.sellDriverIds = [worst]; d.buyDriverIds = [repl]; }
      }
    }
    return d;
  },
};

// --- Group 7: Specialists ---
const Contrarian_Carl: AIUserDef = {
  name: 'Contrarian_Carl',
  strategyTags: ['specialist', 'contrarian', 'active'],
  initialPick: (ctx) => specificPick(ctx, ['alonso', 'stroll', 'gasly', 'ocon', 'hulkenberg'], null),
  perRace: (ctx) => {
    const d: StrategyDecision = { ...noOp(), aceId: bestFormAce(ctx.user, ctx.drivers, ctx.lastResults) };
    if (ctx.round > 3 && ctx.round % 3 === 0) {
      // Sell driver who rose the most, buy driver who dropped the most
      let bestRise = 0; let sellId: string | null = null;
      for (const c of ctx.user.drivers) {
        const ds = ctx.drivers.get(c.driverId);
        if (ds && ds.price - ds.previousPrice > bestRise) { bestRise = ds.price - ds.previousPrice; sellId = c.driverId; }
      }
      if (sellId && bestRise > 5) {
        const owned = new Set(ctx.user.drivers.map(c => c.driverId));
        // Buy most-dipped driver
        let bestDip = 0; let buyId: string | null = null;
        for (const [id, ds] of ctx.drivers) {
          if (owned.has(id) || isDriverLockedOut(ctx.user.driverLockouts, id, ctx.completedRaces)) continue;
          const dip = ds.previousPrice - ds.price;
          if (dip > bestDip && ds.price <= ctx.user.budget + (ctx.drivers.get(sellId)?.price ?? 0)) {
            bestDip = dip; buyId = id;
          }
        }
        if (buyId) { d.sellDriverIds = [sellId]; d.buyDriverIds = [buyId]; }
      }
    }
    return d;
  },
};

const AceExpert_Amy: AIUserDef = {
  name: 'AceExpert_Amy',
  strategyTags: ['specialist', 'ace-focused'],
  initialPick: (ctx) => {
    // All drivers <= $100
    const eligible = [...ctx.drivers.entries()]
      .filter(([, ds]) => ds.price <= PRICING_CONFIG.ACE_MAX_PRICE)
      .sort((a, b) => getStrength(b[0]).baseStrength - getStrength(a[0]).baseStrength)
      .map(([id]) => id);
    return specificPick(ctx, eligible.slice(0, 5), null);
  },
  perRace: (ctx) => {
    const d: StrategyDecision = { ...noOp(), aceId: bestFormAce(ctx.user, ctx.drivers, ctx.lastResults) };
    // Swap out any driver who became > $100 (can't ace them)
    if (ctx.round > 3 && ctx.round % 3 === 0) {
      for (const c of ctx.user.drivers) {
        if (c.currentPrice > PRICING_CONFIG.ACE_MAX_PRICE) {
          const owned = new Set(ctx.user.drivers.map(cc => cc.driverId));
          const repl = [...ctx.drivers.entries()]
            .filter(([id, ds]) => !owned.has(id) && ds.price <= PRICING_CONFIG.ACE_MAX_PRICE
              && ds.price <= ctx.user.budget + c.currentPrice
              && !isDriverLockedOut(ctx.user.driverLockouts, id, ctx.completedRaces))
            .sort((a, b) => getStrength(b[0]).baseStrength - getStrength(a[0]).baseStrength)[0];
          if (repl) { d.sellDriverIds.push(c.driverId); d.buyDriverIds.push(repl[0]); break; }
        }
      }
    }
    return d;
  },
};

const Constructor_Chris: AIUserDef = {
  name: 'Constructor_Chris',
  strategyTags: ['specialist', 'constructor-focused'],
  initialPick: (ctx) => {
    // Top constructor + its two drivers
    const topCon = [...ctx.constructors.entries()].sort((a, b) => b[1].price - a[1].price)[0];
    const conDrivers = topCon ? topCon[1].driverIds : [];
    return specificPick(ctx, [...conDrivers, 'albon', 'gasly', 'bottas'], topCon?.[0] ?? null);
  },
  perRace: (ctx) => {
    const d: StrategyDecision = { ...noOp(), aceId: bestFormAce(ctx.user, ctx.drivers, ctx.lastResults) };
    // If constructor expired, buy best available constructor
    if (!ctx.user.constructorContract && ctx.round > 1) {
      const available = [...ctx.constructors.entries()]
        .filter(([id]) => !isDriverLockedOut(ctx.user.constructorLockouts, id, ctx.completedRaces))
        .sort((a, b) => b[1].seasonTotalPoints - a[1].seasonTotalPoints);
      if (available.length > 0 && available[0][1].price <= ctx.user.budget) {
        d.buyConstructorId = available[0][0];
      }
    }
    return d;
  },
};

const Adaptive_Morgan: AIUserDef = {
  name: 'Adaptive_Morgan',
  strategyTags: ['specialist', 'adaptive'],
  initialPick: (ctx) => specificPick(ctx, ['leclerc', 'sainz', 'albon', 'gasly', 'hulkenberg'], null),
  perRace: (ctx) => {
    const d: StrategyDecision = { ...noOp(), aceId: bestFormAce(ctx.user, ctx.drivers, ctx.lastResults) };
    // Passive first 12, aggressive last 12
    if (ctx.round > 12 && ctx.round % 2 === 0) {
      const worst = worstDriverOnTeam(ctx.user, ctx.drivers);
      if (worst) {
        const owned = new Set(ctx.user.drivers.map(c => c.driverId));
        const repl = bestFormAvailable(ctx, owned, ctx.user.budget + (ctx.drivers.get(worst)?.price ?? 0));
        if (repl) { d.sellDriverIds = [worst]; d.buyDriverIds = [repl]; }
      }
    }
    return d;
  },
};

const Wildcard_Wendy: AIUserDef = {
  name: 'Wildcard_Wendy',
  strategyTags: ['specialist', 'random'],
  initialPick: (ctx) => {
    const shuffled = ctx.prng.shuffle(ctx.allDriverIds);
    let budget = PRICING_CONFIG.STARTING_BUDGET;
    const picked: string[] = [];
    for (const id of shuffled) {
      if (picked.length >= 5) break;
      const p = ctx.drivers.get(id)?.price ?? 999;
      if (p <= budget) { picked.push(id); budget -= p; }
    }
    const conShuffled = ctx.prng.shuffle([...ctx.constructors.keys()]);
    let conId: string | null = null;
    for (const cid of conShuffled) {
      const cp = ctx.constructors.get(cid)?.price ?? 999;
      if (cp <= budget) { conId = cid; break; }
    }
    return { driverIds: picked, constructorId: conId };
  },
  perRace: (ctx) => {
    const d: StrategyDecision = { ...noOp(), aceId: null };
    // Random ace
    const eligible = ctx.user.drivers.filter(c => c.currentPrice <= PRICING_CONFIG.ACE_MAX_PRICE);
    if (eligible.length > 0) {
      d.aceId = eligible[ctx.prng.randInt(0, eligible.length - 1)].driverId;
    }
    // 40% chance to trade
    if (ctx.round > 1 && ctx.prng.next() < 0.4) {
      const idx = ctx.prng.randInt(0, ctx.user.drivers.length - 1);
      const sellId = ctx.user.drivers[idx].driverId;
      const owned = new Set(ctx.user.drivers.map(c => c.driverId));
      const avail = ctx.allDriverIds.filter(id => !owned.has(id) && !isDriverLockedOut(ctx.user.driverLockouts, id, ctx.completedRaces));
      if (avail.length > 0) {
        const shuffled = ctx.prng.shuffle(avail);
        const maxBudget = ctx.user.budget + (ctx.drivers.get(sellId)?.price ?? 0);
        for (const bid of shuffled) {
          if ((ctx.drivers.get(bid)?.price ?? 999) <= maxBudget) {
            d.sellDriverIds = [sellId];
            d.buyDriverIds = [bid];
            break;
          }
        }
      }
    }
    return d;
  },
};

// ============================================
// Export all 25
// ============================================
export const ALL_AI_USERS: AIUserDef[] = [
  MaxPower_Mike, BigBudget_Brenda, McLarenStack_Marco,
  Balanced_Beth, Steady_Steve, FormChaser_Fiona, Optimizer_Oscar,
  Bargain_Bob, ValuePick_Vera, PennyWise_Pat, RisingStars_Rita,
  FerrariForever_Franco, RedBull_Ravi, Mercedes_Maya,
  DayTrader_Dan, SwingTrader_Sam, HotHand_Hannah,
  SetForget_Sean, Lazy_Larry, OnceAYear_Olivia,
  Contrarian_Carl, AceExpert_Amy, Constructor_Chris, Adaptive_Morgan, Wildcard_Wendy,
];
