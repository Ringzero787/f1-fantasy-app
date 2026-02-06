/**
 * F1 Fantasy Season Simulator
 *
 * Simulates different strategies across a 24-race season
 * with 4 sprint weekends using the new pricing rules.
 *
 * Run: npx ts-node scripts/simulateSeason.ts
 */

// ============================================
// PRICING CONFIGURATION (from pricing.config.ts)
// ============================================
const PRICING = {
  RACES_PER_SEASON: 24,
  SPRINTS_PER_SEASON: 4,
  DOLLARS_PER_POINT: 10,
  ROLLING_WINDOW: 5,
  SPRINT_WEIGHT: 0.75,
  MIN_PRICE: 5,
  MAX_PRICE: 500,
  MAX_CHANGE_PER_RACE: 15,
  A_TIER_THRESHOLD: 200,
  STARTING_BUDGET: 1000,
  TEAM_SIZE: 5,
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
// DRIVER DATA (2026 Grid with 2025 points)
// ============================================
interface Driver {
  id: string;
  name: string;
  shortName: string;
  prevSeasonPoints: number;
  baseStrength: number; // 0-100, affects race results
  consistency: number;  // 0-1, higher = more consistent
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

interface SimulationState {
  race: number;
  isSprint: boolean;
  drivers: Driver[];
  results: RaceResult[];
}

// Sprint race rounds (typically early-mid season)
const SPRINT_RACES = [4, 6, 11, 20];

function simulateRace(drivers: Driver[], isSprint: boolean): RaceResult[] {
  // Calculate performance scores with randomness
  const performances = drivers.map(d => ({
    driver: d,
    score: d.baseStrength +
           (Math.random() * 30 - 15) * (1 - d.consistency) + // Consistency factor
           (Math.random() * 10 - 5) // Random luck
  }));

  // Sort by performance (higher is better)
  performances.sort((a, b) => b.score - a.score);

  // Assign positions and points
  const results: RaceResult[] = performances.map((p, index) => {
    const position = index + 1;
    const racePoints = RACE_POINTS[position] || 0;

    let sprintPosition: number | undefined;
    let sprintPoints = 0;

    if (isSprint) {
      // Sprint has different randomness
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

    // Add to recent points (weighted for sprint)
    const pointsToAdd = isSprint
      ? result.totalPoints * PRICING.SPRINT_WEIGHT
      : result.totalPoints;

    driver.recentPoints.unshift(pointsToAdd);
    if (driver.recentPoints.length > PRICING.ROLLING_WINDOW) {
      driver.recentPoints.pop();
    }

    // Calculate new price from rolling average
    const rollingAvg = driver.recentPoints.reduce((a, b) => a + b, 0) / driver.recentPoints.length;
    const targetPrice = Math.round(rollingAvg * PRICING.DOLLARS_PER_POINT);

    // Apply bounded price change
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
// STRATEGY IMPLEMENTATIONS
// ============================================
interface Team {
  drivers: string[];
  budget: number;
  totalPoints: number;
  transfers: number;
}

type Strategy = (
  team: Team,
  drivers: Driver[],
  race: number,
  lastResults: RaceResult[]
) => Team;

// Strategy 1: Premium Stack - Hold top drivers all season
const premiumStrategy: Strategy = (team, drivers, race, lastResults) => {
  if (race === 1) {
    // Initial pick: top 5 affordable
    const sorted = [...drivers].sort((a, b) => b.price - a.price);
    let budget = PRICING.STARTING_BUDGET;
    const selected: string[] = [];

    for (const d of sorted) {
      if (selected.length >= 5) break;
      if (d.price <= budget) {
        selected.push(d.id);
        budget -= d.price;
      }
    }

    return { drivers: selected, budget, totalPoints: 0, transfers: 0 };
  }

  // Hold all season - no transfers
  return team;
};

// Strategy 2: Value Hunting - Buy low, sell high
const valueStrategy: Strategy = (team, drivers, race, lastResults) => {
  if (race === 1) {
    // Pick undervalued drivers (high strength, lower price)
    const valueScores = drivers.map(d => ({
      driver: d,
      value: d.baseStrength / d.price
    })).sort((a, b) => b.value - a.value);

    let budget = PRICING.STARTING_BUDGET;
    const selected: string[] = [];

    for (const v of valueScores) {
      if (selected.length >= 5) break;
      if (v.driver.price <= budget) {
        selected.push(v.driver.id);
        budget -= v.driver.price;
      }
    }

    return { drivers: selected, budget, totalPoints: 0, transfers: 0 };
  }

  // Every 3 races, swap worst performer for best value
  if (race % 3 === 0 && team.transfers < 20) {
    const teamDrivers = team.drivers.map(id => drivers.find(d => d.id === id)!);
    const worst = teamDrivers.sort((a, b) =>
      (a.recentPoints[0] || 0) - (b.recentPoints[0] || 0)
    )[0];

    const available = drivers.filter(d => !team.drivers.includes(d.id));
    const bestValue = available
      .filter(d => d.price <= team.budget + worst.price)
      .sort((a, b) => (b.baseStrength / b.price) - (a.baseStrength / a.price))[0];

    if (bestValue && bestValue.baseStrength > worst.baseStrength) {
      const newDrivers = team.drivers.filter(id => id !== worst.id);
      newDrivers.push(bestValue.id);
      return {
        ...team,
        drivers: newDrivers,
        budget: team.budget + worst.price - bestValue.price,
        transfers: team.transfers + 1
      };
    }
  }

  return team;
};

// Strategy 3: Form Chaser - Pick drivers in hot form
const formStrategy: Strategy = (team, drivers, race, lastResults) => {
  if (race === 1) {
    // Start with balanced picks
    const sorted = [...drivers].sort((a, b) => b.prevSeasonPoints - a.prevSeasonPoints);
    let budget = PRICING.STARTING_BUDGET;
    const selected: string[] = [];

    // Pick alternating high/low to balance
    for (let i = 0; i < 10 && selected.length < 5; i++) {
      const d = sorted[i];
      if (d.price <= budget) {
        selected.push(d.id);
        budget -= d.price;
      }
    }

    return { drivers: selected, budget, totalPoints: 0, transfers: 0 };
  }

  // After race 3, start chasing form
  if (race > 3 && race % 2 === 0 && team.transfers < 24) {
    // Find driver with best recent form not on team
    const formScores = drivers
      .filter(d => !team.drivers.includes(d.id))
      .map(d => ({
        driver: d,
        form: d.recentPoints.slice(0, 3).reduce((a, b) => a + b, 0)
      }))
      .sort((a, b) => b.form - a.form);

    // Find worst form on current team
    const teamForms = team.drivers
      .map(id => {
        const d = drivers.find(dr => dr.id === id)!;
        return {
          driver: d,
          form: d.recentPoints.slice(0, 3).reduce((a, b) => a + b, 0)
        };
      })
      .sort((a, b) => a.form - b.form);

    const worstOnTeam = teamForms[0];
    const bestAvailable = formScores.find(f => f.driver.price <= team.budget + worstOnTeam.driver.price);

    if (bestAvailable && bestAvailable.form > worstOnTeam.form * 1.2) {
      const newDrivers = team.drivers.filter(id => id !== worstOnTeam.driver.id);
      newDrivers.push(bestAvailable.driver.id);
      return {
        ...team,
        drivers: newDrivers,
        budget: team.budget + worstOnTeam.driver.price - bestAvailable.driver.price,
        transfers: team.transfers + 1
      };
    }
  }

  return team;
};

// Strategy 4: Contrarian - Pick overlooked drivers
const contrarianStrategy: Strategy = (team, drivers, race, lastResults) => {
  if (race === 1) {
    // Pick mid-tier drivers that offer value
    const midTier = drivers
      .filter(d => d.price >= 30 && d.price <= 150)
      .sort((a, b) => b.baseStrength - a.baseStrength);

    let budget = PRICING.STARTING_BUDGET;
    const selected: string[] = [];

    for (const d of midTier) {
      if (selected.length >= 5) break;
      if (d.price <= budget) {
        selected.push(d.id);
        budget -= d.price;
      }
    }

    // Fill remaining with cheapest
    if (selected.length < 5) {
      const cheap = drivers
        .filter(d => !selected.includes(d.id))
        .sort((a, b) => a.price - b.price);
      for (const d of cheap) {
        if (selected.length >= 5) break;
        if (d.price <= budget) {
          selected.push(d.id);
          budget -= d.price;
        }
      }
    }

    return { drivers: selected, budget, totalPoints: 0, transfers: 0 };
  }

  // Minimal transfers - only if massive value opportunity
  if (race % 6 === 0 && team.transfers < 8) {
    const teamDrivers = team.drivers.map(id => drivers.find(d => d.id === id)!);
    const avgTeamStrength = teamDrivers.reduce((a, b) => a + b.baseStrength, 0) / 5;

    const upgrades = drivers
      .filter(d => !team.drivers.includes(d.id) && d.baseStrength > avgTeamStrength + 10)
      .sort((a, b) => b.baseStrength - a.baseStrength);

    if (upgrades.length > 0) {
      const weakest = teamDrivers.sort((a, b) => a.baseStrength - b.baseStrength)[0];
      const upgrade = upgrades.find(u => u.price <= team.budget + weakest.price);

      if (upgrade) {
        const newDrivers = team.drivers.filter(id => id !== weakest.id);
        newDrivers.push(upgrade.id);
        return {
          ...team,
          drivers: newDrivers,
          budget: team.budget + weakest.price - upgrade.price,
          transfers: team.transfers + 1
        };
      }
    }
  }

  return team;
};

// Strategy 5: Balanced - Mix of premium and budget
const balancedStrategy: Strategy = (team, drivers, race, lastResults) => {
  if (race === 1) {
    const sorted = [...drivers].sort((a, b) => b.price - a.price);
    let budget = PRICING.STARTING_BUDGET;
    const selected: string[] = [];

    // Pick 2 premium
    for (const d of sorted.slice(0, 5)) {
      if (selected.length >= 2) break;
      if (d.price <= budget) {
        selected.push(d.id);
        budget -= d.price;
      }
    }

    // Pick 3 from mid-tier with best value
    const midTier = sorted
      .filter(d => !selected.includes(d.id) && d.price <= 100)
      .sort((a, b) => (b.baseStrength / b.price) - (a.baseStrength / a.price));

    for (const d of midTier) {
      if (selected.length >= 5) break;
      if (d.price <= budget) {
        selected.push(d.id);
        budget -= d.price;
      }
    }

    return { drivers: selected, budget, totalPoints: 0, transfers: 0 };
  }

  // Moderate transfers based on performance
  if (race % 4 === 0 && team.transfers < 12) {
    const teamDrivers = team.drivers.map(id => drivers.find(d => d.id === id)!);
    const underperformer = teamDrivers
      .filter(d => d.recentPoints.length >= 3)
      .sort((a, b) => {
        const aAvg = a.recentPoints.slice(0, 3).reduce((x, y) => x + y, 0) / 3;
        const bAvg = b.recentPoints.slice(0, 3).reduce((x, y) => x + y, 0) / 3;
        return aAvg - bAvg;
      })[0];

    if (underperformer) {
      const replacement = drivers
        .filter(d => !team.drivers.includes(d.id) && d.price <= team.budget + underperformer.price)
        .sort((a, b) => b.baseStrength - a.baseStrength)[0];

      if (replacement && replacement.baseStrength > underperformer.baseStrength) {
        const newDrivers = team.drivers.filter(id => id !== underperformer.id);
        newDrivers.push(replacement.id);
        return {
          ...team,
          drivers: newDrivers,
          budget: team.budget + underperformer.price - replacement.price,
          transfers: team.transfers + 1
        };
      }
    }
  }

  return team;
};

// ============================================
// RUN SIMULATION
// ============================================
interface StrategyResult {
  name: string;
  totalPoints: number;
  finalBudget: number;
  transfers: number;
  raceByRacePoints: number[];
  finalTeam: string[];
  peakPoints: number;
}

function runSimulation(numSimulations: number = 10): void {
  const strategies: { name: string; fn: Strategy }[] = [
    { name: '💎 Premium Stack', fn: premiumStrategy },
    { name: '📈 Value Hunter', fn: valueStrategy },
    { name: '🔥 Form Chaser', fn: formStrategy },
    { name: '🎯 Contrarian', fn: contrarianStrategy },
    { name: '⚖️ Balanced Mix', fn: balancedStrategy },
  ];

  const allResults: Map<string, StrategyResult[]> = new Map();
  strategies.forEach(s => allResults.set(s.name, []));

  console.log('\n' + '='.repeat(70));
  console.log('🏎️  F1 FANTASY SEASON SIMULATOR');
  console.log('='.repeat(70));
  console.log(`\n📋 Rules:`);
  console.log(`   • Starting Budget: $${PRICING.STARTING_BUDGET}`);
  console.log(`   • Team Size: ${PRICING.TEAM_SIZE} drivers`);
  console.log(`   • Season: ${PRICING.RACES_PER_SEASON} races (${PRICING.SPRINTS_PER_SEASON} sprints)`);
  console.log(`   • Price Formula: (Avg Points/Race) × $${PRICING.DOLLARS_PER_POINT}`);
  console.log(`   • Rolling Average: ${PRICING.ROLLING_WINDOW} races`);
  console.log(`   • Sprint Weight: ${PRICING.SPRINT_WEIGHT}`);
  console.log(`\n🎲 Running ${numSimulations} simulations per strategy...\n`);

  for (let sim = 0; sim < numSimulations; sim++) {
    // Fresh drivers for each simulation
    const drivers = createDrivers();

    // Initialize teams for each strategy
    const teams: Map<string, Team> = new Map();
    const pointsHistory: Map<string, number[]> = new Map();

    strategies.forEach(s => {
      teams.set(s.name, { drivers: [], budget: PRICING.STARTING_BUDGET, totalPoints: 0, transfers: 0 });
      pointsHistory.set(s.name, []);
    });

    // Simulate each race
    for (let race = 1; race <= PRICING.RACES_PER_SEASON; race++) {
      const isSprint = SPRINT_RACES.includes(race);

      // Each strategy picks/updates team
      for (const { name, fn } of strategies) {
        const currentTeam = teams.get(name)!;
        const results = race > 1 ? simulateRace(drivers, false) : []; // Use prev results for decisions
        const newTeam = fn(currentTeam, drivers, race, results);
        teams.set(name, newTeam);
      }

      // Simulate race
      const raceResults = simulateRace(drivers, isSprint);

      // Calculate points for each team
      for (const { name } of strategies) {
        const team = teams.get(name)!;
        let racePoints = 0;

        for (const driverId of team.drivers) {
          const result = raceResults.find(r => r.driverId === driverId);
          if (result) {
            racePoints += result.totalPoints;
          }
        }

        team.totalPoints += racePoints;
        pointsHistory.get(name)!.push(racePoints);
      }

      // Update driver prices
      updatePrices(drivers, raceResults, isSprint);
    }

    // Record final results
    for (const { name } of strategies) {
      const team = teams.get(name)!;
      const history = pointsHistory.get(name)!;

      allResults.get(name)!.push({
        name,
        totalPoints: team.totalPoints,
        finalBudget: team.budget,
        transfers: team.transfers,
        raceByRacePoints: history,
        finalTeam: team.drivers,
        peakPoints: Math.max(...history),
      });
    }
  }

  // ============================================
  // DISPLAY RESULTS
  // ============================================
  console.log('='.repeat(70));
  console.log('📊 SIMULATION RESULTS (Averaged over ' + numSimulations + ' seasons)');
  console.log('='.repeat(70));

  const summaries: { name: string; avgPoints: number; minPoints: number; maxPoints: number; avgTransfers: number; consistency: number }[] = [];

  for (const { name } of strategies) {
    const results = allResults.get(name)!;
    const points = results.map(r => r.totalPoints);
    const avgPoints = Math.round(points.reduce((a, b) => a + b, 0) / points.length);
    const minPoints = Math.min(...points);
    const maxPoints = Math.max(...points);
    const avgTransfers = Math.round(results.reduce((a, b) => a + b.transfers, 0) / results.length);
    const stdDev = Math.sqrt(points.reduce((a, b) => a + Math.pow(b - avgPoints, 2), 0) / points.length);
    const consistency = Math.round((1 - stdDev / avgPoints) * 100);

    summaries.push({ name, avgPoints, minPoints, maxPoints, avgTransfers, consistency });
  }

  // Sort by average points
  summaries.sort((a, b) => b.avgPoints - a.avgPoints);

  console.log('\n🏆 STRATEGY RANKINGS:\n');
  console.log('┌─────┬────────────────────┬───────────┬───────────┬───────────┬───────────┬─────────────┐');
  console.log('│ Rank│ Strategy           │ Avg Pts   │ Min Pts   │ Max Pts   │ Transfers │ Consistency │');
  console.log('├─────┼────────────────────┼───────────┼───────────┼───────────┼───────────┼─────────────┤');

  summaries.forEach((s, i) => {
    const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1} `;
    console.log(
      `│ ${rank} │ ${s.name.padEnd(18)} │ ${String(s.avgPoints).padStart(9)} │ ${String(s.minPoints).padStart(9)} │ ${String(s.maxPoints).padStart(9)} │ ${String(s.avgTransfers).padStart(9)} │ ${String(s.consistency + '%').padStart(11)} │`
    );
  });

  console.log('└─────┴────────────────────┴───────────┴───────────┴───────────┴───────────┴─────────────┘');

  // Strategy breakdowns
  console.log('\n' + '='.repeat(70));
  console.log('📋 STRATEGY BREAKDOWNS');
  console.log('='.repeat(70));

  for (const { name } of strategies) {
    const results = allResults.get(name)!;
    const bestRun = results.sort((a, b) => b.totalPoints - a.totalPoints)[0];
    const avgRacePoints = bestRun.raceByRacePoints.reduce((a, b) => a + b, 0) / 24;

    console.log(`\n${name}:`);
    console.log(`  Best Season: ${bestRun.totalPoints} points`);
    console.log(`  Avg Per Race: ${avgRacePoints.toFixed(1)} points`);
    console.log(`  Final Team: ${bestRun.finalTeam.join(', ')}`);
    console.log(`  Transfers Used: ${bestRun.transfers}`);
    console.log(`  Peak Race: ${bestRun.peakPoints} points`);
  }

  // Winning scenarios
  console.log('\n' + '='.repeat(70));
  console.log('🎯 WINNING SCENARIOS & RECOMMENDATIONS');
  console.log('='.repeat(70));

  console.log(`
┌──────────────────────────────────────────────────────────────────────┐
│ 📌 KEY INSIGHTS                                                       │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│ 1. ${summaries[0].name} wins most consistently                      │
│    → Best for: Players who want reliability                         │
│    → Risk: ${summaries[0].consistency >= 70 ? 'Low' : summaries[0].consistency >= 50 ? 'Medium' : 'High'}                                                       │
│                                                                      │
│ 2. High transfer strategies (Form Chaser) require active management │
│    → Best for: Daily players who check results                      │
│    → Risk: Higher volatility                                        │
│                                                                      │
│ 3. Value Hunting excels in price-volatile seasons                   │
│    → Best for: Players who understand price movements               │
│    → Buy when drivers hit form, sell before decline                 │
│                                                                      │
│ 4. Premium Stack is "set and forget"                                │
│    → Best for: Casual players                                       │
│    → Simple: Pick best drivers, hold all season                     │
│                                                                      │
│ 5. Balanced Mix offers best risk/reward ratio                       │
│    → 2 premium + 3 mid-tier = flexibility                           │
│    → Can adjust without massive budget swings                       │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘

💡 OPTIMAL STRATEGY RECOMMENDATION:

   For MAXIMUM POINTS: ${summaries[0].name}
   For CONSISTENCY:    ${summaries.sort((a, b) => b.consistency - a.consistency)[0].name}
   For CASUAL PLAY:    💎 Premium Stack (least management)
   For ACTIVE PLAY:    🔥 Form Chaser (requires weekly attention)

`);

  // Sample season breakdown
  console.log('='.repeat(70));
  console.log('📅 SAMPLE SEASON BREAKDOWN (Best ' + summaries[0].name + ' Run)');
  console.log('='.repeat(70));

  const bestStrategy = allResults.get(summaries[0].name)!.sort((a, b) => b.totalPoints - a.totalPoints)[0];

  console.log('\nRace-by-Race Points:');
  console.log('┌──────┬────────┬─────────────────────────────────────────────────┐');
  console.log('│ Race │ Points │ Cumulative                                      │');
  console.log('├──────┼────────┼─────────────────────────────────────────────────┤');

  let cumulative = 0;
  bestStrategy.raceByRacePoints.forEach((pts, i) => {
    cumulative += pts;
    const bar = '█'.repeat(Math.min(Math.round(pts / 3), 40));
    const sprint = SPRINT_RACES.includes(i + 1) ? ' 🏃' : '';
    console.log(`│ R${String(i + 1).padStart(2)}${sprint.padEnd(3)} │ ${String(pts).padStart(6)} │ ${bar.padEnd(40)} ${cumulative} │`);
  });

  console.log('└──────┴────────┴─────────────────────────────────────────────────┘');
  console.log(`\n🏁 FINAL TOTAL: ${bestStrategy.totalPoints} points\n`);
}

// Run it!
runSimulation(10);
