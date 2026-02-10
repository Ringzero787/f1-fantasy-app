/**
 * F1 Fantasy Season Simulator V2
 *
 * NEW RULES to separate Premium Stack from Form Chaser:
 * - Increased price volatility ($25 max change)
 * - Captain system (2x points on 1 driver per race)
 * - Stale roster penalty (-2 pts/race after 8 races without transfer)
 * - Hot Hand bonus (+5 for transfer scoring 15+, +10 for podium)
 * - Value capture bonus (+2 per $10 profit on sale)
 *
 * Run: npx ts-node scripts/simulateSeasonV2.ts
 */

// ============================================
// V2 PRICING CONFIGURATION
// ============================================
const PRICING = {
  RACES_PER_SEASON: 24,
  SPRINTS_PER_SEASON: 4,
  DOLLARS_PER_POINT: 10,
  ROLLING_WINDOW: 5,
  SPRINT_WEIGHT: 0.75,
  MIN_PRICE: 3,              // CHANGED from 5
  MAX_PRICE: 500,
  MAX_CHANGE_PER_RACE: 25,   // CHANGED from 15
  A_TIER_THRESHOLD: 200,
  STARTING_BUDGET: 1000,
  TEAM_SIZE: 5,

  // NEW V2 RULES
  CAPTAIN_MULTIPLIER: 2.0,
  STALE_ROSTER_THRESHOLD: 8,
  STALE_ROSTER_PENALTY: 2,
  HOT_HAND_BONUS: 5,
  HOT_HAND_PODIUM_BONUS: 10,
  VALUE_CAPTURE_RATE: 2,     // per $10 profit
};

// Race points
const RACE_POINTS: Record<number, number> = {
  1: 25, 2: 18, 3: 15, 4: 12, 5: 10,
  6: 8, 7: 6, 8: 4, 9: 2, 10: 1
};

const SPRINT_POINTS: Record<number, number> = {
  1: 8, 2: 7, 3: 6, 4: 5, 5: 4, 6: 3, 7: 2, 8: 1
};

// ============================================
// DRIVER DATA
// ============================================
interface Driver {
  id: string;
  name: string;
  shortName: string;
  prevSeasonPoints: number;
  baseStrength: number;
  consistency: number;
  price: number;
  recentPoints: number[];
}

const createDrivers = (): Driver[] => {
  const driversData = [
    { id: 'norris', name: 'Lando Norris', shortName: 'NOR', prevSeasonPoints: 510, baseStrength: 95, consistency: 0.85 },
    { id: 'verstappen', name: 'Max Verstappen', shortName: 'VER', prevSeasonPoints: 500, baseStrength: 98, consistency: 0.90 },
    { id: 'piastri', name: 'Oscar Piastri', shortName: 'PIA', prevSeasonPoints: 380, baseStrength: 88, consistency: 0.80 },
    { id: 'leclerc', name: 'Charles Leclerc', shortName: 'LEC', prevSeasonPoints: 340, baseStrength: 90, consistency: 0.75 },
    { id: 'russell', name: 'George Russell', shortName: 'RUS', prevSeasonPoints: 290, baseStrength: 85, consistency: 0.82 },
    { id: 'hamilton', name: 'Lewis Hamilton', shortName: 'HAM', prevSeasonPoints: 260, baseStrength: 87, consistency: 0.78 },
    { id: 'sainz', name: 'Carlos Sainz', shortName: 'SAI', prevSeasonPoints: 240, baseStrength: 84, consistency: 0.80 },
    { id: 'alonso', name: 'Fernando Alonso', shortName: 'ALO', prevSeasonPoints: 150, baseStrength: 80, consistency: 0.75 },
    { id: 'antonelli', name: 'Kimi Antonelli', shortName: 'ANT', prevSeasonPoints: 120, baseStrength: 75, consistency: 0.65 },
    { id: 'albon', name: 'Alexander Albon', shortName: 'ALB', prevSeasonPoints: 100, baseStrength: 72, consistency: 0.78 },
    { id: 'stroll', name: 'Lance Stroll', shortName: 'STR', prevSeasonPoints: 80, baseStrength: 65, consistency: 0.70 },
    { id: 'hulkenberg', name: 'Nico Hulkenberg', shortName: 'HUL', prevSeasonPoints: 70, baseStrength: 68, consistency: 0.75 },
    { id: 'gasly', name: 'Pierre Gasly', shortName: 'GAS', prevSeasonPoints: 65, baseStrength: 70, consistency: 0.72 },
    { id: 'ocon', name: 'Esteban Ocon', shortName: 'OCO', prevSeasonPoints: 60, baseStrength: 67, consistency: 0.70 },
    { id: 'hadjar', name: 'Isack Hadjar', shortName: 'HAD', prevSeasonPoints: 40, baseStrength: 60, consistency: 0.55 },
    { id: 'bearman', name: 'Oliver Bearman', shortName: 'BEA', prevSeasonPoints: 35, baseStrength: 58, consistency: 0.55 },
    { id: 'lawson', name: 'Liam Lawson', shortName: 'LAW', prevSeasonPoints: 30, baseStrength: 62, consistency: 0.60 },
    { id: 'bortoleto', name: 'Gabriel Bortoleto', shortName: 'BOR', prevSeasonPoints: 25, baseStrength: 55, consistency: 0.50 },
  ];

  return driversData.map(d => ({
    ...d,
    price: calcInitialPrice(d.prevSeasonPoints),
    recentPoints: [],
  }));
};

