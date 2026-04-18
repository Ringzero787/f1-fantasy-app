/**
 * Server-side OpenF1 API client for Cloud Functions.
 * Uses Node 22 built-in fetch with rate limiting.
 */

import { DRIVER_NUMBER_TO_ID, TEAM_NAME_TO_ID } from './config';

const BASE_URL = 'https://api.openf1.org/v1';
const REQUEST_DELAY_MS = 400;
let lastRequestTime = 0;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// OpenF1 API types
export interface OpenF1Session {
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

export interface OpenF1SessionResult {
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

export interface OpenF1Driver {
  driver_number: number;
  team_name: string;
  full_name: string;
  name_acronym: string;
  session_key: number;
}

export interface OpenF1Lap {
  driver_number: number;
  is_pit_out_lap: boolean;
  lap_duration: number | null;
  lap_number: number;
  session_key: number;
}

// App-format types matching calculatePoints.ts
export interface RaceResult {
  position: number;
  driverId: string;
  constructorId: string;
  gridPosition: number;
  status: 'finished' | 'dnf' | 'dsq';
  fastestLap: boolean;
  laps?: number;
}

export interface SprintResult {
  position: number;
  driverId: string;
  status: 'finished' | 'dnf' | 'dsq';
}

export interface QualifyingResult {
  position: number;
  driverId: string;
  constructorId: string;
}

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

  console.log('[OpenF1] Fetching:', url.toString());
  const response = await fetch(url.toString());

  if (response.status === 429) {
    console.log('[OpenF1] Rate limited, waiting 2s and retrying...');
    await delay(2000);
    lastRequestTime = Date.now();
    const retry = await fetch(url.toString());
    if (!retry.ok) throw new Error(`OpenF1 API error: ${retry.status}`);
    return retry.json();
  }

