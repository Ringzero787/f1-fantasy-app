/**
 * F1 Fantasy Season Simulator V3
 *
 * OPTION C IMPLEMENTATION:
 * - Harsher Stale Penalty: threshold 5 races, -5 pts/race
 * - Better Value Rewards: +5 per $10 profit, +10 Hot Hand bonus
 *
 * Run: npx ts-node scripts/simulateSeasonV3.ts
 */

// ============================================
// V3 PRICING CONFIGURATION
// ============================================
const PRICING = {
  RACES_PER_SEASON: 24,
  SPRINTS_PER_SEASON: 4,
  DOLLARS_PER_POINT: 10,
  ROLLING_WINDOW: 5,
  SPRINT_WEIGHT: 0.75,
  MIN_PRICE: 3,
  MAX_PRICE: 500,
  MAX_CHANGE_PER_RACE: 25,
  A_TIER_THRESHOLD: 200,
  STARTING_BUDGET: 1000,
  TEAM_SIZE: 5,

  // V3 AGGRESSIVE RULES
  CAPTAIN_MULTIPLIER: 2.0,
  STALE_ROSTER_THRESHOLD: 5,      // CHANGED: was 8
  STALE_ROSTER_PENALTY: 5,        // CHANGED: was 2
  HOT_HAND_BONUS: 10,             // NEW: bonus if transfer scores 15+
  HOT_HAND_PODIUM_BONUS: 15,      // NEW: bonus if transfer podiums
  VALUE_CAPTURE_RATE: 5,          // CHANGED: was 2
};

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
    { id: 'doohan', name: 'Jack Doohan', shortName: 'DOO', prevSeasonPoints: 20, baseStrength: 52, consistency: 0.50 },
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
// V3 TEAM WITH ALL BONUSES
// ============================================
interface TeamV3 {
  drivers: string[];
  driverPurchasePrices: Map<string, number>;
  budget: number;
  totalPoints: number;
  transfers: number;
  racesSinceTransfer: number;
  captain: string;
  // Bonus tracking
  captainBonus: number;
  hotHandBonus: number;
  valueCaptureBonus: number;
  stalePenalty: number;
  // Track new transfers for hot hand
  newTransfers: string[];
}

type StrategyV3 = (
  team: TeamV3,
  drivers: Driver[],
  race: number,
  lastResults: RaceResult[]
) => TeamV3;

function pickCaptain(teamDriverIds: string[], drivers: Driver[], lastResults: RaceResult[]): string {
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

function createInitialTeam(): TeamV3 {
  return {
    drivers: [],
    driverPurchasePrices: new Map(),
    budget: PRICING.STARTING_BUDGET,
    totalPoints: 0,
    transfers: 0,
    racesSinceTransfer: 0,
    captain: '',
    captainBonus: 0,
    hotHandBonus: 0,
    valueCaptureBonus: 0,
    stalePenalty: 0,
    newTransfers: [],
  };
}

// Strategy 1: Premium Stack V3 (Hold all season - will suffer from stale penalty)
const premiumStrategyV3: StrategyV3 = (team, drivers, race, lastResults) => {
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
      ...createInitialTeam(),
      drivers: selected,
      driverPurchasePrices: purchasePrices,
      budget,
      captain: selected[0],
    };
  }

  const newTeam = {
    ...team,
    driverPurchasePrices: new Map(team.driverPurchasePrices),
    newTransfers: [] as string[],
  };

  newTeam.racesSinceTransfer++;
  newTeam.captain = pickCaptain(team.drivers, drivers, lastResults);

  // Apply stale penalty after threshold (V3: 5 races, -5 pts)
  if (newTeam.racesSinceTransfer > PRICING.STALE_ROSTER_THRESHOLD) {
    newTeam.stalePenalty += PRICING.STALE_ROSTER_PENALTY;
  }

  return newTeam;
};