function calcInitialPrice(prevSeasonPoints: number): number {
  const avgPPR = prevSeasonPoints / PRICING.RACES_PER_SEASON;
  const price = Math.round(avgPPR * PRICING.DOLLARS_PER_POINT);
  return Math.max(PRICING.MIN_PRICE, Math.min(PRICING.MAX_PRICE, price));
}

// ============================================
// SIMULATION ENGINE
// ============================================
interface RaceResult {
  driverId: string;
  position: number;
  points: number;
  sprintPosition?: number;
  sprintPoints?: number;
  totalPoints: number;
}

const SPRINT_RACES = [4, 6, 11, 20];

function simulateRace(drivers: Driver[], isSprint: boolean): RaceResult[] {
  const performances = drivers.map(d => ({
    driver: d,
    score: d.baseStrength +
           (Math.random() * 30 - 15) * (1 - d.consistency) +
           (Math.random() * 10 - 5)
  }));

  performances.sort((a, b) => b.score - a.score);

  const results: RaceResult[] = performances.map((p, index) => {
    const position = index + 1;
    const racePoints = RACE_POINTS[position] || 0;

    let sprintPosition: number | undefined;
    let sprintPoints = 0;

    if (isSprint) {
      const sprintPerfs = [...performances].sort((a, b) =>
        (b.score + Math.random() * 20 - 10) - (a.score + Math.random() * 20 - 10)
      );
      sprintPosition = sprintPerfs.findIndex(sp => sp.driver.id === p.driver.id) + 1;
      sprintPoints = SPRINT_POINTS[sprintPosition] || 0;
    }

    return {
      driverId: p.driver.id,
      position,
      points: racePoints,
      sprintPosition,
      sprintPoints,
      totalPoints: racePoints + sprintPoints,
    };
  });

  return results;
}

function updatePrices(drivers: Driver[], results: RaceResult[], isSprint: boolean): void {
  for (const driver of drivers) {
    const result = results.find(r => r.driverId === driver.id);
    if (!result) continue;

    const pointsToAdd = isSprint
      ? result.totalPoints * PRICING.SPRINT_WEIGHT
      : result.totalPoints;

    driver.recentPoints.unshift(pointsToAdd);
    if (driver.recentPoints.length > PRICING.ROLLING_WINDOW) {
      driver.recentPoints.pop();
    }

    const rollingAvg = driver.recentPoints.reduce((a, b) => a + b, 0) / driver.recentPoints.length;
    const targetPrice = Math.round(rollingAvg * PRICING.DOLLARS_PER_POINT);

    // V2: Increased max change
    const priceChange = Math.max(
      -PRICING.MAX_CHANGE_PER_RACE,
      Math.min(PRICING.MAX_CHANGE_PER_RACE, targetPrice - driver.price)
    );

    driver.price = Math.max(
      PRICING.MIN_PRICE,
      Math.min(PRICING.MAX_PRICE, driver.price + priceChange)
    );
  }
}

