/**
 * OpenF1 Import Test Script
 *
 * Fetches real race data from the OpenF1 API and writes formatted results
 * to a local file. Does NOT touch production/Firestore.
 *
 * Usage: npx ts-node scripts/test-openf1-import.ts [year]
 *   e.g. npx ts-node scripts/test-openf1-import.ts 2025
 */

import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'https://api.openf1.org/v1';
const REQUEST_DELAY_MS = 400;
let lastRequestTime = 0;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Same mappings as src/services/openf1.service.ts
// Confirmed 2026 numbers from formula1.com/en/drivers
const DRIVER_NUMBER_TO_ID: Record<number, string> = {
  1: 'norris',        // McLaren (2025 World Champion)
  3: 'verstappen',    // Red Bull
  5: 'bortoleto',     // Audi
  6: 'hadjar',        // Red Bull
  10: 'gasly',        // Alpine
  11: 'perez',        // Cadillac
  12: 'antonelli',    // Mercedes
  14: 'alonso',       // Aston Martin
  16: 'leclerc',      // Ferrari
  18: 'stroll',       // Aston Martin
  23: 'albon',        // Williams
  27: 'hulkenberg',   // Audi
  30: 'lawson',       // Racing Bulls
  31: 'ocon',         // Haas
  41: 'lindblad',     // Racing Bulls
  43: 'colapinto',    // Alpine
  44: 'hamilton',     // Ferrari
  55: 'sainz',        // Williams
  63: 'russell',      // Mercedes
  77: 'bottas',       // Cadillac
  81: 'piastri',      // McLaren
  87: 'bearman',      // Haas
};

const TEAM_NAME_TO_ID: Record<string, string> = {
  'Red Bull Racing': 'red_bull',
  'McLaren': 'mclaren',
  'Ferrari': 'ferrari',
  'Mercedes': 'mercedes',
  'Aston Martin': 'aston_martin',
  'Alpine': 'alpine',
  'Williams': 'williams',
  'RB': 'racing_bulls',
  'Visa Cash App RB': 'racing_bulls',
  'Racing Bulls': 'racing_bulls',
  'Kick Sauber': 'audi',
  'Sauber': 'audi',
  'Audi': 'audi',
  'Haas F1 Team': 'haas',
  'Haas': 'haas',
  'Cadillac': 'cadillac',
  'Cadillac F1': 'cadillac',
};

const RACE_POINTS: Record<number, number> = {
  1: 25, 2: 18, 3: 15, 4: 12, 5: 10,
  6: 8, 7: 6, 8: 4, 9: 2, 10: 1,
};

const SPRINT_POINTS: Record<number, number> = {
  1: 8, 2: 7, 3: 6, 4: 5, 5: 4,
  6: 3, 7: 2, 8: 1,
};

// ------------------------------------------------------------------