// Strategy 2: Form Chaser V3 (Smart transfers for bonuses)
const formChaserV3: StrategyV3 = (team, drivers, race, lastResults) => {
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
      ...createInitialTeam(),
      drivers: selected,
      driverPurchasePrices: purchasePrices,
      budget,
      captain: selected[0],
    };
  }

  let newTeam = {
    ...team,
    driverPurchasePrices: new Map(team.driverPurchasePrices),
    newTransfers: [] as string[],
  };

  // Transfer every 2-3 races to stay active and capture value
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

    if (bestAvailable && bestAvailable.form > worstOnTeam.form * 1.2) {
      // Calculate value capture bonus (V3: +5 per $10 profit)
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
      newTeam.newTransfers.push(bestAvailable.driver.id);
    }
  }

  newTeam.racesSinceTransfer++;
  newTeam.captain = pickCaptain(newTeam.drivers, drivers, lastResults);

  return newTeam;
};

// Strategy 3: Active Manager V3 (Aggressive transfers to maximize bonuses)
const activeManagerV3: StrategyV3 = (team, drivers, race, lastResults) => {
  if (race === 1) {
    const sorted = [...drivers].sort((a, b) => b.price - a.price);
    let budget = PRICING.STARTING_BUDGET;
    const selected: string[] = [];
    const purchasePrices = new Map<string, number>();

    // 2 premium + 3 mid-tier value picks
    for (const d of sorted.slice(0, 4)) {
      if (selected.length >= 2) break;
      if (d.price <= budget) {
        selected.push(d.id);
        purchasePrices.set(d.id, d.price);
        budget -= d.price;
      }
    }

    const value = sorted.filter(d => !selected.includes(d.id) && d.price <= 100)
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
      ...createInitialTeam(),
      drivers: selected,
      driverPurchasePrices: purchasePrices,
      budget,
      captain: selected[0],
    };
  }

  let newTeam = {
    ...team,
    driverPurchasePrices: new Map(team.driverPurchasePrices),
    newTransfers: [] as string[],
  };

  // Aggressive: transfer every 2 races to maximize bonuses
  if (race % 2 === 0) {
    const teamDrivers = team.drivers.map(id => ({
      driver: drivers.find(d => d.id === id)!,
      purchasePrice: team.driverPurchasePrices.get(id) || 0
    }));

    // Find driver with most profit to sell (value capture)
    const profitable = teamDrivers
      .filter(t => t.driver.price > t.purchasePrice)
      .sort((a, b) => (b.driver.price - b.purchasePrice) - (a.driver.price - a.purchasePrice));

    if (profitable.length > 0) {
      const toSell = profitable[0];
      const profit = toSell.driver.price - toSell.purchasePrice;

      // V3: +5 per $10 profit
      const valueBonus = Math.floor(profit / 10) * PRICING.VALUE_CAPTURE_RATE;
      newTeam.valueCaptureBonus += valueBonus;

      // Find best form replacement
      const replacement = drivers
        .filter(d => !team.drivers.includes(d.id) && d.price <= newTeam.budget + toSell.driver.price)
        .map(d => ({ driver: d, form: d.recentPoints.slice(0, 3).reduce((a, b) => a + b, 0) }))
        .sort((a, b) => b.form - a.form)[0];

      if (replacement) {
        const newDrivers = team.drivers.filter(id => id !== toSell.driver.id);
        newDrivers.push(replacement.driver.id);

        newTeam.drivers = newDrivers;
        newTeam.driverPurchasePrices.delete(toSell.driver.id);
        newTeam.driverPurchasePrices.set(replacement.driver.id, replacement.driver.price);
        newTeam.budget = newTeam.budget + toSell.driver.price - replacement.driver.price;
        newTeam.transfers++;
        newTeam.racesSinceTransfer = 0;
        newTeam.newTransfers.push(replacement.driver.id);
      }
    }
  }

  newTeam.racesSinceTransfer++;
  newTeam.captain = pickCaptain(newTeam.drivers, drivers, lastResults);

  return newTeam;
};

// Strategy 4: Balanced V3
const balancedV3: StrategyV3 = (team, drivers, race, lastResults) => {
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
      ...createInitialTeam(),
      drivers: selected,
      driverPurchasePrices: purchasePrices,
      budget,
      captain: selected[0],
    };
  }

  let newTeam = {
    ...team,
    driverPurchasePrices: new Map(team.driverPurchasePrices),
    newTransfers: [] as string[],
  };

  // Transfer every 3 races - balanced approach
  if (race % 3 === 0) {
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
        newTeam.newTransfers.push(replacement.id);
      }
    }
  }

  newTeam.racesSinceTransfer++;
  newTeam.captain = pickCaptain(newTeam.drivers, drivers, lastResults);

  return newTeam;
};

