/**
 * Simulation Engine — Race sim, pricing, contracts, scoring, PRNG
 */

import {
  PRICING_CONFIG,
  RACE_POINTS,
  SPRINT_POINTS,
  calculateRollingAverage,
  calculatePriceFromRollingAvg,
  calculatePriceChange,
  getRacePoints,
  getSprintPoints,
} from '../../src/config/pricing.config';
import { demoDrivers, demoConstructors, demoRaces } from '../../src/data/demoData';
import type { Driver, Constructor, Race } from '../../src/types';

// ============================================
// Seeded PRNG (Mulberry32)
// ============================================
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PRNG {
  next(): number;
  nextGaussian(mean: number, stddev: number): number;
  randInt(min: number, max: number): number;
  shuffle<T>(arr: T[]): T[];
}

export function createPRNG(seed: number): PRNG {
  const rand = mulberry32(seed);
  let hasSpare = false;
  let spare = 0;

  function next(): number {
    return rand();
  }

  // Box-Muller transform
  function nextGaussian(mean: number, stddev: number): number {
    if (hasSpare) {
      hasSpare = false;
      return mean + stddev * spare;
    }
    let u: number, v: number, s: number;
    do {
      u = next() * 2 - 1;
      v = next() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const mul = Math.sqrt(-2 * Math.log(s) / s);
    spare = v * mul;
    hasSpare = true;
    return mean + stddev * u * mul;
  }

  function randInt(min: number, max: number): number {
    return Math.floor(next() * (max - min + 1)) + min;
  }

  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  return { next, nextGaussian, randInt, shuffle };
}

// ============================================
// Simulation Types
// ============================================
export interface DriverStrength {
  id: string;
  baseStrength: number;
  consistency: number;
}

export const DRIVER_STRENGTHS: DriverStrength[] = [
  { id: 'verstappen', baseStrength: 98, consistency: 0.90 },
  { id: 'norris', baseStrength: 95, consistency: 0.85 },
  { id: 'leclerc', baseStrength: 90, consistency: 0.75 },
  { id: 'piastri', baseStrength: 88, consistency: 0.80 },
  { id: 'hamilton', baseStrength: 87, consistency: 0.78 },
  { id: 'russell', baseStrength: 85, consistency: 0.82 },
  { id: 'sainz', baseStrength: 84, consistency: 0.80 },
  { id: 'alonso', baseStrength: 80, consistency: 0.75 },
  { id: 'antonelli', baseStrength: 75, consistency: 0.65 },
  { id: 'albon', baseStrength: 72, consistency: 0.78 },
  { id: 'gasly', baseStrength: 70, consistency: 0.72 },
  { id: 'hulkenberg', baseStrength: 68, consistency: 0.75 },
  { id: 'ocon', baseStrength: 67, consistency: 0.70 },
  { id: 'stroll', baseStrength: 65, consistency: 0.70 },
  { id: 'lawson', baseStrength: 62, consistency: 0.60 },
  { id: 'hadjar', baseStrength: 60, consistency: 0.55 },
  { id: 'bearman', baseStrength: 58, consistency: 0.55 },
  { id: 'bortoleto', baseStrength: 55, consistency: 0.50 },
  { id: 'colapinto', baseStrength: 50, consistency: 0.50 },
  { id: 'bottas', baseStrength: 48, consistency: 0.65 },
  { id: 'perez', baseStrength: 48, consistency: 0.65 },
];

// lindblad not in V3 strength model — assign similar to colapinto
const LINDBLAD_STRENGTH: DriverStrength = { id: 'lindblad', baseStrength: 52, consistency: 0.50 };

export function getStrength(driverId: string): DriverStrength {
  return DRIVER_STRENGTHS.find(d => d.id === driverId) || LINDBLAD_STRENGTH;
}

export interface SimRaceResult {
  driverId: string;
  position: number;     // 0 = DNF
  racePoints: number;
  sprintPosition: number; // 0 = DNF or no sprint
  sprintPoints: number;
  fastestLap: boolean;
  dnf: boolean;
  dnfSprint: boolean;
  totalPoints: number;  // race + sprint + fastest lap
}

export interface SimDriverState {
  id: string;
  price: number;
  previousPrice: number;
  rollingPoints: number[];    // most recent first
  rollingSprintFlags: boolean[];
  seasonTotalPoints: number;
  avgFinish: number;
  finishCount: number;
  wins: number;
  podiums: number;
  dnfs: number;
}

export interface SimConstructorState {
  id: string;
  driverIds: string[];
  price: number;
  previousPrice: number;
  rollingPoints: number[];
  rollingSprintFlags: boolean[];
  seasonTotalPoints: number;
}

export interface SimContract {
  driverId: string;
  purchasePrice: number;
  currentPrice: number;
  pointsScored: number;
  racesHeld: number;
  contractLength: number;
  isReservePick: boolean;
  addedAtRace: number;
}

export interface SimConstructorContract {
  constructorId: string;
  purchasePrice: number;
  currentPrice: number;
  pointsScored: number;
  racesHeld: number;
  contractLength: number;
  addedAtRace: number;
}

export interface SimUser {
  id: string;
  name: string;
  strategyTags: string[];
  drivers: SimContract[];
  constructorContract: SimConstructorContract | null;
  budget: number;
  totalPoints: number;
  lockedPoints: number;
  transfers: number;
  aceId: string | null;
  driverLockouts: Record<string, number>; // driverId -> expiresAtCompletedRace
  constructorLockouts: Record<string, number>;
  racePoints: number[];  // points per race
  racesSinceTransfer: number;
}

export interface TradeLogEntry {
  round: number;
  userId: string;
  action: 'buy' | 'sell' | 'sell_expiry' | 'reserve_fill' | 'sell_constructor' | 'buy_constructor' | 'sell_constructor_expiry';
  driverId: string;
  price: number;
  fee: number;
  reason: string;
}

// ============================================
// Pure Helpers (re-implemented from team.store.ts)
// ============================================
export function earlyTermFee(purchasePrice: number, contractLength: number, racesHeld: number): number {
  return Math.floor(purchasePrice * PRICING_CONFIG.EARLY_TERMINATION_RATE * Math.max(0, contractLength - racesHeld));
}

export function isDriverLockedOut(
  driverLockouts: Record<string, number>,
  driverId: string,
  completedRaces: number,
): boolean {
  return driverLockouts[driverId] !== undefined && completedRaces < driverLockouts[driverId];
}

// ============================================
// Race Simulation
// ============================================
export function simulateRace(
  prng: PRNG,
  driverIds: string[],
  isSprint: boolean,
): { positions: { driverId: string; position: number; dnf: boolean }[]; fastestLapId: string | null } {
  const DNF_CHANCE = isSprint ? 0.03 : 0.08;

  const entries: { driverId: string; perf: number; dnf: boolean }[] = driverIds.map(id => {
    const s = getStrength(id);
    const varianceMul = isSprint ? 0.7 : 1.0;
    const perf = s.baseStrength
      + prng.nextGaussian(0, 15 * varianceMul) * (1 - s.consistency)
      + prng.nextGaussian(0, 5 * varianceMul);
    const dnf = prng.next() < DNF_CHANCE;
    return { driverId: id, perf, dnf };
  });

  const finishers = entries.filter(e => !e.dnf).sort((a, b) => b.perf - a.perf);
  const dnfs = entries.filter(e => e.dnf);

  const positions: { driverId: string; position: number; dnf: boolean }[] = [];
  finishers.forEach((e, i) => {
    positions.push({ driverId: e.driverId, position: i + 1, dnf: false });
  });
  dnfs.forEach(e => {
    positions.push({ driverId: e.driverId, position: 0, dnf: true });
  });

  // Fastest lap: random top-10 finisher (race only)
  let fastestLapId: string | null = null;
  if (!isSprint) {
    const top10 = finishers.slice(0, 10);
    if (top10.length > 0) {
      fastestLapId = top10[prng.randInt(0, top10.length - 1)].driverId;
    }
  }

  return { positions, fastestLapId };
}

export function buildRaceResults(
  driverIds: string[],
  prng: PRNG,
  hasSprint: boolean,
): SimRaceResult[] {
  // Main race
  const race = simulateRace(prng, driverIds, false);

  // Sprint (if applicable)
  let sprintData: { positions: { driverId: string; position: number; dnf: boolean }[] } | null = null;
  if (hasSprint) {
    sprintData = simulateRace(prng, driverIds, true);
  }

  const results: SimRaceResult[] = driverIds.map(id => {
    const raceEntry = race.positions.find(p => p.driverId === id)!;
    const racePos = raceEntry.dnf ? 0 : raceEntry.position;
    const racePts = raceEntry.dnf ? 0 : getRacePoints(raceEntry.position);
    const fl = race.fastestLapId === id && !raceEntry.dnf && raceEntry.position <= 10;

    let sprintPos = 0;
    let sprintPts = 0;
    let dnfSprint = false;
    if (sprintData) {
      const sprintEntry = sprintData.positions.find(p => p.driverId === id)!;
      dnfSprint = sprintEntry.dnf;
      sprintPos = sprintEntry.dnf ? 0 : sprintEntry.position;
      sprintPts = sprintEntry.dnf ? 0 : getSprintPoints(sprintEntry.position);
    }

    return {
      driverId: id,
      position: racePos,
      racePoints: racePts + (fl ? 1 : 0),
      sprintPosition: sprintPos,
      sprintPoints: sprintPts,
      fastestLap: fl,
      dnf: raceEntry.dnf,
      dnfSprint,
      totalPoints: racePts + sprintPts + (fl ? 1 : 0),
    };
  });

  return results;
}

// ============================================
// Price Evolution
// ============================================
export function updateDriverPrices(
  drivers: Map<string, SimDriverState>,
  results: SimRaceResult[],
  hasSprint: boolean,
): void {
  for (const result of results) {
    const ds = drivers.get(result.driverId);
    if (!ds) continue;

    ds.seasonTotalPoints += result.totalPoints;

    // Track stats
    if (!result.dnf) {
      ds.finishCount++;
      ds.avgFinish = (ds.avgFinish * (ds.finishCount - 1) + result.position) / ds.finishCount;
      if (result.position === 1) ds.wins++;
      if (result.position <= 3) ds.podiums++;
    } else {
      ds.dnfs++;
    }

    // Rolling window for pricing
    ds.rollingPoints.unshift(result.totalPoints);
    ds.rollingSprintFlags.unshift(hasSprint);
    if (ds.rollingPoints.length > PRICING_CONFIG.ROLLING_WINDOW) {
      ds.rollingPoints.pop();
      ds.rollingSprintFlags.pop();
    }

    const rollingAvg = calculateRollingAverage(ds.rollingPoints, ds.rollingSprintFlags);
    const targetPrice = calculatePriceFromRollingAvg(rollingAvg);
    const change = calculatePriceChange(ds.price, targetPrice);
    ds.previousPrice = ds.price;
    ds.price = Math.max(PRICING_CONFIG.MIN_PRICE, Math.min(PRICING_CONFIG.MAX_PRICE, ds.price + change));
  }
}

export function updateConstructorPrices(
  constructors: Map<string, SimConstructorState>,
  results: SimRaceResult[],
  hasSprint: boolean,
): void {
  for (const [, cs] of constructors) {
    const d1 = results.find(r => r.driverId === cs.driverIds[0]);
    const d2 = results.find(r => r.driverId === cs.driverIds[1]);
    const totalPts = (d1?.totalPoints ?? 0) + (d2?.totalPoints ?? 0);
    cs.seasonTotalPoints += totalPts;

    cs.rollingPoints.unshift(totalPts);
    cs.rollingSprintFlags.unshift(hasSprint);
    if (cs.rollingPoints.length > PRICING_CONFIG.ROLLING_WINDOW) {
      cs.rollingPoints.pop();
      cs.rollingSprintFlags.pop();
    }

    const rollingAvg = calculateRollingAverage(cs.rollingPoints, cs.rollingSprintFlags);
    const targetPrice = calculatePriceFromRollingAvg(rollingAvg);
    const change = calculatePriceChange(cs.price, targetPrice);
    cs.previousPrice = cs.price;
    cs.price = Math.max(PRICING_CONFIG.MIN_PRICE, Math.min(PRICING_CONFIG.MAX_PRICE, cs.price + change));
  }
}

// ============================================
// Contract Processing (after each race)
// ============================================
export function processContracts(
  user: SimUser,
  completedRaces: number,
  drivers: Map<string, SimDriverState>,
  constructors: Map<string, SimConstructorState>,
  tradeLog: TradeLogEntry[],
  round: number,
  prng: PRNG,
): void {
  // 1. Increment racesHeld
  for (const c of user.drivers) {
    c.racesHeld++;
  }
  if (user.constructorContract) {
    user.constructorContract.racesHeld++;
  }

  // 2. Contract expiry — drivers
  const expired = user.drivers.filter(c => c.racesHeld >= c.contractLength);
  for (const c of expired) {
    const ds = drivers.get(c.driverId);
    const sellPrice = ds ? ds.price : c.currentPrice;
    user.budget += sellPrice;
    user.lockedPoints += c.pointsScored;
    user.driverLockouts[c.driverId] = completedRaces + PRICING_CONFIG.CONTRACT_LOCKOUT_RACES;
    if (user.aceId === c.driverId) user.aceId = null;
    tradeLog.push({
      round, userId: user.id, action: 'sell_expiry',
      driverId: c.driverId, price: sellPrice, fee: 0,
      reason: `Contract expired after ${c.racesHeld} races`,
    });
  }
  user.drivers = user.drivers.filter(c => c.racesHeld < c.contractLength);

  // Constructor expiry
  if (user.constructorContract && user.constructorContract.racesHeld >= user.constructorContract.contractLength) {
    const cc = user.constructorContract;
    const cs = constructors.get(cc.constructorId);
    const sellPrice = cs ? cs.price : cc.currentPrice;
    user.budget += sellPrice;
    user.lockedPoints += cc.pointsScored;
    user.constructorLockouts[cc.constructorId] = completedRaces + PRICING_CONFIG.CONTRACT_LOCKOUT_RACES;
    tradeLog.push({
      round, userId: user.id, action: 'sell_constructor_expiry',
      driverId: cc.constructorId, price: sellPrice, fee: 0,
      reason: `Constructor contract expired after ${cc.racesHeld} races`,
    });
    user.constructorContract = null;
  }

  // 3. Prune expired lockouts
  for (const [did, expiresAt] of Object.entries(user.driverLockouts)) {
    if (completedRaces >= expiresAt) delete user.driverLockouts[did];
  }
  for (const [cid, expiresAt] of Object.entries(user.constructorLockouts)) {
    if (completedRaces >= expiresAt) delete user.constructorLockouts[cid];
  }

  // 4. Reserve auto-fill if team < 5 and no active lockouts preventing it
  if (user.drivers.length < PRICING_CONFIG.TEAM_SIZE) {
    const ownedIds = new Set(user.drivers.map(c => c.driverId));
    const lockedIds = new Set(
      Object.entries(user.driverLockouts)
        .filter(([, exp]) => completedRaces < exp)
        .map(([did]) => did)
    );

    const available = [...drivers.entries()]
      .filter(([id]) => !ownedIds.has(id) && !lockedIds.has(id))
      .sort((a, b) => a[1].price - b[1].price);

    while (user.drivers.length < PRICING_CONFIG.TEAM_SIZE && available.length > 0) {
      const [buyId, buyDs] = available.shift()!;
      if (buyDs.price <= user.budget) {
        user.budget -= buyDs.price;
        user.drivers.push({
          driverId: buyId,
          purchasePrice: buyDs.price,
          currentPrice: buyDs.price,
          pointsScored: 0,
          racesHeld: 0,
          contractLength: PRICING_CONFIG.CONTRACT_LENGTH,
          isReservePick: true,
          addedAtRace: completedRaces,
        });
        user.racesSinceTransfer = 0;
        tradeLog.push({
          round, userId: user.id, action: 'reserve_fill',
          driverId: buyId, price: buyDs.price, fee: 0,
          reason: 'Auto-filled reserve after contract expiry',
        });
      }
    }
  }
}

// ============================================
// Scoring
// ============================================
export function calculateUserRacePoints(
  user: SimUser,
  results: SimRaceResult[],
  completedRaces: number,
  constructors: Map<string, SimConstructorState>,
): number {
  let total = 0;

  // Driver points
  for (const contract of user.drivers) {
    const result = results.find(r => r.driverId === contract.driverId);
    if (!result) continue;

    let pts = result.totalPoints;

    // Ace 2x (only if price <= $100)
    if (user.aceId === contract.driverId && contract.currentPrice <= PRICING_CONFIG.ACE_MAX_PRICE) {
      pts *= PRICING_CONFIG.ACE_MULTIPLIER;
    }

    // Hot hand: newly-added driver (racesHeld === 0 means just added this race)
    if (contract.racesHeld === 0) {
      if (result.position >= 1 && result.position <= 3 && !result.dnf) {
        pts += PRICING_CONFIG.HOT_HAND_PODIUM_BONUS;
      } else if (result.totalPoints >= 15) {
        pts += PRICING_CONFIG.HOT_HAND_BONUS;
      }
    }

    contract.pointsScored += pts;
    total += pts;
  }

  // Stale penalty (incremental per race after threshold)
  user.racesSinceTransfer++;
  if (user.racesSinceTransfer > PRICING_CONFIG.STALE_ROSTER_THRESHOLD) {
    total -= PRICING_CONFIG.STALE_ROSTER_PENALTY;
  }

  // Constructor points
  if (user.constructorContract) {
    const cc = user.constructorContract;
    const cs = constructors.get(cc.constructorId);
    if (cs) {
      const d1 = results.find(r => r.driverId === cs.driverIds[0]);
      const d2 = results.find(r => r.driverId === cs.driverIds[1]);
      const cPts = (d1?.totalPoints ?? 0) + (d2?.totalPoints ?? 0);
      cc.pointsScored += cPts;
      total += cPts;
    }
  }

  return total;
}

// ============================================
// Trade Execution Helpers
// ============================================
export function executeSell(
  user: SimUser,
  driverId: string,
  drivers: Map<string, SimDriverState>,
  tradeLog: TradeLogEntry[],
  round: number,
  reason: string,
): boolean {
  const idx = user.drivers.findIndex(c => c.driverId === driverId);
  if (idx === -1) return false;

  const contract = user.drivers[idx];
  const ds = drivers.get(driverId);
  const sellPrice = ds ? ds.price : contract.currentPrice;
  const fee = earlyTermFee(contract.purchasePrice, contract.contractLength, contract.racesHeld);

  // Value capture bonus
  const profit = sellPrice - contract.purchasePrice;
  if (profit > 0) {
    const valueBonus = Math.floor(profit / 10) * PRICING_CONFIG.VALUE_CAPTURE_RATE;
    user.totalPoints += valueBonus;
  }

  user.budget += sellPrice - fee;
  user.lockedPoints += contract.pointsScored;
  user.drivers.splice(idx, 1);
  user.transfers++;
  user.racesSinceTransfer = 0;

  tradeLog.push({
    round, userId: user.id, action: 'sell',
    driverId, price: sellPrice, fee,
    reason,
  });
  return true;
}

export function executeBuy(
  user: SimUser,
  driverId: string,
  drivers: Map<string, SimDriverState>,
  completedRaces: number,
  tradeLog: TradeLogEntry[],
  round: number,
  reason: string,
): boolean {
  if (user.drivers.length >= PRICING_CONFIG.TEAM_SIZE) return false;
  if (user.drivers.some(c => c.driverId === driverId)) return false;
  if (isDriverLockedOut(user.driverLockouts, driverId, completedRaces)) return false;

  const ds = drivers.get(driverId);
  if (!ds) return false;
  if (ds.price > user.budget) return false;

  user.budget -= ds.price;
  user.drivers.push({
    driverId,
    purchasePrice: ds.price,
    currentPrice: ds.price,
    pointsScored: 0,
    racesHeld: 0,
    contractLength: PRICING_CONFIG.CONTRACT_LENGTH,
    isReservePick: false,
    addedAtRace: completedRaces,
  });

  tradeLog.push({
    round, userId: user.id, action: 'buy',
    driverId, price: ds.price, fee: 0,
    reason,
  });
  return true;
}

export function executeSellConstructor(
  user: SimUser,
  constructors: Map<string, SimConstructorState>,
  tradeLog: TradeLogEntry[],
  round: number,
  reason: string,
): boolean {
  if (!user.constructorContract) return false;
  const cc = user.constructorContract;
  const cs = constructors.get(cc.constructorId);
  const sellPrice = cs ? cs.price : cc.currentPrice;
  const fee = earlyTermFee(cc.purchasePrice, cc.contractLength, cc.racesHeld);

  const profit = sellPrice - cc.purchasePrice;
  if (profit > 0) {
    user.totalPoints += Math.floor(profit / 10) * PRICING_CONFIG.VALUE_CAPTURE_RATE;
  }

  user.budget += sellPrice - fee;
  user.lockedPoints += cc.pointsScored;
  user.constructorContract = null;
  user.transfers++;

  tradeLog.push({
    round, userId: user.id, action: 'sell_constructor',
    driverId: cc.constructorId, price: sellPrice, fee,
    reason,
  });
  return true;
}

export function executeBuyConstructor(
  user: SimUser,
  constructorId: string,
  constructors: Map<string, SimConstructorState>,
  completedRaces: number,
  tradeLog: TradeLogEntry[],
  round: number,
  reason: string,
): boolean {
  if (user.constructorContract) return false;
  if (isDriverLockedOut(user.constructorLockouts, constructorId, completedRaces)) return false;

  const cs = constructors.get(constructorId);
  if (!cs) return false;
  if (cs.price > user.budget) return false;

  user.budget -= cs.price;
  user.constructorContract = {
    constructorId,
    purchasePrice: cs.price,
    currentPrice: cs.price,
    pointsScored: 0,
    racesHeld: 0,
    contractLength: PRICING_CONFIG.CONTRACT_LENGTH,
    addedAtRace: completedRaces,
  };

  tradeLog.push({
    round, userId: user.id, action: 'buy_constructor',
    driverId: constructorId, price: cs.price, fee: 0,
    reason,
  });
  return true;
}

// ============================================
// Sync current prices on user contracts
// ============================================
export function syncContractPrices(
  user: SimUser,
  drivers: Map<string, SimDriverState>,
  constructors: Map<string, SimConstructorState>,
): void {
  for (const c of user.drivers) {
    const ds = drivers.get(c.driverId);
    if (ds) c.currentPrice = ds.price;
  }
  if (user.constructorContract) {
    const cs = constructors.get(user.constructorContract.constructorId);
    if (cs) user.constructorContract.currentPrice = cs.price;
  }
}

// ============================================
// Init helpers
// ============================================
export function initDriverStates(): Map<string, SimDriverState> {
  const map = new Map<string, SimDriverState>();
  for (const d of demoDrivers) {
    map.set(d.id, {
      id: d.id,
      price: d.price,
      previousPrice: d.price,
      rollingPoints: [],
      rollingSprintFlags: [],
      seasonTotalPoints: 0,
      avgFinish: 0,
      finishCount: 0,
      wins: 0,
      podiums: 0,
      dnfs: 0,
    });
  }
  return map;
}

export function initConstructorStates(): Map<string, SimConstructorState> {
  const map = new Map<string, SimConstructorState>();
  for (const c of demoConstructors) {
    map.set(c.id, {
      id: c.id,
      driverIds: [...c.drivers],
      price: c.price,
      previousPrice: c.price,
      rollingPoints: [],
      rollingSprintFlags: [],
      seasonTotalPoints: 0,
    });
  }
  return map;
}

export function getAllDriverIds(): string[] {
  return demoDrivers.map(d => d.id);
}

export function getRaces(): Race[] {
  return demoRaces;
}

export { demoDrivers, demoConstructors, demoRaces, PRICING_CONFIG };