async function apiFetch<T>(endpoint: string, params?: Record<string, string | number>): Promise<T[]> {
  const now = Date.now();
  const timeSince = now - lastRequestTime;
  if (timeSince < REQUEST_DELAY_MS) {
    await delay(REQUEST_DELAY_MS - timeSince);
  }
  lastRequestTime = Date.now();

  const url = new URL(`${BASE_URL}${endpoint}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.append(key, String(value));
    }
  }

  console.log(`  -> GET ${url.toString()}`);
  const res = await fetch(url.toString());

  if (!res.ok) {
    if (res.status === 429) {
      console.log('  !! Rate limited — waiting 2s and retrying');
      await delay(2000);
      lastRequestTime = Date.now();
      const retry = await fetch(url.toString());
      if (!retry.ok) throw new Error(`OpenF1 ${retry.status} ${retry.statusText}`);
      return retry.json();
    }
    throw new Error(`OpenF1 ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// ------------------------------------------------------------------

interface Session {
  session_key: number;
  session_name: string;
  circuit_short_name: string;
  country_name: string;
  date_start: string;
  date_end: string;
  meeting_key: number;
  year: number;
}

interface SessionResult {
  driver_number: number;
  position: number | null;
  dnf: boolean;
  dns: boolean;
  dsq: boolean;
  number_of_laps: number;
  duration: number | null;
  gap_to_leader: number | null;
}

interface Driver {
  driver_number: number;
  full_name: string;
  name_acronym: string;
  team_name: string;
}

// ------------------------------------------------------------------

async function main() {
  const year = parseInt(process.argv[2] || '2025', 10);
  console.log(`\n=== OpenF1 Import Test — ${year} Season ===\n`);

  // 1. Fetch all sessions for the year
  console.log('Step 1: Fetching all sessions...');
  const allSessions = await apiFetch<Session>('/sessions', { year });
  console.log(`  Found ${allSessions.length} sessions total\n`);

  // 2. Filter to races and sprints
  const raceSessions = allSessions.filter(s => s.session_name === 'Race');
  const sprintSessions = allSessions.filter(s => s.session_name === 'Sprint');
  const qualySessions = allSessions.filter(s => s.session_name === 'Qualifying');

  console.log(`  Races: ${raceSessions.length}`);
  console.log(`  Sprints: ${sprintSessions.length}`);
  console.log(`  Qualifying: ${qualySessions.length}\n`);

  // 3. Find completed races
  const now = new Date();
  const completedRaces = raceSessions.filter(r => r.date_end && new Date(r.date_end) < now);
  console.log(`  Completed races: ${completedRaces.length}\n`);

  if (completedRaces.length === 0) {
    console.log('No completed races found. Exiting.');
    return;
  }

  // 4. Process the latest completed race (and any matching sprint)
  const latestRace = completedRaces[completedRaces.length - 1];
  const matchingSprint = sprintSessions.find(s => s.meeting_key === latestRace.meeting_key);

  console.log(`Step 2: Processing latest race...`);
  console.log(`  Race: ${latestRace.country_name} — ${latestRace.circuit_short_name}`);
  console.log(`  Date: ${latestRace.date_start}`);
  console.log(`  Session Key: ${latestRace.session_key}`);
  console.log(`  Meeting Key: ${latestRace.meeting_key}`);
  if (matchingSprint) {
    console.log(`  Sprint session found: key ${matchingSprint.session_key}`);
  }

  // 5. Fetch results + drivers
  console.log('\nStep 3: Fetching race results...');
  const [raceResults, raceDrivers] = await Promise.all([
    apiFetch<SessionResult>('/session_result', { session_key: latestRace.session_key }),
    apiFetch<Driver>('/drivers', { session_key: latestRace.session_key }),
  ]);
  console.log(`  Results: ${raceResults.length}, Drivers: ${raceDrivers.length}`);

  let sprintResults: SessionResult[] = [];
  let sprintDrivers: Driver[] = [];
  if (matchingSprint) {
    console.log('\nStep 4: Fetching sprint results...');
    [sprintResults, sprintDrivers] = await Promise.all([
      apiFetch<SessionResult>('/session_result', { session_key: matchingSprint.session_key }),
      apiFetch<Driver>('/drivers', { session_key: matchingSprint.session_key }),
    ]);
    console.log(`  Results: ${sprintResults.length}, Drivers: ${sprintDrivers.length}`);
  }

  // Also fetch all completed races summary for the full-season view
  console.log('\nStep 5: Building season summary...');
  const seasonSummary: Array<{ round: number; country: string; circuit: string; date: string; sessionKey: number }> = [];
  for (let i = 0; i < completedRaces.length; i++) {
    seasonSummary.push({
      round: i + 1,
      country: completedRaces[i].country_name,
      circuit: completedRaces[i].circuit_short_name,
      date: completedRaces[i].date_start.split('T')[0],
      sessionKey: completedRaces[i].session_key,
    });
  }

  // ------------------------------------------------------------------
  // Build the formatted output
  // ------------------------------------------------------------------

  const lines: string[] = [];
  const divider = '='.repeat(80);
  const subDivider = '-'.repeat(80);

  lines.push(divider);
  lines.push(`  OPENF1 IMPORT TEST — ${year} SEASON DATA`);
  lines.push(`  Generated: ${new Date().toISOString()}`);
  lines.push(`  Source: ${BASE_URL}`);
  lines.push(`  NOTE: This is a LOCAL TEST — no production data was modified`);
  lines.push(divider);
  lines.push('');

  // --- Season overview ---
  lines.push('SEASON OVERVIEW');
  lines.push(subDivider);
  lines.push(`Total sessions found: ${allSessions.length}`);
  lines.push(`Races: ${raceSessions.length} (${completedRaces.length} completed)`);
  lines.push(`Sprints: ${sprintSessions.length}`);
  lines.push('');
  lines.push('Completed Races:');
  for (const race of seasonSummary) {
    lines.push(`  R${String(race.round).padStart(2, '0')}  ${race.date}  ${race.country.padEnd(20)} ${race.circuit}`);
  }
  lines.push('');

  // --- Helper to format a session's results ---
  function formatResults(
    results: SessionResult[],
    drivers: Driver[],
    isSprint: boolean,
    sessionInfo: Session,
  ) {
    const pointsTable = isSprint ? SPRINT_POINTS : RACE_POINTS;
    const driverMap: Record<number, Driver> = {};
    for (const d of drivers) {
      driverMap[d.driver_number] = d;
    }

    lines.push(`${isSprint ? 'SPRINT' : 'RACE'} RESULTS — ${sessionInfo.country_name} (${sessionInfo.circuit_short_name})`);
    lines.push(`Session Key: ${sessionInfo.session_key} | Date: ${sessionInfo.date_start}`);
    lines.push(subDivider);

    // Sort by position (nulls last)
    const sorted = [...results].sort((a, b) => {
      if (a.position == null && b.position == null) return 0;
      if (a.position == null) return 1;
      if (b.position == null) return -1;
      return a.position - b.position;
    });

    // Header
    lines.push(
      '  ' +
      'Pos'.padEnd(5) +
      '#'.padEnd(5) +
      'Driver'.padEnd(22) +
      'App ID'.padEnd(18) +
      'Team'.padEnd(22) +
      'Constructor ID'.padEnd(18) +
      'Pts'.padEnd(6) +
      'Laps'.padEnd(6) +
      'Status'
    );
    lines.push('  ' + '-'.repeat(102));

    let unmappedDrivers: number[] = [];
    let unmappedTeams: string[] = [];
    const constructorPts: Record<string, number> = {};

    for (const r of sorted) {
      const driver = driverMap[r.driver_number];
      const driverName = driver?.full_name ?? `Driver #${r.driver_number}`;
      const acronym = driver?.name_acronym ?? '???';
      const teamName = driver?.team_name ?? 'Unknown';
      const driverId = DRIVER_NUMBER_TO_ID[r.driver_number] ?? '** UNMAPPED **';
      const constructorId = driver?.team_name ? (TEAM_NAME_TO_ID[driver.team_name] ?? '** UNMAPPED **') : '???';

      if (driverId === '** UNMAPPED **') unmappedDrivers.push(r.driver_number);
      if (constructorId === '** UNMAPPED **' && !unmappedTeams.includes(teamName)) unmappedTeams.push(teamName);

      const isDnf = r.dnf || r.dns || r.dsq;
      const status = r.dsq ? 'DSQ' : r.dns ? 'DNS' : r.dnf ? 'DNF' : 'FIN';
      const posStr = isDnf ? status : String(r.position ?? '-');
      const pts = isDnf ? 0 : (pointsTable[r.position ?? 0] ?? 0);

      // Accumulate constructor points
      if (constructorId && constructorId !== '** UNMAPPED **' && constructorId !== '???') {
        constructorPts[constructorId] = (constructorPts[constructorId] || 0) + pts;
      }

      lines.push(
        '  ' +
        posStr.padEnd(5) +
        String(r.driver_number).padEnd(5) +
        `${driverName} (${acronym})`.padEnd(22).slice(0, 22) +
        driverId.padEnd(18) +
        teamName.padEnd(22).slice(0, 22) +
        constructorId.padEnd(18) +
        String(pts).padEnd(6) +
        String(r.number_of_laps).padEnd(6) +
        status
      );
    }

    lines.push('');

    // Constructor aggregation
    lines.push(`  CONSTRUCTOR POINTS (${isSprint ? 'Sprint' : 'Race'}):`);
    const sortedConstructors = Object.entries(constructorPts).sort((a, b) => b[1] - a[1]);
    for (const [cId, pts] of sortedConstructors) {
      lines.push(`    ${cId.padEnd(18)} ${pts} pts`);
    }
    lines.push('');

    // Mapping warnings
    if (unmappedDrivers.length > 0) {
      lines.push(`  ⚠ UNMAPPED DRIVER NUMBERS: ${unmappedDrivers.join(', ')}`);
      lines.push('    These drivers have no entry in DRIVER_NUMBER_TO_ID mapping.');
    }
    if (unmappedTeams.length > 0) {
      lines.push(`  ⚠ UNMAPPED TEAM NAMES: ${unmappedTeams.join(', ')}`);
      lines.push('    These teams have no entry in TEAM_NAME_TO_ID mapping.');
    }
    if (unmappedDrivers.length > 0 || unmappedTeams.length > 0) {
      lines.push('    Update src/services/openf1.service.ts to fix these mappings.');
      lines.push('');
    }

    // JSON format (what the app would import)
    lines.push(`  APP IMPORT FORMAT (${isSprint ? 'Sprint' : 'Race'}):`);
    const driverResults = sorted
      .filter(r => DRIVER_NUMBER_TO_ID[r.driver_number])
      .map(r => {
        const isDnf = r.dnf || r.dns || r.dsq;
        const pts = isDnf ? 0 : (pointsTable[r.position ?? 0] ?? 0);
        return {
          driverId: DRIVER_NUMBER_TO_ID[r.driver_number],
          driverNumber: r.driver_number,
          position: isDnf ? null : r.position,
          points: pts,
          dnf: isDnf,
        };
      });
    const constructorResults = sortedConstructors.map(([constructorId, points]) => ({ constructorId, points }));

    lines.push('  driverResults:');
    for (const dr of driverResults) {
      lines.push(`    { driverId: "${dr.driverId}", #${dr.driverNumber}, pos: ${dr.position ?? 'DNF'}, pts: ${dr.points}, dnf: ${dr.dnf} }`);
    }
    lines.push('  constructorResults:');
    for (const cr of constructorResults) {
      lines.push(`    { constructorId: "${cr.constructorId}", pts: ${cr.points} }`);
    }
    lines.push('');
  }

  // --- Format race results ---
  lines.push(divider);
  formatResults(raceResults, raceDrivers, false, latestRace);

  // --- Format sprint results (if any) ---
  if (matchingSprint && sprintResults.length > 0) {
    lines.push(divider);
    formatResults(sprintResults, sprintDrivers.length > 0 ? sprintDrivers : raceDrivers, true, matchingSprint);
  }

  // --- Raw JSON dump for reference ---
  lines.push(divider);
  lines.push('RAW API RESPONSES (for debugging)');
  lines.push(subDivider);
  lines.push('');
  lines.push('--- Race Session Info ---');
  lines.push(JSON.stringify(latestRace, null, 2));
  lines.push('');
  lines.push('--- Race Results (raw) ---');
  lines.push(JSON.stringify(raceResults, null, 2));
  lines.push('');
  lines.push('--- Race Drivers (raw) ---');
  lines.push(JSON.stringify(raceDrivers, null, 2));

  if (matchingSprint && sprintResults.length > 0) {
    lines.push('');
    lines.push('--- Sprint Session Info ---');
    lines.push(JSON.stringify(matchingSprint, null, 2));
    lines.push('');
    lines.push('--- Sprint Results (raw) ---');
    lines.push(JSON.stringify(sprintResults, null, 2));
  }

  lines.push('');
  lines.push(divider);
  lines.push('END OF REPORT');
  lines.push(divider);

  // ------------------------------------------------------------------
  // Write to file
  // ------------------------------------------------------------------
  const outputPath = path.join(__dirname, '..', `test-openf1-results-${year}.txt`);
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
  console.log(`\n✓ Results written to: ${outputPath}`);
  console.log(`  File size: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