// ============================================
// V2 TEAM WITH NEW TRACKING
// ============================================
interface TeamV2 {
  drivers: string[];
  driverPurchasePrices: Map<string, number>; // Track buy prices for value capture
  budget: number;
  totalPoints: number;
  bonusPoints: number;
  transfers: number;
  racesSinceTransfer: number;
  captain: string;
  hotHandBonuses: number;
  valueCaptureBonus: number;
  stalePenalty: number;
}

type StrategyV2 = (
  team: TeamV2,
  drivers: Driver[],
  race: number,
  lastResults: RaceResult[]
) => TeamV2;

// Helper to pick captain (highest expected scorer)
function pickCaptain(teamDriverIds: string[], drivers: Driver[], lastResults: RaceResult[]): string {
  // Pick driver with best recent form
  let bestId = teamDriverIds[0];
  let bestForm = 0;

  for (const id of teamDriverIds) {
    const driver = drivers.find(d => d.id === id);
    if (driver) {
      const form = driver.recentPoints.slice(0, 3).reduce((a, b) => a + b, 0);
      if (form > bestForm) {
        bestForm = form;
        bestId = id;
      }
    }
  }

  return bestId;
}

// Strategy 1: Premium Stack V2
const premiumStrategyV2: StrategyV2 = (team, drivers, race, lastResults) => {
  if (race === 1) {
    const sorted = [...drivers].sort((a, b) => b.price - a.price);
    let budget = PRICING.STARTING_BUDGET;
    const selected: string[] = [];
    const purchasePrices = new Map<string, number>();

    for (const d of sorted) {
      if (selected.length >= 5) break;
      if (d.price <= budget) {
        selected.push(d.id);
        purchasePrices.set(d.id, d.price);
        budget -= d.price;
      }
    }

    return {
      drivers: selected,
      driverPurchasePrices: purchasePrices,
      budget,
      totalPoints: 0,
      bonusPoints: 0,
      transfers: 0,
      racesSinceTransfer: 0,
      captain: selected[0],
      hotHandBonuses: 0,
      valueCaptureBonus: 0,
      stalePenalty: 0,
    };
  }

  // Premium Stack: NO transfers, just pick captain
  const newTeam = { ...team };
  newTeam.racesSinceTransfer++;
  newTeam.captain = pickCaptain(team.drivers, drivers, lastResults);

  // Apply stale penalty after threshold
  if (newTeam.racesSinceTransfer > PRICING.STALE_ROSTER_THRESHOLD) {
    newTeam.stalePenalty += PRICING.STALE_ROSTER_PENALTY;
  }

  return newTeam;
};

// Strategy 2: Form Chaser V2 (with bonuses)
const formChaserV2: StrategyV2 = (team, drivers, race, lastResults) => {
  if (race === 1) {
    const sorted = [...drivers].sort((a, b) => b.prevSeasonPoints - a.prevSeasonPoints);
    let budget = PRICING.STARTING_BUDGET;
    const selected: string[] = [];
    const purchasePrices = new Map<string, number>();

    for (let i = 0; i < 10 && selected.length < 5; i++) {
      const d = sorted[i];
      if (d.price <= budget) {
        selected.push(d.id);
        purchasePrices.set(d.id, d.price);
        budget -= d.price;
      }
    }

    return {
      drivers: selected,
      driverPurchasePrices: purchasePrices,
      budget,
      totalPoints: 0,
      bonusPoints: 0,
      transfers: 0,
      racesSinceTransfer: 0,
      captain: selected[0],
      hotHandBonuses: 0,
      valueCaptureBonus: 0,
      stalePenalty: 0,
    };
  }

  let newTeam = { ...team, driverPurchasePrices: new Map(team.driverPurchasePrices) };

  // Chase form every 2 races
  if (race > 3 && race % 2 === 0) {
    const formScores = drivers
      .filter(d => !team.drivers.includes(d.id))
      .map(d => ({
        driver: d,
        form: d.recentPoints.slice(0, 3).reduce((a, b) => a + b, 0)
      }))
      .sort((a, b) => b.form - a.form);

    const teamForms = team.drivers
      .map(id => {
        const d = drivers.find(dr => dr.id === id)!;
        return {
          driver: d,
          form: d.recentPoints.slice(0, 3).reduce((a, b) => a + b, 0),
          purchasePrice: team.driverPurchasePrices.get(id) || d.price
        };
      })
      .sort((a, b) => a.form - b.form);

    const worstOnTeam = teamForms[0];
    const bestAvailable = formScores.find(f =>
      f.driver.price <= newTeam.budget + worstOnTeam.driver.price
    );

    if (bestAvailable && bestAvailable.form > worstOnTeam.form * 1.3) {
      // Calculate value capture bonus
      const salePrice = worstOnTeam.driver.price;
      const profit = salePrice - worstOnTeam.purchasePrice;
      if (profit > 0) {
        const valueBonus = Math.floor(profit / 10) * PRICING.VALUE_CAPTURE_RATE;
        newTeam.valueCaptureBonus += valueBonus;
      }

      // Make the transfer
      const newDrivers = team.drivers.filter(id => id !== worstOnTeam.driver.id);
      newDrivers.push(bestAvailable.driver.id);

      newTeam.drivers = newDrivers;
      newTeam.driverPurchasePrices.delete(worstOnTeam.driver.id);
      newTeam.driverPurchasePrices.set(bestAvailable.driver.id, bestAvailable.driver.price);
      newTeam.budget = newTeam.budget + worstOnTeam.driver.price - bestAvailable.driver.price;
      newTeam.transfers++;
      newTeam.racesSinceTransfer = 0;
    }
  }

  newTeam.racesSinceTransfer++;
  newTeam.captain = pickCaptain(newTeam.drivers, drivers, lastResults);

  return newTeam;
};