  if (!response.ok) {
    throw new Error(`OpenF1 API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function fetchSessions(year: number): Promise<OpenF1Session[]> {
  return fetchApi<OpenF1Session>('/sessions', { year });
}

export async function fetchSessionResults(sessionKey: number): Promise<OpenF1SessionResult[]> {
  return fetchApi<OpenF1SessionResult>('/session_result', { session_key: sessionKey });
}

export async function fetchDrivers(sessionKey: number): Promise<OpenF1Driver[]> {
  return fetchApi<OpenF1Driver>('/drivers', { session_key: sessionKey });
}

export async function fetchLaps(sessionKey: number): Promise<OpenF1Lap[]> {
  return fetchApi<OpenF1Lap>('/laps', { session_key: sessionKey });
}

/**
 * Find the driver with the fastest lap in a race session.
 * Excludes pit-out laps and null durations.
 */
export async function findFastestLap(sessionKey: number): Promise<string | null> {
  const laps = await fetchLaps(sessionKey);
  if (!laps || laps.length === 0) return null;

  let fastest: { driverNumber: number; duration: number } | null = null;

  for (const lap of laps) {
    if (lap.is_pit_out_lap) continue;
    if (lap.lap_duration == null || lap.lap_duration <= 0) continue;

    if (!fastest || lap.lap_duration < fastest.duration) {
      fastest = { driverNumber: lap.driver_number, duration: lap.lap_duration };
    }
  }

  if (!fastest) return null;
  return DRIVER_NUMBER_TO_ID[fastest.driverNumber] ?? null;
}

/**
 * Get grid positions from qualifying session results.
 * Returns driverId → grid position map.
 */
export async function getGridPositions(
  sessions: OpenF1Session[],
): Promise<Record<string, number>> {
  const qualiSession = sessions.find(s =>
    s.session_name === 'Qualifying',
  );

  const grid: Record<string, number> = {};

  if (!qualiSession) return grid;

  const results = await fetchSessionResults(qualiSession.session_key);
  for (const r of results) {
    if (r.position == null || r.driver_number == null) continue;
    const driverId = DRIVER_NUMBER_TO_ID[r.driver_number];
    if (driverId) {
      grid[driverId] = r.position;
    }
  }

  return grid;
}

/**
 * Convert OpenF1 race session data to our app's RaceResult[] format.
 */
export async function convertToRaceResults(
  sessionKey: number,
  gridPositions: Record<string, number>,
  fastestLapDriverId: string | null,
): Promise<{ results: RaceResult[]; totalLaps: number; warnings: string[] }> {
  const warnings: string[] = [];
  const [sessionResults, drivers] = await Promise.all([
    fetchSessionResults(sessionKey),
    fetchDrivers(sessionKey),
  ]);

  if (!sessionResults || sessionResults.length === 0) {
    return { results: [], totalLaps: 0, warnings: ['No session results returned from OpenF1'] };
  }

  // Build driver → team mapping
  const driverTeams: Record<number, string> = {};
  for (const d of drivers) {
    if (d.team_name) {
      const teamId = TEAM_NAME_TO_ID[d.team_name];
      if (teamId) {
        driverTeams[d.driver_number] = teamId;
      }
    }
  }

  let maxLaps = 0;
  const results: RaceResult[] = [];

  for (const r of sessionResults) {
    if (r.driver_number == null) continue;

    const driverId = DRIVER_NUMBER_TO_ID[r.driver_number];
    if (!driverId) {
      warnings.push(`Unknown driver number: ${r.driver_number}`);
      continue;
    }

    const constructorId = driverTeams[r.driver_number];
    if (!constructorId) {
      warnings.push(`No team mapping for driver ${r.driver_number} (${driverId})`);
      continue;
    }

    const isDnf = r.dnf === true || r.dns === true;
    const isDsq = r.dsq === true;
    const position = (isDnf || isDsq || !r.position) ? 0 : r.position;
    const status: RaceResult['status'] = isDsq ? 'dsq' : isDnf ? 'dnf' : 'finished';

    // Use qualifying grid position; for drivers without qualifying data
    // (e.g. crashed in Q1, stewards' permission), place them at the back
    const grid = gridPositions[driverId] ?? 22;

    if (r.number_of_laps > maxLaps) {
      maxLaps = r.number_of_laps;
    }

    results.push({
      position,
      driverId,
      constructorId,
      gridPosition: grid,
      status,
      fastestLap: driverId === fastestLapDriverId,
      laps: r.number_of_laps,
    });
  }

  // Sort by position (DNF/DSQ at the end)
  results.sort((a, b) => {
    if (a.status !== 'finished' && b.status === 'finished') return 1;
    if (a.status === 'finished' && b.status !== 'finished') return -1;
    return a.position - b.position;
  });

  if (Object.keys(gridPositions).length === 0) {
    warnings.push('No qualifying data found — grid positions defaulted to finishing positions');
  }

  if (!fastestLapDriverId) {
    warnings.push('No fastest lap data found');
  }

  return { results, totalLaps: maxLaps, warnings };
}

/**
 * Convert OpenF1 sprint session data to our app's SprintResult[] format.
 */
export async function convertToSprintResults(
  sessionKey: number,
): Promise<{ results: SprintResult[]; warnings: string[] }> {
  const warnings: string[] = [];
  const sessionResults = await fetchSessionResults(sessionKey);

  if (!sessionResults || sessionResults.length === 0) {
    return { results: [], warnings: ['No sprint results returned from OpenF1'] };
  }

  const results: SprintResult[] = [];

  for (const r of sessionResults) {
    if (r.driver_number == null) continue;

    const driverId = DRIVER_NUMBER_TO_ID[r.driver_number];
    if (!driverId) {
      warnings.push(`Unknown driver number in sprint: ${r.driver_number}`);
      continue;
    }

    const isDnf = r.dnf === true || r.dns === true;
    const isDsq = r.dsq === true;
    const position = (isDnf || isDsq || !r.position) ? 0 : r.position;
    const status: SprintResult['status'] = isDsq ? 'dsq' : isDnf ? 'dnf' : 'finished';

    results.push({ position, driverId, status });
  }

  results.sort((a, b) => {
    if (a.status !== 'finished' && b.status === 'finished') return 1;
    if (a.status === 'finished' && b.status !== 'finished') return -1;
    return a.position - b.position;
  });

  return { results, warnings };
}

/**
 * Convert OpenF1 qualifying session data to our app's QualifyingResult[] format.
 */
export async function convertToQualifyingResults(
  sessionKey: number,
): Promise<{ results: QualifyingResult[]; warnings: string[] }> {
  const warnings: string[] = [];
  const [sessionResults, drivers] = await Promise.all([
    fetchSessionResults(sessionKey),
    fetchDrivers(sessionKey),
  ]);

  if (!sessionResults || sessionResults.length === 0) {
    return { results: [], warnings: ['No qualifying results returned from OpenF1'] };
  }

  // Build driver → team mapping
  const driverTeams: Record<number, string> = {};
  for (const d of drivers) {
    if (d.team_name) {
      const teamId = TEAM_NAME_TO_ID[d.team_name];
      if (teamId) {
        driverTeams[d.driver_number] = teamId;
      }
    }
  }

  const results: QualifyingResult[] = [];

  for (const r of sessionResults) {
    if (r.driver_number == null || r.position == null || r.position <= 0) continue;

    const driverId = DRIVER_NUMBER_TO_ID[r.driver_number];
    if (!driverId) {
      warnings.push(`Unknown driver number in qualifying: ${r.driver_number}`);
      continue;
    }

    const constructorId = driverTeams[r.driver_number];
    if (!constructorId) {
      warnings.push(`No team mapping for qualifying driver ${r.driver_number} (${driverId})`);
      continue;
    }

    results.push({ position: r.position, driverId, constructorId });
  }

  results.sort((a, b) => a.position - b.position);
  return { results, warnings };
}

/**
 * Group sessions by meeting_key and derive round numbers from date ordering.
 * Only counts meetings that have a Race or Sprint session (excludes pre-season
 * testing, which OpenF1 lists as separate meetings with no Race session).
 * Returns meeting_key → round number map.
 */
export function deriveRoundNumbers(
  sessions: OpenF1Session[],
): Map<number, number> {
  // Find meetings that have an actual Race or Sprint session
  const raceMeetingKeys = new Set<number>();
  for (const s of sessions) {
    if (s.session_name === 'Race' || s.session_name === 'Sprint') {
      raceMeetingKeys.add(s.meeting_key);
    }
  }

  // Get earliest date per race meeting
  const meetingDates = new Map<number, string>();
  for (const s of sessions) {
    if (!raceMeetingKeys.has(s.meeting_key)) continue;
    if (!meetingDates.has(s.meeting_key) || s.date_start < meetingDates.get(s.meeting_key)!) {
      meetingDates.set(s.meeting_key, s.date_start);
    }
  }

  const sorted = [...meetingDates.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const roundMap = new Map<number, number>();
  sorted.forEach(([meetingKey], index) => {
    roundMap.set(meetingKey, index + 1);
  });

  return roundMap;
}
