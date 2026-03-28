/**
 * Test script: exercises the OpenF1 ingestion pipeline against 2025 data.
 * Does NOT touch Firestore or production. Run with: npx tsx scripts/test-openf1-ingestion.ts
 */

const BASE_URL = 'https://api.openf1.org/v1';
const REQUEST_DELAY_MS = 400;
let lastRequestTime = 0;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Copy of mappings from ingestion/config.ts
const DRIVER_NUMBER_TO_ID: Record<number, string> = {
  1: 'verstappen',   // 2025: Verstappen was #1
  4: 'norris',       // 2025: Norris was #4
  3: 'ricciardo',
  10: 'gasly',
  11: 'perez',
  12: 'antonelli',
  14: 'alonso',
  16: 'leclerc',
  18: 'stroll',
  22: 'tsunoda',
  23: 'albon',
  27: 'hulkenberg',
  30: 'lawson',
  31: 'ocon',
  44: 'hamilton',
  55: 'sainz',
  63: 'russell',
  77: 'bottas',
  81: 'piastri',
  87: 'bearman',
  2: 'colapinto',
  5: 'bortoleto',
  6: 'hadjar',
  20: 'magnussen',
  24: 'zhou',
  43: 'doohan',
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
  'Kick Sauber': 'sauber',
  'Sauber': 'sauber',
  'Haas F1 Team': 'haas',
  'Haas': 'haas',
};