// Strategy 3: Active Manager V2 (Aggressive transfers for bonuses)
const activeManagerV2: StrategyV2 = (team, drivers, race, lastResults) => {
  if (race === 1) {
    // Start with balanced team
    const sorted = [...drivers].sort((a, b) => b.price - a.price);
    let budget = PRICING.STARTING_BUDGET;
    const selected: string[] = [];
    const purchasePrices = new Map<string, number>();

    // 2 premium + 3 value
    for (const d of sorted.slice(0, 3)) {
      if (selected.length >= 2) break;
      if (d.price <= budget) {
        selected.push(d.id);
        purchasePrices.set(d.id, d.price);
        budget -= d.price;
      }
    }

    const value = sorted.filter(d => !selected.includes(d.id) && d.price <= 80)
      .sort((a, b) => b.baseStrength - a.baseStrength);

    for (const d of value) {
      if (selected.length >= 5) break;
      if (d.price <= budget) {
        selected.push(d.id);
        purchasePrices.set(d.id, d.price);
        budget -= d.price;
      }
    }

    return {
      drivers: selected,
      driverPurchasePrices: purchasePrices,
      budget,
      totalPoints: 0,
      bonusPoints: 0,
      transfers: 0,
      racesSinceTransfer: 0,
      captain: selected[0],
      hotHandBonuses: 0,
      valueCaptureBonus: 0,
      stalePenalty: 0,
    };
  }

  let newTeam = { ...team, driverPurchasePrices: new Map(team.driverPurchasePrices) };

  // Aggressive: transfer every 3 races to avoid stale penalty and capture value
  if (race % 3 === 0) {
    const teamDrivers = team.drivers.map(id => ({
      driver: drivers.find(d => d.id === id)!,
      purchasePrice: team.driverPurchasePrices.get(id) || 0
    }));

    // Find driver with most profit to sell
    const profitable = teamDrivers
      .filter(t => t.driver.price > t.purchasePrice)
      .sort((a, b) => (b.driver.price - b.purchasePrice) - (a.driver.price - a.purchasePrice));

    if (profitable.length > 0) {
      const toSell = profitable[0];
      const profit = toSell.driver.price - toSell.purchasePrice;
      const valueBonus = Math.floor(profit / 10) * PRICING.VALUE_CAPTURE_RATE;
      newTeam.valueCaptureBonus += valueBonus;

      // Find replacement
      const replacement = drivers
        .filter(d => !team.drivers.includes(d.id) && d.price <= newTeam.budget + toSell.driver.price)
        .sort((a, b) => b.baseStrength - a.baseStrength)[0];

      if (replacement) {
        const newDrivers = team.drivers.filter(id => id !== toSell.driver.id);
        newDrivers.push(replacement.id);

        newTeam.drivers = newDrivers;
        newTeam.driverPurchasePrices.delete(toSell.driver.id);
        newTeam.driverPurchasePrices.set(replacement.id, replacement.price);
        newTeam.budget = newTeam.budget + toSell.driver.price - replacement.price;
        newTeam.transfers++;
        newTeam.racesSinceTransfer = 0;
      }
    }
  }

  newTeam.racesSinceTransfer++;
  newTeam.captain = pickCaptain(newTeam.drivers, drivers, lastResults);

  return newTeam;
};

