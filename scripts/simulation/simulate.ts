/**
 * simulate.ts — Full-season simulation entry point
 *
 * Run: npx tsx scripts/simulation/simulate.ts [--seed=42]
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  createPRNG,
  initDriverStates, initConstructorStates,
  getAllDriverIds, getRaces,
  buildRaceResults,
  updateDriverPrices, updateConstructorPrices,
  processContracts, calculateUserRacePoints,
  executeSell, executeBuy, executeSellConstructor, executeBuyConstructor,
  syncContractPrices,
  PRICING_CONFIG,
  type SimUser, type SimDriverState, type SimConstructorState,
  type SimRaceResult, type TradeLogEntry, type PRNG,
} from './engine';
import { ALL_AI_USERS, type StrategyContext } from './teamAI';

// ============================================
// Parse CLI args
// ============================================
function parseSeed(): number {
  const arg = process.argv.find(a => a.startsWith('--seed='));
  if (arg) return parseInt(arg.split('=')[1], 10) || 42;
  return 42;
}

// ============================================
// Create initial SimUser from AI definition
// ============================================
function createSimUser(id: string, name: string, tags: string[]): SimUser {
  return {
    id,
    name,
    strategyTags: tags,
    drivers: [],
    constructorContract: null,
    budget: PRICING_CONFIG.STARTING_BUDGET,
    totalPoints: 0,
    lockedPoints: 0,
    transfers: 0,
    aceId: null,
    driverLockouts: {},
    constructorLockouts: {},
    racePoints: [],
    racesSinceTransfer: 0,
  };
}

// ============================================
// Main Simulation
// ============================================
function runSimulation(seed: number): void {
  const prng = createPRNG(seed);
  const drivers = initDriverStates();
  const constructors = initConstructorStates();
  const allDriverIds = getAllDriverIds();
  const races = getRaces();
  const tradeLog: TradeLogEntry[] = [];

  // Price history tracking
  const driverPriceHistory: Record<string, number[]> = {};
  for (const id of allDriverIds) driverPriceHistory[id] = [drivers.get(id)!.price];
  const constructorPriceHistory: Record<string, number[]> = {};
  for (const [id, cs] of constructors) constructorPriceHistory[id] = [cs.price];

  // Race results tracking
  const raceResultsLog: { round: number; name: string; hasSprint: boolean; top10: { driverId: string; position: number; points: number }[]; fastestLap: string }[] = [];

  // Create 25 users
  const users: SimUser[] = ALL_AI_USERS.map((def, i) =>
    createSimUser(`user_${i + 1}`, def.name, def.strategyTags)
  );

  // Track trade counts per driver
  const driverTradeCounts: Record<string, number> = {};
  for (const id of allDriverIds) driverTradeCounts[id] = 0;

  // ============================================
  // Initial team picks (round 0)
  // ============================================
  for (let i = 0; i < ALL_AI_USERS.length; i++) {
    const def = ALL_AI_USERS[i];
    const user = users[i];
    const ctx: StrategyContext = {
      user, drivers, constructors, round: 0, completedRaces: 0,
      lastResults: [], prng, allDriverIds,
    };
    const pick = def.initialPick(ctx);

    // Buy drivers
    for (const did of pick.driverIds) {
      executeBuy(user, did, drivers, 0, tradeLog, 0, 'Initial pick');
    }
    // Buy constructor
    if (pick.constructorId) {
      executeBuyConstructor(user, pick.constructorId, constructors, 0, tradeLog, 0, 'Initial pick');
    }
    // Set initial ace
    const eligibleAces = user.drivers.filter(c => c.currentPrice <= PRICING_CONFIG.ACE_MAX_PRICE);
    if (eligibleAces.length > 0) {
      user.aceId = eligibleAces[0].driverId;
    }
  }

  // ============================================
  // Main race loop
  // ============================================
  let completedRaces = 0;

  for (const race of races) {
    const round = race.round;

    // --- Pre-race: AI decisions ---
    const lastResults: SimRaceResult[] = raceResultsLog.length > 0
      ? buildRaceResults(allDriverIds, createPRNG(seed + round - 1), races[round - 2]?.hasSprint ?? false)
      : []; // Use actual stored results below; for AI context pass previous round's data
    // Actually, let's use a simpler approach: store last round results
    // We'll store them at end of loop

    for (let i = 0; i < ALL_AI_USERS.length; i++) {
      const def = ALL_AI_USERS[i];
      const user = users[i];

      // Sync prices before decision
      syncContractPrices(user, drivers, constructors);

      const ctx: StrategyContext = {
        user, drivers, constructors, round, completedRaces,
        lastResults: (user as any)._lastResults ?? [],
        prng, allDriverIds,
      };

      const decision = def.perRace(ctx);

      // Execute sells first
      for (const sid of decision.sellDriverIds) {
        executeSell(user, sid, drivers, tradeLog, round, `Strategy trade`);
        driverTradeCounts[sid] = (driverTradeCounts[sid] || 0) + 1;
      }
      if (decision.sellConstructor) {
        executeSellConstructor(user, constructors, tradeLog, round, 'Strategy trade');
      }

      // Then buys
      for (const bid of decision.buyDriverIds) {
        executeBuy(user, bid, drivers, completedRaces, tradeLog, round, 'Strategy trade');
        driverTradeCounts[bid] = (driverTradeCounts[bid] || 0) + 1;
      }
      if (decision.buyConstructorId) {
        executeBuyConstructor(user, decision.buyConstructorId, constructors, completedRaces, tradeLog, round, 'Strategy trade');
      }

      // Set ace
      if (decision.aceId) {
        user.aceId = decision.aceId;
      }
    }

    // --- Race simulation ---
    const results = buildRaceResults(allDriverIds, prng, race.hasSprint);

    // Log race results
    const top10 = results
      .filter(r => !r.dnf)
      .sort((a, b) => a.position - b.position)
      .slice(0, 10)
      .map(r => ({ driverId: r.driverId, position: r.position, points: r.totalPoints }));
    const fl = results.find(r => r.fastestLap);
    raceResultsLog.push({
      round, name: race.name, hasSprint: race.hasSprint,
      top10, fastestLap: fl?.driverId ?? '',
    });

    // --- Score each user ---
    for (const user of users) {
      syncContractPrices(user, drivers, constructors);
      const pts = calculateUserRacePoints(user, results, completedRaces, constructors);
      user.totalPoints += pts;
      user.racePoints.push(pts);
    }

    // --- Update prices ---
    updateDriverPrices(drivers, results, race.hasSprint);
    updateConstructorPrices(constructors, results, race.hasSprint);

    completedRaces++;

    // --- Process contracts ---
    for (const user of users) {
      processContracts(user, completedRaces, drivers, constructors, tradeLog, round, prng);
      syncContractPrices(user, drivers, constructors);
    }

    // Store results for next round's AI context
    for (const user of users) {
      (user as any)._lastResults = results;
    }

    // Record price history
    for (const id of allDriverIds) driverPriceHistory[id].push(drivers.get(id)!.price);
    for (const [id, cs] of constructors) constructorPriceHistory[id].push(cs.price);
  }

  // ============================================
  // Post-season: add locked points, final sort
  // ============================================
  for (const user of users) {
    user.totalPoints += user.lockedPoints;
  }

  const standings = [...users].sort((a, b) => b.totalPoints - a.totalPoints);

  // ============================================
  // Console output
  // ============================================
  console.log('\n' + '='.repeat(100));
  console.log('  F1 FANTASY FULL-SEASON SIMULATION');
  console.log('  Seed: ' + seed + ' | 25 users | 24 races');
  console.log('='.repeat(100));

  // Final Standings
  console.log('\n  FINAL STANDINGS');
  console.log('  ' + '-'.repeat(96));
  console.log('  ' + pad('Rank', 5) + pad('Name', 24) + pad('Tags', 32) + pad('Points', 8) + pad('Budget', 8) + pad('Value', 8) + pad('Trades', 8));
  console.log('  ' + '-'.repeat(96));

  standings.forEach((u, i) => {
    const teamValue = u.drivers.reduce((s, c) => s + c.currentPrice, 0) + (u.constructorContract?.currentPrice ?? 0);
    console.log('  ' +
      pad(String(i + 1), 5) +
      pad(u.name, 24) +
      pad(u.strategyTags.join(', '), 32) +
      pad(String(u.totalPoints), 8) +
      pad('$' + u.budget, 8) +
      pad('$' + teamValue, 8) +
      pad(String(u.transfers), 8)
    );
  });

  // Strategy Analysis
  console.log('\n  STRATEGY TAG ANALYSIS');
  console.log('  ' + '-'.repeat(60));
  const tagGroups: Record<string, number[]> = {};
  for (const u of standings) {
    for (const tag of u.strategyTags) {
      if (!tagGroups[tag]) tagGroups[tag] = [];
      tagGroups[tag].push(u.totalPoints);
    }
  }
  const tagAvgs = Object.entries(tagGroups)
    .map(([tag, pts]) => ({ tag, avg: Math.round(pts.reduce((a, b) => a + b, 0) / pts.length), count: pts.length }))
    .sort((a, b) => b.avg - a.avg);
  console.log('  ' + pad('Tag', 24) + pad('Avg Points', 12) + pad('Users', 8));
  for (const t of tagAvgs) {
    console.log('  ' + pad(t.tag, 24) + pad(String(t.avg), 12) + pad(String(t.count), 8));
  }

  // Top Drivers
  console.log('\n  TOP DRIVERS (Season Stats)');
  console.log('  ' + '-'.repeat(80));
  const driverStats = [...drivers.values()].sort((a, b) => b.seasonTotalPoints - a.seasonTotalPoints);
  console.log('  ' + pad('Driver', 16) + pad('Points', 8) + pad('AvgFin', 8) + pad('Wins', 6) + pad('Podiums', 8) + pad('DNFs', 6) + pad('Price', 8));
  for (const ds of driverStats.slice(0, 10)) {
    console.log('  ' +
      pad(ds.id, 16) +
      pad(String(ds.seasonTotalPoints), 8) +
      pad(ds.avgFinish.toFixed(1), 8) +
      pad(String(ds.wins), 6) +
      pad(String(ds.podiums), 8) +
      pad(String(ds.dnfs), 6) +
      pad('$' + ds.price, 8)
    );
  }

  // Most Traded
  console.log('\n  MOST TRADED DRIVERS');
  console.log('  ' + '-'.repeat(40));
  const tradeSorted = Object.entries(driverTradeCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [id, count] of tradeSorted) {
    console.log('  ' + pad(id, 16) + pad(String(count) + ' trades', 12));
  }

  // Price Movers
  console.log('\n  BIGGEST PRICE MOVERS');
  console.log('  ' + '-'.repeat(50));
  const priceChanges = [...drivers.values()].map(ds => ({
    id: ds.id,
    initial: driverPriceHistory[ds.id][0],
    final: ds.price,
    change: ds.price - driverPriceHistory[ds.id][0],
  })).sort((a, b) => b.change - a.change);

  console.log('  Biggest risers:');
  for (const p of priceChanges.slice(0, 5)) {
    console.log('    ' + pad(p.id, 16) + `$${p.initial} -> $${p.final} (${p.change >= 0 ? '+' : ''}${p.change})`);
  }
  console.log('  Biggest fallers:');
  for (const p of priceChanges.slice(-5).reverse()) {
    console.log('    ' + pad(p.id, 16) + `$${p.initial} -> $${p.final} (${p.change >= 0 ? '+' : ''}${p.change})`);
  }

  // ============================================
  // JSON output
  // ============================================
  const jsonOutput = {
    seed,
    standings: standings.map((u, i) => ({
      rank: i + 1,
      name: u.name,
      strategyTags: u.strategyTags,
      totalPoints: u.totalPoints,
      lockedPoints: u.lockedPoints,
      budget: u.budget,
      teamValue: u.drivers.reduce((s, c) => s + c.currentPrice, 0) + (u.constructorContract?.currentPrice ?? 0),
      transfers: u.transfers,
      finalDrivers: u.drivers.map(c => c.driverId),
      finalConstructor: u.constructorContract?.constructorId ?? '',
      racePoints: u.racePoints,
    })),
    driverPriceHistory,
    constructorPriceHistory,
    driverSeasonStats: Object.fromEntries(
      [...drivers.values()].map(ds => [ds.id, {
        totalPts: ds.seasonTotalPoints,
        avgFinish: Math.round(ds.avgFinish * 10) / 10,
        wins: ds.wins,
        dnfs: ds.dnfs,
        podiums: ds.podiums,
      }])
    ),
    tradeLog,
    raceResults: raceResultsLog,
  };

  const outPath = path.join(__dirname, 'results.json');
  fs.writeFileSync(outPath, JSON.stringify(jsonOutput, null, 2));
  console.log('\n  Results written to: ' + outPath);
  console.log('='.repeat(100) + '\n');
}

function pad(s: string, len: number): string {
  return s.padEnd(len);
}

// ============================================
// Run
// ============================================
const seed = parseSeed();
runSimulation(seed);