async function fetchApi<T>(endpoint: string, params?: Record<string, string | number>): Promise<T[]> {
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

  console.log(`  [fetch] ${url.toString()}`);
  const response = await fetch(url.toString());

  if (response.status === 429) {
    console.log('  [fetch] Rate limited, waiting 2s...');
    await delay(2000);
    lastRequestTime = Date.now();
    const retry = await fetch(url.toString());
    if (!retry.ok) throw new Error(`API error: ${retry.status}`);
    return retry.json();
  }

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

interface Session {
  circuit_short_name: string;
  country_name: string;
  date_start: string;
  date_end: string;
  meeting_key: number;
  session_key: number;
  session_name: string;
  session_type: string;
  year: number;
}

interface SessionResult {
  dnf: boolean;
  dns: boolean;
  dsq: boolean;
  driver_number: number;
  duration: number | null;
  gap_to_leader: number | null;
  number_of_laps: number;
  meeting_key: number;
  position: number | null;
  session_key: number;
}

interface Driver {
  driver_number: number;
  team_name: string;
  full_name: string;
  name_acronym: string;
}

interface Lap {
  driver_number: number;
  is_pit_out_lap: boolean;
  lap_duration: number | null;
  lap_number: number;
}

function deriveRoundNumbers(sessions: Session[]): Map<number, { round: number; country: string }> {
  // Only count meetings that have a Race or Sprint session (skip pre-season testing)
  const raceMeetingKeys = new Set<number>();
  for (const s of sessions) {
    if (s.session_name === 'Race' || s.session_name === 'Sprint') {
      raceMeetingKeys.add(s.meeting_key);
    }
  }

  const meetingDates = new Map<number, { date: string; country: string }>();
  for (const s of sessions) {
    if (!raceMeetingKeys.has(s.meeting_key)) continue;
    const existing = meetingDates.get(s.meeting_key);
    if (!existing || s.date_start < existing.date) {
      meetingDates.set(s.meeting_key, { date: s.date_start, country: s.country_name });
    }
  }

  const sorted = [...meetingDates.entries()].sort((a, b) => a[1].date.localeCompare(b[1].date));
  const roundMap = new Map<number, { round: number; country: string }>();
  sorted.forEach(([meetingKey, info], index) => {
    roundMap.set(meetingKey, { round: index + 1, country: info.country });
  });

  return roundMap;
}

async function main() {
  const TEST_YEAR = 2025;
  const TEST_ROUND = 1; // Australia 2025 — should now be R1 with testing filtered out

  console.log(`\n=== OpenF1 Ingestion Test (${TEST_YEAR} Round ${TEST_ROUND}) ===\n`);

  // Step 1: Fetch all sessions
  console.log('1. Fetching sessions...');
  const allSessions = await fetchApi<Session>('/sessions', { year: TEST_YEAR });
  const yearSessions = allSessions.filter(s => s.year === TEST_YEAR);
  console.log(`   Found ${yearSessions.length} sessions for ${TEST_YEAR}`);

  // Step 2: Derive round numbers
  console.log('\n2. Deriving round numbers...');
  const roundMap = deriveRoundNumbers(yearSessions);
  console.log('   Round map:');
  for (const [meetingKey, info] of roundMap) {
    console.log(`     R${info.round}: ${info.country} (meeting ${meetingKey})`);
  }

  // Step 3: Find meeting for target round
  let targetMeetingKey: number | null = null;
  let targetCountry = '';
  for (const [meetingKey, info] of roundMap) {
    if (info.round === TEST_ROUND) {
      targetMeetingKey = meetingKey;
      targetCountry = info.country;
      break;
    }
  }

  if (!targetMeetingKey) {
    console.error(`No meeting found for round ${TEST_ROUND}`);
    return;
  }

  console.log(`\n3. Target: R${TEST_ROUND} ${targetCountry} (meeting ${targetMeetingKey})`);

  // Step 4: Get meeting sessions
  const meetingSessions = yearSessions.filter(s => s.meeting_key === targetMeetingKey);
  console.log('   Sessions:');
  for (const s of meetingSessions) {
    console.log(`     ${s.session_name} (key: ${s.session_key}, ${s.date_start})`);
  }

  const raceSession = meetingSessions.find(s => s.session_name === 'Race');
  const qualiSession = meetingSessions.find(s => s.session_name === 'Qualifying');
  const sprintSession = meetingSessions.find(s => s.session_name === 'Sprint');

  if (!raceSession) {
    console.error('No Race session found!');
    return;
  }

  // Step 5: Fetch qualifying (grid positions)
  console.log('\n4. Fetching qualifying results (grid)...');
  const gridPositions: Record<string, number> = {};
  if (qualiSession) {
    const qualiResults = await fetchApi<SessionResult>('/session_result', { session_key: qualiSession.session_key });
    for (const r of qualiResults) {
      if (r.position == null) continue;
      const driverId = DRIVER_NUMBER_TO_ID[r.driver_number];
      if (driverId) {
        gridPositions[driverId] = r.position;
      }
    }
    console.log(`   Grid positions for ${Object.keys(gridPositions).length} drivers`);
  } else {
    console.log('   No qualifying session found');
  }

  // Step 6: Fetch fastest lap
  console.log('\n5. Finding fastest lap...');
  const laps = await fetchApi<Lap>('/laps', { session_key: raceSession.session_key });
  let fastest: { driverNumber: number; duration: number; lapNumber: number } | null = null;
  for (const lap of laps) {
    if (lap.is_pit_out_lap) continue;
    if (lap.lap_duration == null || lap.lap_duration <= 0) continue;
    if (!fastest || lap.lap_duration < fastest.duration) {
      fastest = { driverNumber: lap.driver_number, duration: lap.lap_duration, lapNumber: lap.lap_number };
    }
  }
  const fastestLapDriverId = fastest ? (DRIVER_NUMBER_TO_ID[fastest.driverNumber] ?? null) : null;
  if (fastest) {
    console.log(`   Fastest lap: #${fastest.driverNumber} (${fastestLapDriverId}) — ${fastest.duration.toFixed(3)}s on lap ${fastest.lapNumber}`);
  } else {
    console.log('   No fastest lap data');
  }

  // Step 7: Fetch race results + drivers
  console.log('\n6. Fetching race results...');
  const [raceResults, drivers] = await Promise.all([
    fetchApi<SessionResult>('/session_result', { session_key: raceSession.session_key }),
    fetchApi<Driver>('/drivers', { session_key: raceSession.session_key }),
  ]);

  // Build driver → team map
  const driverTeams: Record<number, string> = {};
  for (const d of drivers) {
    if (d.team_name) {
      const teamId = TEAM_NAME_TO_ID[d.team_name];
      if (teamId) driverTeams[d.driver_number] = teamId;
    }
  }

  // Convert to app format
  const warnings: string[] = [];
  const appResults: Array<{
    position: number;
    driverId: string;
    constructorId: string;
    gridPosition: number;
    status: string;
    fastestLap: boolean;
    laps: number;
  }> = [];

  let maxLaps = 0;
  for (const r of raceResults) {
    if (r.driver_number == null) continue;

    const driverId = DRIVER_NUMBER_TO_ID[r.driver_number];
    if (!driverId) {
      warnings.push(`Unknown driver #${r.driver_number}`);
      continue;
    }

    const constructorId = driverTeams[r.driver_number];
    if (!constructorId) {
      warnings.push(`No team for #${r.driver_number} (${driverId})`);
      continue;
    }

    const isDnf = r.dnf === true || r.dns === true;
    const isDsq = r.dsq === true;
    const position = (isDnf || isDsq || !r.position) ? 0 : r.position;
    const status = isDsq ? 'dsq' : isDnf ? 'dnf' : 'finished';
    const grid = gridPositions[driverId] ?? position;

    if (r.number_of_laps > maxLaps) maxLaps = r.number_of_laps;

    appResults.push({
      position,
      driverId,
      constructorId,
      gridPosition: grid,
      status,
      fastestLap: driverId === fastestLapDriverId,
      laps: r.number_of_laps,
    });
  }

  // Sort
  appResults.sort((a, b) => {
    if (a.status !== 'finished' && b.status === 'finished') return 1;
    if (a.status === 'finished' && b.status !== 'finished') return -1;
    return a.position - b.position;
  });

  // Step 8: Print results
  console.log(`\n=== CONVERTED RACE RESULTS (${appResults.length} drivers, ${maxLaps} laps) ===\n`);
  console.log('Pos  Driver          Team            Grid  Status    FL   Laps');
  console.log('---  --------------  --------------  ----  --------  ---  ----');
  for (const r of appResults) {
    const pos = r.position === 0 ? '—' : String(r.position).padStart(2);
    const driver = r.driverId.padEnd(14);
    const team = r.constructorId.padEnd(14);
    const grid = String(r.gridPosition).padStart(4);
    const status = r.status.padEnd(8);
    const fl = r.fastestLap ? ' *' : '  ';
    const laps = String(r.laps).padStart(4);
    console.log(`${pos}   ${driver}  ${team}  ${grid}  ${status}  ${fl}  ${laps}`);
  }

  // Sprint check
  if (sprintSession) {
    console.log('\n--- Sprint session found, fetching results ---');
    const sprintResults = await fetchApi<SessionResult>('/session_result', { session_key: sprintSession.session_key });
    const sprintApp = sprintResults
      .filter(r => r.driver_number != null && DRIVER_NUMBER_TO_ID[r.driver_number])
      .map(r => {
        const isDnf = r.dnf === true || r.dns === true;
        const isDsq = r.dsq === true;
        return {
          position: (isDnf || isDsq || !r.position) ? 0 : r.position,
          driverId: DRIVER_NUMBER_TO_ID[r.driver_number]!,
          status: isDsq ? 'dsq' : isDnf ? 'dnf' : 'finished',
        };
      })
      .sort((a, b) => {
        if (a.status !== 'finished' && b.status === 'finished') return 1;
        if (a.status === 'finished' && b.status !== 'finished') return -1;
        return a.position - b.position;
      });

    console.log(`\nSprint results (${sprintApp.length} drivers):`);
    for (const r of sprintApp) {
      console.log(`  P${r.position === 0 ? '—' : r.position} ${r.driverId} (${r.status})`);
    }
  } else {
    console.log('\n   No sprint session for this round.');
  }

  // Warnings
  if (warnings.length > 0) {
    console.log(`\n--- Warnings (${warnings.length}) ---`);
    for (const w of warnings) console.log(`  ! ${w}`);
  }

  // Simulate pendingResults doc
  console.log('\n=== PENDING RESULT DOCUMENT (preview) ===');
  const pendingDoc = {
    raceId: `test_${targetCountry.toLowerCase()}_${TEST_YEAR}`,
    round: TEST_ROUND,
    raceName: `${targetCountry} Grand Prix`,
    status: 'pending',
    warnings,
    results: {
      raceResults: appResults,
      ...(fastestLapDriverId ? { fastestLap: fastestLapDriverId } : {}),
    },
    totalLaps: maxLaps,
    rawData: {
      raceSessionKey: raceSession.session_key,
      qualifyingSessionKey: qualiSession?.session_key ?? null,
    },
  };
  console.log(JSON.stringify(pendingDoc, null, 2).substring(0, 2000));
  console.log('\n=== TEST COMPLETE ===\n');
}

main().catch(console.error);