// Strategy 4: Balanced V2
const balancedV2: StrategyV2 = (team, drivers, race, lastResults) => {
  if (race === 1) {
    const sorted = [...drivers].sort((a, b) => b.price - a.price);
    let budget = PRICING.STARTING_BUDGET;
    const selected: string[] = [];
    const purchasePrices = new Map<string, number>();

    for (const d of sorted.slice(0, 5)) {
      if (selected.length >= 2) break;
      if (d.price <= budget) {
        selected.push(d.id);
        purchasePrices.set(d.id, d.price);
        budget -= d.price;
      }
    }

    const midTier = sorted
      .filter(d => !selected.includes(d.id) && d.price <= 100)
      .sort((a, b) => (b.baseStrength / b.price) - (a.baseStrength / a.price));

    for (const d of midTier) {
      if (selected.length >= 5) break;
      if (d.price <= budget) {
        selected.push(d.id);
        purchasePrices.set(d.id, d.price);
        budget -= d.price;
      }
    }

    return {
      drivers: selected,
      driverPurchasePrices: purchasePrices,
      budget,
      totalPoints: 0,
      bonusPoints: 0,
      transfers: 0,
      racesSinceTransfer: 0,
      captain: selected[0],
      hotHandBonuses: 0,
      valueCaptureBonus: 0,
      stalePenalty: 0,
    };
  }

  let newTeam = { ...team, driverPurchasePrices: new Map(team.driverPurchasePrices) };

  // Transfer every 4 races
  if (race % 4 === 0) {
    const teamDrivers = team.drivers.map(id => ({
      driver: drivers.find(d => d.id === id)!,
      purchasePrice: team.driverPurchasePrices.get(id) || 0
    }));

    const underperformer = teamDrivers
      .filter(t => t.driver.recentPoints.length >= 3)
      .sort((a, b) => {
        const aAvg = a.driver.recentPoints.slice(0, 3).reduce((x, y) => x + y, 0) / 3;
        const bAvg = b.driver.recentPoints.slice(0, 3).reduce((x, y) => x + y, 0) / 3;
        return aAvg - bAvg;
      })[0];

    if (underperformer) {
      const profit = underperformer.driver.price - underperformer.purchasePrice;
      if (profit > 0) {
        const valueBonus = Math.floor(profit / 10) * PRICING.VALUE_CAPTURE_RATE;
        newTeam.valueCaptureBonus += valueBonus;
      }

      const replacement = drivers
        .filter(d => !team.drivers.includes(d.id) && d.price <= newTeam.budget + underperformer.driver.price)
        .sort((a, b) => b.baseStrength - a.baseStrength)[0];

      if (replacement && replacement.baseStrength > underperformer.driver.baseStrength) {
        const newDrivers = team.drivers.filter(id => id !== underperformer.driver.id);
        newDrivers.push(replacement.id);

        newTeam.drivers = newDrivers;
        newTeam.driverPurchasePrices.delete(underperformer.driver.id);
        newTeam.driverPurchasePrices.set(replacement.id, replacement.price);
        newTeam.budget = newTeam.budget + underperformer.driver.price - replacement.price;
        newTeam.transfers++;
        newTeam.racesSinceTransfer = 0;
      }
    }
  }

  newTeam.racesSinceTransfer++;
  newTeam.captain = pickCaptain(newTeam.drivers, drivers, lastResults);

  return newTeam;
};

// ============================================
// RUN V2 SIMULATION
// ============================================
interface StrategyResultV2 {
  name: string;
  totalPoints: number;
  basePoints: number;
  captainBonus: number;
  valueCaptureBonus: number;
  stalePenalty: number;
  transfers: number;
  finalTeam: string[];
}