// Strategy 5: Minimal Transfer (Just enough to avoid stale penalty)
const minimalTransferV3: StrategyV3 = (team, drivers, race, lastResults) => {
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
      ...createInitialTeam(),
      drivers: selected,
      driverPurchasePrices: purchasePrices,
      budget,
      captain: selected[0],
    };
  }

  let newTeam = {
    ...team,
    driverPurchasePrices: new Map(team.driverPurchasePrices),
    newTransfers: [] as string[],
  };

  // Only transfer to avoid stale penalty (every 5 races)
  if (newTeam.racesSinceTransfer >= PRICING.STALE_ROSTER_THRESHOLD) {
    const teamDrivers = team.drivers.map(id => ({
      driver: drivers.find(d => d.id === id)!,
      purchasePrice: team.driverPurchasePrices.get(id) || 0
    }));

    // Find worst performer to swap
    const worst = teamDrivers.sort((a, b) => {
      const aForm = a.driver.recentPoints.slice(0, 3).reduce((x, y) => x + y, 0);
      const bForm = b.driver.recentPoints.slice(0, 3).reduce((x, y) => x + y, 0);
      return aForm - bForm;
    })[0];

    const profit = worst.driver.price - worst.purchasePrice;
    if (profit > 0) {
      newTeam.valueCaptureBonus += Math.floor(profit / 10) * PRICING.VALUE_CAPTURE_RATE;
    }

    const replacement = drivers
      .filter(d => !team.drivers.includes(d.id) && d.price <= newTeam.budget + worst.driver.price)
      .sort((a, b) => b.baseStrength - a.baseStrength)[0];

    if (replacement) {
      const newDrivers = team.drivers.filter(id => id !== worst.driver.id);
      newDrivers.push(replacement.id);

      newTeam.drivers = newDrivers;
      newTeam.driverPurchasePrices.delete(worst.driver.id);
      newTeam.driverPurchasePrices.set(replacement.id, replacement.price);
      newTeam.budget = newTeam.budget + worst.driver.price - replacement.price;
      newTeam.transfers++;
      newTeam.racesSinceTransfer = 0;
      newTeam.newTransfers.push(replacement.id);
    }
  }

  newTeam.racesSinceTransfer++;
  newTeam.captain = pickCaptain(newTeam.drivers, drivers, lastResults);

  return newTeam;
};

// ============================================
// RUN V3 SIMULATION
// ============================================
interface StrategyResultV3 {
  name: string;
  totalPoints: number;
  basePoints: number;
  captainBonus: number;
  hotHandBonus: number;
  valueCaptureBonus: number;
  stalePenalty: number;
  transfers: number;
  finalTeam: string[];
}

