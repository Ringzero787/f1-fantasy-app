/**
 * Export results.json to CSV files for Excel
 * Run: npx tsx scripts/simulation/exportCsv.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const results = JSON.parse(fs.readFileSync(path.join(__dirname, 'results.json'), 'utf-8'));
const outDir = __dirname;

function writeCsv(filename: string, header: string[], rows: string[][]): void {
  const lines = [header.join(','), ...rows.map(r => r.join(','))];
  fs.writeFileSync(path.join(outDir, filename), lines.join('\n'));
  console.log(`  Written: ${filename} (${rows.length} rows)`);
}

function esc(s: string): string {
  if (s.includes(',') || s.includes('"')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// ============================================
// 1. Standings
// ============================================
const standingsHeader = [
  'Rank', 'Name', 'Strategy Tags', 'Total Points', 'Locked Points',
  'Budget', 'Team Value', 'Transfers', 'Final Drivers', 'Final Constructor',
  ...Array.from({ length: 24 }, (_, i) => `R${i + 1} Pts`),
];
const standingsRows = results.standings.map((s: any) => [
  s.rank, esc(s.name), esc(s.strategyTags.join('; ')), s.totalPoints, s.lockedPoints,
  s.budget, s.teamValue, s.transfers,
  esc(s.finalDrivers.join('; ')), esc(s.finalConstructor || 'none'),
  ...s.racePoints.map(String),
]);
writeCsv('standings.csv', standingsHeader, standingsRows);

// ============================================
// 2. Driver Season Stats
// ============================================
const driverHeader = ['Driver', 'Total Points', 'Avg Finish', 'Wins', 'Podiums', 'DNFs'];
const driverRows = Object.entries(results.driverSeasonStats)
  .map(([id, s]: [string, any]) => [esc(id), s.totalPts, s.avgFinish, s.wins, s.podiums, s.dnfs])
  .sort((a: any, b: any) => b[1] - a[1])
  .map(r => r.map(String));
writeCsv('driver_stats.csv', driverHeader, driverRows);

// ============================================
// 3. Driver Price History (drivers as columns, races as rows)
// ============================================
const driverIds = Object.keys(results.driverPriceHistory);
const priceHeader = ['Round', ...driverIds];
const priceRounds = results.driverPriceHistory[driverIds[0]].length;
const priceRows: string[][] = [];
for (let i = 0; i < priceRounds; i++) {
  priceRows.push([
    i === 0 ? 'Initial' : `R${i}`,
    ...driverIds.map(id => String(results.driverPriceHistory[id][i])),
  ]);
}
writeCsv('driver_prices.csv', priceHeader, priceRows);

// ============================================
// 4. Constructor Price History
// ============================================
const conIds = Object.keys(results.constructorPriceHistory);
const conPriceHeader = ['Round', ...conIds];
const conPriceRounds = results.constructorPriceHistory[conIds[0]].length;
const conPriceRows: string[][] = [];
for (let i = 0; i < conPriceRounds; i++) {
  conPriceRows.push([
    i === 0 ? 'Initial' : `R${i}`,
    ...conIds.map(id => String(results.constructorPriceHistory[id][i])),
  ]);
}
writeCsv('constructor_prices.csv', conPriceHeader, conPriceRows);

// ============================================
// 5. Race Results
// ============================================
const raceHeader = ['Round', 'Race Name', 'Has Sprint', 'Fastest Lap', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10'];
const raceRows = results.raceResults.map((r: any) => {
  const top10 = r.top10.map((t: any) => t.driverId);
  while (top10.length < 10) top10.push('');
  return [r.round, esc(r.name), r.hasSprint, esc(r.fastestLap), ...top10];
}).map((r: any) => r.map(String));
writeCsv('race_results.csv', raceHeader, raceRows);

// ============================================
// 6. Trade Log
// ============================================
const tradeHeader = ['Round', 'User', 'Action', 'Driver/Constructor', 'Price', 'Fee', 'Reason'];
const tradeRows = results.tradeLog.map((t: any) => [
  t.round, esc(t.userId), esc(t.action), esc(t.driverId), t.price, t.fee, esc(t.reason),
].map(String));
writeCsv('trade_log.csv', tradeHeader, tradeRows);

console.log('\n  All CSV files exported to scripts/simulation/');