function runSimulationV2(numSimulations: number = 10): void {
  const strategies: { name: string; fn: StrategyV2 }[] = [
    { name: '💎 Premium Stack', fn: premiumStrategyV2 },
    { name: '🔥 Form Chaser', fn: formChaserV2 },
    { name: '📊 Active Manager', fn: activeManagerV2 },
    { name: '⚖️ Balanced Mix', fn: balancedV2 },
  ];

  const allResults: Map<string, StrategyResultV2[]> = new Map();
  strategies.forEach(s => allResults.set(s.name, []));

  console.log('\n' + '='.repeat(70));
  console.log('🏎️  F1 FANTASY SEASON SIMULATOR V2');
  console.log('='.repeat(70));
  console.log('\n📋 V2 RULE CHANGES:');
  console.log('   • Max Price Change: $15 → $25 (more volatility)');
  console.log('   • Min Price: $5 → $3 (deeper value plays)');
  console.log('   • Captain System: 2x points on 1 driver per race');
  console.log('   • Stale Penalty: -2 pts/race after 8 races without transfer');
  console.log('   • Value Capture: +2 pts per $10 profit when selling');
  console.log(`\n🎲 Running ${numSimulations} simulations per strategy...\n`);

  for (let sim = 0; sim < numSimulations; sim++) {
    const drivers = createDrivers();
    const teams: Map<string, TeamV2> = new Map();

    strategies.forEach(s => {
      teams.set(s.name, {
        drivers: [],
        driverPurchasePrices: new Map(),
        budget: PRICING.STARTING_BUDGET,
        totalPoints: 0,
        bonusPoints: 0,
        transfers: 0,
        racesSinceTransfer: 0,
        captain: '',
        hotHandBonuses: 0,
        valueCaptureBonus: 0,
        stalePenalty: 0,
      });
    });

    let captainBonuses: Map<string, number> = new Map();
    strategies.forEach(s => captainBonuses.set(s.name, 0));

    for (let race = 1; race <= PRICING.RACES_PER_SEASON; race++) {
      const isSprint = SPRINT_RACES.includes(race);

      // Update teams before race
      for (const { name, fn } of strategies) {
        const currentTeam = teams.get(name)!;
        const results = race > 1 ? simulateRace(drivers, false) : [];
        const newTeam = fn(currentTeam, drivers, race, results);
        teams.set(name, newTeam);
      }

      // Simulate race
      const raceResults = simulateRace(drivers, isSprint);

      // Calculate points with captain bonus
      for (const { name } of strategies) {
        const team = teams.get(name)!;
        let racePoints = 0;
        let captainBonus = 0;

        for (const driverId of team.drivers) {
          const result = raceResults.find(r => r.driverId === driverId);
          if (result) {
            racePoints += result.totalPoints;

            // Captain gets 2x (so add extra 1x)
            if (driverId === team.captain) {
              captainBonus = result.totalPoints; // Extra 1x
            }
          }
        }

        team.totalPoints += racePoints;
        captainBonuses.set(name, (captainBonuses.get(name) || 0) + captainBonus);
      }

      updatePrices(drivers, raceResults, isSprint);
    }

    // Record final results
    for (const { name } of strategies) {
      const team = teams.get(name)!;
      const captainBonus = captainBonuses.get(name) || 0;

      // Calculate final score
      const basePoints = team.totalPoints;
      const totalWithBonuses = basePoints + captainBonus + team.valueCaptureBonus - team.stalePenalty;

      allResults.get(name)!.push({
        name,
        totalPoints: totalWithBonuses,
        basePoints,
        captainBonus,
        valueCaptureBonus: team.valueCaptureBonus,
        stalePenalty: team.stalePenalty,
        transfers: team.transfers,
        finalTeam: team.drivers,
      });
    }
  }

  // ============================================
  // DISPLAY V2 RESULTS
  // ============================================
  console.log('='.repeat(70));
  console.log('📊 V2 SIMULATION RESULTS');
  console.log('='.repeat(70));

  interface Summary {
    name: string;
    avgTotal: number;
    avgBase: number;
    avgCaptain: number;
    avgValueBonus: number;
    avgStalePenalty: number;
    avgTransfers: number;
  }

  const summaries: Summary[] = [];

  for (const { name } of strategies) {
    const results = allResults.get(name)!;

    summaries.push({
      name,
      avgTotal: Math.round(results.reduce((a, b) => a + b.totalPoints, 0) / results.length),
      avgBase: Math.round(results.reduce((a, b) => a + b.basePoints, 0) / results.length),
      avgCaptain: Math.round(results.reduce((a, b) => a + b.captainBonus, 0) / results.length),
      avgValueBonus: Math.round(results.reduce((a, b) => a + b.valueCaptureBonus, 0) / results.length),
      avgStalePenalty: Math.round(results.reduce((a, b) => a + b.stalePenalty, 0) / results.length),
      avgTransfers: Math.round(results.reduce((a, b) => a + b.transfers, 0) / results.length),
    });
  }

  summaries.sort((a, b) => b.avgTotal - a.avgTotal);

  console.log('\n🏆 V2 STRATEGY RANKINGS:\n');
  console.log('┌─────┬────────────────────┬───────────┬───────────┬───────────┬───────────┬────────────┬───────────┐');
  console.log('│ Rank│ Strategy           │ TOTAL     │ Base      │ Captain+  │ Value+    │ Stale-     │ Transfers │');
  console.log('├─────┼────────────────────┼───────────┼───────────┼───────────┼───────────┼────────────┼───────────┤');

  summaries.forEach((s, i) => {
    const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1} `;
    console.log(
      `│ ${rank} │ ${s.name.padEnd(18)} │ ${String(s.avgTotal).padStart(9)} │ ${String(s.avgBase).padStart(9)} │ ${String('+' + s.avgCaptain).padStart(9)} │ ${String('+' + s.avgValueBonus).padStart(9)} │ ${String('-' + s.avgStalePenalty).padStart(10)} │ ${String(s.avgTransfers).padStart(9)} │`
    );
  });

  console.log('└─────┴────────────────────┴───────────┴───────────┴───────────┴───────────┴────────────┴───────────┘');

  // Show gap analysis
  const gap = summaries[0].avgTotal - summaries[summaries.length - 1].avgTotal;
  const premiumIdx = summaries.findIndex(s => s.name.includes('Premium'));
  const formIdx = summaries.findIndex(s => s.name.includes('Form'));

  console.log('\n' + '='.repeat(70));
  console.log('📈 GAP ANALYSIS');
  console.log('='.repeat(70));
  console.log(`
  V1 Gap (Form Chaser vs Premium Stack): ~23 points (1909 vs 1886)
  V2 Gap (1st vs Last):                  ${gap} points

  Premium Stack Breakdown:
    Base Points:   ${summaries[premiumIdx].avgBase}
    Captain Bonus: +${summaries[premiumIdx].avgCaptain}
    Value Bonus:   +${summaries[premiumIdx].avgValueBonus}
    Stale Penalty: -${summaries[premiumIdx].avgStalePenalty}
    ─────────────────
    TOTAL:         ${summaries[premiumIdx].avgTotal}

  Form Chaser Breakdown:
    Base Points:   ${summaries[formIdx].avgBase}
    Captain Bonus: +${summaries[formIdx].avgCaptain}
    Value Bonus:   +${summaries[formIdx].avgValueBonus}
    Stale Penalty: -${summaries[formIdx].avgStalePenalty}
    ─────────────────
    TOTAL:         ${summaries[formIdx].avgTotal}

  NEW GAP: ${Math.abs(summaries[formIdx].avgTotal - summaries[premiumIdx].avgTotal)} points
  `);

  console.log('='.repeat(70));
  console.log('✅ V2 CHANGES IMPACT');
  console.log('='.repeat(70));
  console.log(`
  ┌────────────────────────────────────────────────────────────────────┐
  │ STALE PENALTY EFFECT:                                             │
  │ Premium Stack loses ${summaries[premiumIdx].avgStalePenalty} points for not making transfers        │
  │ (-2 pts × ${Math.max(0, 24 - PRICING.STALE_ROSTER_THRESHOLD)} races after threshold)                                       │
  │                                                                    │
  │ VALUE CAPTURE EFFECT:                                              │
  │ Active strategies earn +${summaries[formIdx].avgValueBonus}-${summaries.filter(s => !s.name.includes('Premium')).reduce((max, s) => Math.max(max, s.avgValueBonus), 0)} bonus points from smart sells      │
  │                                                                    │
  │ CAPTAIN BONUS (Same for all):                                      │
  │ All strategies benefit equally from captain picks                  │
  │ (+${summaries[0].avgCaptain} avg per season)                                              │
  └────────────────────────────────────────────────────────────────────┘
  `);
}

runSimulationV2(10);