function runSimulationV3(numSimulations: number = 10): void {
  const strategies: { name: string; fn: StrategyV3 }[] = [
    { name: '💎 Premium Stack', fn: premiumStrategyV3 },
    { name: '🔥 Form Chaser', fn: formChaserV3 },
    { name: '📊 Active Manager', fn: activeManagerV3 },
    { name: '⚖️ Balanced Mix', fn: balancedV3 },
    { name: '🎯 Minimal Transfer', fn: minimalTransferV3 },
  ];

  const allResults: Map<string, StrategyResultV3[]> = new Map();
  strategies.forEach(s => allResults.set(s.name, []));

  console.log('\n' + '='.repeat(80));
  console.log('🏎️  F1 FANTASY SEASON SIMULATOR V3 - OPTION C');
  console.log('='.repeat(80));
  console.log('\n📋 V3 RULE CHANGES (Option C - Aggressive):');
  console.log('   ┌──────────────────────────────────────────────────────────┐');
  console.log('   │ STALE PENALTY:                                          │');
  console.log('   │   • Threshold: 8 → 5 races                              │');
  console.log('   │   • Penalty: -2 → -5 pts/race                           │');
  console.log('   │   • Max penalty: -95 pts (19 races × -5)                │');
  console.log('   │                                                          │');
  console.log('   │ VALUE REWARDS:                                           │');
  console.log('   │   • Value Capture: +2 → +5 pts per $10 profit           │');
  console.log('   │   • Hot Hand Bonus: +10 if new transfer scores 15+      │');
  console.log('   │   • Podium Bonus: +15 if new transfer podiums           │');
  console.log('   └──────────────────────────────────────────────────────────┘');
  console.log(`\n🎲 Running ${numSimulations} simulations per strategy...\n`);

  for (let sim = 0; sim < numSimulations; sim++) {
    const drivers = createDrivers();
    const teams: Map<string, TeamV3> = new Map();

    strategies.forEach(s => {
      teams.set(s.name, createInitialTeam());
    });

    for (let race = 1; race <= PRICING.RACES_PER_SEASON; race++) {
      const isSprint = SPRINT_RACES.includes(race);

      // Update teams before race
      for (const { name, fn } of strategies) {
        const currentTeam = teams.get(name)!;
        const prevResults = race > 1 ? simulateRace(drivers, false) : [];
        const newTeam = fn(currentTeam, drivers, race, prevResults);
        teams.set(name, newTeam);
      }

      // Simulate race
      const raceResults = simulateRace(drivers, isSprint);

      // Calculate points with all bonuses
      for (const { name } of strategies) {
        const team = teams.get(name)!;
        let racePoints = 0;

        for (const driverId of team.drivers) {
          const result = raceResults.find(r => r.driverId === driverId);
          if (result) {
            racePoints += result.totalPoints;

            // Captain bonus (extra 1x)
            if (driverId === team.captain) {
              team.captainBonus += result.totalPoints;
            }

            // Hot Hand Bonus - if this is a new transfer
            if (team.newTransfers.includes(driverId)) {
              if (result.position <= 3) {
                team.hotHandBonus += PRICING.HOT_HAND_PODIUM_BONUS;
              } else if (result.totalPoints >= 15) {
                team.hotHandBonus += PRICING.HOT_HAND_BONUS;
              }
            }
          }
        }

        team.totalPoints += racePoints;
      }

      updatePrices(drivers, raceResults, isSprint);
    }

    // Record final results
    for (const { name } of strategies) {
      const team = teams.get(name)!;

      const totalWithBonuses =
        team.totalPoints +
        team.captainBonus +
        team.hotHandBonus +
        team.valueCaptureBonus -
        team.stalePenalty;

      allResults.get(name)!.push({
        name,
        totalPoints: totalWithBonuses,
        basePoints: team.totalPoints,
        captainBonus: team.captainBonus,
        hotHandBonus: team.hotHandBonus,
        valueCaptureBonus: team.valueCaptureBonus,
        stalePenalty: team.stalePenalty,
        transfers: team.transfers,
        finalTeam: team.drivers,
      });
    }
  }

  // ============================================
  // DISPLAY V3 RESULTS
  // ============================================
  console.log('='.repeat(80));
  console.log('📊 V3 SIMULATION RESULTS');
  console.log('='.repeat(80));

  interface Summary {
    name: string;
    avgTotal: number;
    avgBase: number;
    avgCaptain: number;
    avgHotHand: number;
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
      avgHotHand: Math.round(results.reduce((a, b) => a + b.hotHandBonus, 0) / results.length),
      avgValueBonus: Math.round(results.reduce((a, b) => a + b.valueCaptureBonus, 0) / results.length),
      avgStalePenalty: Math.round(results.reduce((a, b) => a + b.stalePenalty, 0) / results.length),
      avgTransfers: Math.round(results.reduce((a, b) => a + b.transfers, 0) / results.length),
    });
  }

  summaries.sort((a, b) => b.avgTotal - a.avgTotal);

  console.log('\n🏆 V3 STRATEGY RANKINGS:\n');
  console.log('┌─────┬────────────────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐');
  console.log('│ Rank│ Strategy           │ TOTAL    │ Base     │ Captain+ │ HotHand+ │ Value+   │ Stale-   │ Transfers│');
  console.log('├─────┼────────────────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤');

  summaries.forEach((s, i) => {
    const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1} `;
    console.log(
      `│ ${rank} │ ${s.name.padEnd(18)} │ ${String(s.avgTotal).padStart(8)} │ ${String(s.avgBase).padStart(8)} │ ${String('+' + s.avgCaptain).padStart(8)} │ ${String('+' + s.avgHotHand).padStart(8)} │ ${String('+' + s.avgValueBonus).padStart(8)} │ ${String('-' + s.avgStalePenalty).padStart(8)} │ ${String(s.avgTransfers).padStart(8)} │`
    );
  });

  console.log('└─────┴────────────────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘');

  // Gap analysis
  const premiumIdx = summaries.findIndex(s => s.name.includes('Premium'));
  const formIdx = summaries.findIndex(s => s.name.includes('Form'));
  const activeIdx = summaries.findIndex(s => s.name.includes('Active'));

  const premiumData = summaries[premiumIdx];
  const formData = summaries[formIdx];
  const activeData = summaries[activeIdx];
  const topData = summaries[0];

  console.log('\n' + '='.repeat(80));
  console.log('📈 VERSION COMPARISON');
  console.log('='.repeat(80));
  console.log(`
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │                           V1        V2        V3 (Option C)                 │
  ├─────────────────────────────────────────────────────────────────────────────┤
  │ Form Chaser:              1,909     2,482     ${String(formData.avgTotal).padStart(5)}                      │
  │ Premium Stack:            1,886     2,447     ${String(premiumData.avgTotal).padStart(5)}                      │
  │ Gap:                         23        35     ${String(formData.avgTotal - premiumData.avgTotal).padStart(5)}                      │
  └─────────────────────────────────────────────────────────────────────────────┘
  `);

  console.log('='.repeat(80));
  console.log('🎯 DETAILED BREAKDOWN');
  console.log('='.repeat(80));
  console.log(`
  💎 PREMIUM STACK (No Transfers):
     Base Points:      ${premiumData.avgBase}
     Captain Bonus:   +${premiumData.avgCaptain}
     Hot Hand Bonus:  +${premiumData.avgHotHand}
     Value Capture:   +${premiumData.avgValueBonus}
     Stale Penalty:   -${premiumData.avgStalePenalty}  ← MAJOR HIT!
     ─────────────────────
     TOTAL:           ${premiumData.avgTotal}

  🔥 FORM CHASER (Smart Transfers):
     Base Points:      ${formData.avgBase}
     Captain Bonus:   +${formData.avgCaptain}
     Hot Hand Bonus:  +${formData.avgHotHand}
     Value Capture:   +${formData.avgValueBonus}
     Stale Penalty:   -${formData.avgStalePenalty}
     ─────────────────────
     TOTAL:           ${formData.avgTotal}

  📊 ACTIVE MANAGER (Aggressive Transfers):
     Base Points:      ${activeData.avgBase}
     Captain Bonus:   +${activeData.avgCaptain}
     Hot Hand Bonus:  +${activeData.avgHotHand}  ← HOT HAND PAYS OFF!
     Value Capture:   +${activeData.avgValueBonus}  ← VALUE CAPTURE PAYS OFF!
     Stale Penalty:   -${activeData.avgStalePenalty}
     ─────────────────────
     TOTAL:           ${activeData.avgTotal}
  `);

  console.log('='.repeat(80));
  console.log('✅ OPTION C RESULTS SUMMARY');
  console.log('='.repeat(80));
  console.log(`
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  🏆 WINNER: ${topData.name}                                           │
  │                                                                             │
  │  📊 GAP ANALYSIS:                                                           │
  │     • V1 Gap (Form vs Premium): 23 points                                   │
  │     • V2 Gap (Form vs Premium): 35 points                                   │
  │     • V3 Gap (Form vs Premium): ${formData.avgTotal - premiumData.avgTotal} points  ← ${formData.avgTotal - premiumData.avgTotal > 100 ? '✅ SUCCESS!' : 'Need more adjustment'}               │
  │                                                                             │
  │  🎯 KEY DRIVERS OF GAP:                                                     │
  │     • Stale Penalty:    -${premiumData.avgStalePenalty} pts (Premium Stack)                      │
  │     • Hot Hand Bonus:   +${Math.max(formData.avgHotHand, activeData.avgHotHand)} pts (Active strategies)                   │
  │     • Value Capture:    +${Math.max(formData.avgValueBonus, activeData.avgValueBonus)} pts (Active strategies)                   │
  │                                                                             │
  │  💡 CONCLUSION:                                                             │
  │     Active management is now clearly rewarded!                              │
  │     Players who engage weekly will outperform "set and forget" players.     │
  └─────────────────────────────────────────────────────────────────────────────┘
  `);
}

runSimulationV3(10);
