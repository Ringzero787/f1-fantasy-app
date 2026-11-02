/**
 * Server-side OpenF1 API client for Cloud Functions.
 * Uses Node 22 built-in fetch with rate limiting.
 */

import { DRIVER_NUMBER_TO_ID, TEAM_NAME_TO_ID } from './config';
import { openf1Fetch } from './openf1Auth';

const BASE_URL = 'https://api.openf1.org/v1';
const REQUEST_DELAY_MS = 400;
let lastRequestTime = 0;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
/** Every feed request is abandoned after this long; a whole-session laps table is the largest answer and lands well inside it. */
const REQUEST_TIMEOUT_MS = 20_000;
/** The driver id for a provider-typed car number, or undefined: only whole numbers that are the table's own keys count. */
const driverIdOf = (n: unknown): string | undefined =>
  Number.isInteger(n) && Object.prototype.hasOwnProperty.call(DRIVER_NUMBER_TO_ID, n as number) ? DRIVER_NUMBER_TO_ID[n as number] : undefined;

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
  /** null for a stand-in the provider has not attached to a team in this session (Mexico 2026 Race: Hirakawa) */
  team_name: string | null;
  full_name: string;
  name_acronym: string;
  session_key: number;
  meeting_key?: number;
}

export interface OpenF1Lap {
  driver_number: number;
  is_pit_out_lap: boolean;
  lap_duration: number | null;
  lap_number: number;
  session_key: number;
}

// App-format types matching scoringCore.ts
export interface RaceResult {
  position: number;
  driverId: string;
  constructorId: string;
  gridPosition: number;
  // 'dns' = did not start; 'nc' = not classified (ran, no finishing position).
  // Both score 0 and take no DNF price penalty.
  status: 'finished' | 'dnf' | 'dsq' | 'dns' | 'nc';
  fastestLap: boolean;
  laps?: number;
}

export interface SprintResult {
  position: number;
  driverId: string;
  status: 'finished' | 'dnf' | 'dsq' | 'dns' | 'nc';
}

export interface OpenF1StartingGridRow {
  position: number | null;
  driver_number: number;
  session_key: number;
  meeting_key: number;
}

export interface QualifyingResult {
  position: number;
  driverId: string;
  constructorId: string;
}

/**
 * Prefix shared by every "driver number is not in DRIVER_NUMBER_TO_ID" warning
 * the converters below emit.
 *
 * An unmapped number is silently destructive: the converter drops the row, so
 * the field shrinks by a car and any constructor aggregate built from it is
 * short one driver — with no error, no NaN and no failed write. Zandvoort 2026
 * lost Tsunoda (#22) this way and Racing Bulls scored 23 instead of 47.
 * Callers use `isUnmappedDriverWarning` to refuse to publish such a result set
 * rather than auto-approving a quietly incomplete grid.
 */
export const UNMAPPED_DRIVER_WARNING_PREFIX = 'Unknown driver number';

/**
 * The warning for a mapped driver whose car has no team even after the meeting fill (F-134). It
 * carries the unmapped prefix on purpose: the converter drops the car either way, so the grid is
 * short either way, and auto-approval must refuse it exactly as it refuses an unknown number.
 */
export function noTeamWarning(driverNumber: number, driverId: string, where: 'race' | 'qualifying'): string {
  return `${UNMAPPED_DRIVER_WARNING_PREFIX} team: no team for ${where} driver ${driverNumber} (${driverId}) in this session or the meeting`;
}

export function isUnmappedDriverWarning(warning: string): boolean {
  return warning.startsWith(UNMAPPED_DRIVER_WARNING_PREFIX);
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
  // F-128: the paid feed's bearer token when credentials are bound (renewed once on a 401); the free tier otherwise.
  // F-129: bounded, since the live sweep now runs these every minute and a hung laps call would cost that minute's positions.
  const response = await openf1Fetch(url.toString(), { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

  if (response.status === 429) {
    console.log('[OpenF1] Rate limited, waiting 2s and retrying...');
    await delay(2000);
    lastRequestTime = Date.now();
    const retry = await openf1Fetch(url.toString(), { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
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

export async function fetchMeetingDrivers(meetingKey: number): Promise<OpenF1Driver[]> {
  return fetchApi<OpenF1Driver>('/drivers', { meeting_key: meetingKey });
}

/**
 * driver_number → constructor id from one session's driver records (F-134). A record with no
 * team_name, or a team name this map does not know, leaves the number out; the converters then
 * drop that car with a "No team mapping" warning, which is what happened to the Haas stand-in at
 * Mexico City 2026: the provider's Race-session record for car 50 carried team null while its
 * practice and qualifying records said "Haas F1 Team". `fillTeamsFromMeeting` closes that gap.
 */
export function teamsFromDrivers(drivers: OpenF1Driver[]): Record<number, string> {
  const driverTeams: Record<number, string> = {};
  for (const d of drivers) {
    if (d.team_name) {
      const teamId = TEAM_NAME_TO_ID[d.team_name];
      if (teamId) driverTeams[d.driver_number] = teamId;
    }
  }
  return driverTeams;
}

/**
 * Pure. For every driver of the session that `teams` has no constructor for, take the team the
 * same car carried in another session of the meeting (the latest session that names one). Each
 * fill is reported as a warning so the admin panel shows where the grid came from. A number the
 * meeting never attaches to a known team stays unresolved and keeps its existing warning.
 */
export function fillTeamsFromMeeting(
  teams: Record<number, string>,
  sessionDrivers: OpenF1Driver[],
  meetingDrivers: OpenF1Driver[],
  warnings: string[],
): Record<number, string> {
  const out = { ...teams };
  for (const d of sessionDrivers) {
    if (out[d.driver_number]) continue;
    const named = (m: OpenF1Driver): m is OpenF1Driver & { team_name: string } =>
      m.driver_number === d.driver_number && m.session_key !== d.session_key && !!m.team_name && !!TEAM_NAME_TO_ID[m.team_name];
    const elsewhere = meetingDrivers.filter(named).sort((a, b) => b.session_key - a.session_key)[0];
    if (!elsewhere) continue;
    out[d.driver_number] = TEAM_NAME_TO_ID[elsewhere.team_name];
    warnings.push(`Team for driver ${d.driver_number} taken from session ${elsewhere.session_key} of the meeting (${elsewhere.team_name}); the provider lists no team for the car in this session`);
  }
  return out;
}

/** The session's teams, filled from the meeting where a car has none here (one extra call, only when needed). */
export async function teamsForSession(drivers: OpenF1Driver[], warnings: string[], fetchMeeting: (meetingKey: number) => Promise<OpenF1Driver[]> = fetchMeetingDrivers): Promise<Record<number, string>> {
  const teams = teamsFromDrivers(drivers);
  const missing = drivers.filter((d) => !teams[d.driver_number]);
  const meetingKey = missing.find((d) => typeof d.meeting_key === 'number')?.meeting_key;
  if (missing.length === 0) return teams;
  if (meetingKey === undefined) {
    warnings.push(`${missing.length} car(s) have no team in this session and its driver records carry no meeting_key; team fill skipped`);
    return teams;
  }
  try {
    return fillTeamsFromMeeting(teams, drivers, await fetchMeeting(meetingKey), warnings);
  } catch (e) {
    warnings.push(`Could not fetch the meeting's drivers to fill ${missing.length} missing team(s): ${e instanceof Error ? e.message : String(e)}`);
    return teams;
  }
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
  return driverIdOf(fastest.driverNumber) ?? null;
}

/**
 * Get grid positions for the race.
 *
 * Prefers OpenF1's /starting_grid for the race session — this is the ACTUAL
 * grid including engine penalties, pit-lane starts and post-quali DSQs, which
 * the qualifying classification is not. Falls back to qualifying results when
 * starting_grid has no data (older seasons / data not yet published), so
 * positionsGained stays best-effort rather than empty.
 *
 * Returns driverId → grid position map.
 */
export async function getGridPositions(
  sessions: OpenF1Session[],
  raceSessionKey?: number,
): Promise<Record<string, number>> {
  const grid: Record<string, number> = {};

  if (raceSessionKey) {
    try {
      const gridRows = await fetchApi<OpenF1StartingGridRow>('/starting_grid', {
        session_key: raceSessionKey,
      });
      for (const r of gridRows || []) {
        if (r.position == null || r.driver_number == null) continue;
        const driverId = driverIdOf(r.driver_number);
        if (driverId) {
          grid[driverId] = r.position;
        }
      }
      if (Object.keys(grid).length > 0) {
        console.log(`[OpenF1] Using starting_grid for session ${raceSessionKey} (${Object.keys(grid).length} drivers)`);
        return grid;
      }
    } catch (err) {
      console.warn('[OpenF1] starting_grid fetch failed, falling back to qualifying:', err);
    }
  }

  const qualiSession = sessions.find(s =>
    s.session_name === 'Qualifying',
  );

  if (!qualiSession) return grid;

  const results = await fetchSessionResults(qualiSession.session_key);
  for (const r of results) {
    if (r.position == null || r.driver_number == null) continue;
    const driverId = driverIdOf(r.driver_number);
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

  // Build driver → team mapping; a car with no team in this session takes its team from the meeting (F-134)
  const driverTeams = await teamsForSession(drivers, warnings);

  let maxLaps = 0;
  const results: RaceResult[] = [];

  for (const r of sessionResults) {
    if (r.driver_number == null) continue;

    const driverId = DRIVER_NUMBER_TO_ID[r.driver_number];
    if (!driverId) {
      warnings.push(`${UNMAPPED_DRIVER_WARNING_PREFIX}: ${r.driver_number}`);
      continue;
    }

    const constructorId = driverTeams[r.driver_number];
    if (!constructorId) {
      warnings.push(noTeamWarning(r.driver_number, driverId, 'race'));
      continue;
    }

    const isDsq = r.dsq === true;
    const isDns = r.dns === true && !isDsq;
    const isDnf = r.dnf === true && !isDsq && !isDns;
    // A row with no finishing position that isn't DNF/DSQ/DNS = "not classified"
    // (ran but outside the official classification, e.g. many laps down — Albon
    // in Barcelona 2026). Score it 0 with no penalty, distinct from a P0
    // "finished" glitch that previously awarded phantom positions-gained points.
    const isNc = (r.position == null || r.position <= 0) && !isDnf && !isDsq && !isDns;
    const position = (isDnf || isDsq || isDns || isNc) ? 0 : (r.position as number);
    const status: RaceResult['status'] = isDsq ? 'dsq' : isDns ? 'dns' : isDnf ? 'dnf' : isNc ? 'nc' : 'finished';

    if (isNc) {
      warnings.push(`Driver ${r.driver_number} (${driverId}) not classified (no position, not DNF) — scored 0 (NC)`);
    }

    // Use grid position from starting_grid/qualifying; for drivers without
    // data (e.g. crashed in Q1, stewards' permission), place them at the back
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
    warnings.push('No starting-grid or qualifying data found — grid positions defaulted to back of grid (P22)');
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
      warnings.push(`${UNMAPPED_DRIVER_WARNING_PREFIX} in sprint: ${r.driver_number}`);
      continue;
    }

    const isDsq = r.dsq === true;
    const isDns = r.dns === true && !isDsq;
    const isDnf = r.dnf === true && !isDsq && !isDns;
    const isNc = (r.position == null || r.position <= 0) && !isDnf && !isDsq && !isDns;
    const position = (isDnf || isDsq || isDns || isNc) ? 0 : (r.position as number);
    const status: SprintResult['status'] = isDsq ? 'dsq' : isDns ? 'dns' : isDnf ? 'dnf' : isNc ? 'nc' : 'finished';

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

  // Build driver → team mapping; a car with no team in this session takes its team from the meeting (F-134)
  const driverTeams = await teamsForSession(drivers, warnings);

  const results: QualifyingResult[] = [];

  for (const r of sessionResults) {
    if (r.driver_number == null || r.position == null || r.position <= 0) continue;

    const driverId = DRIVER_NUMBER_TO_ID[r.driver_number];
    if (!driverId) {
      warnings.push(`${UNMAPPED_DRIVER_WARNING_PREFIX} in qualifying: ${r.driver_number}`);
      continue;
    }

    const constructorId = driverTeams[r.driver_number];
    if (!constructorId) {
      warnings.push(noTeamWarning(r.driver_number, driverId, 'qualifying'));
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
 *
 * Cancelled meetings KEEP their round slots. OpenF1 still lists the 2026
 * Sakhir (round 4) and Jeddah (round 5) Race sessions with is_cancelled=true.
 * Skipping those would collapse Miami onto round 4 and misfile every later
 * race against ROUND_TO_RACE_ID. The cancelled rounds stay unmapped there,
 * so their sessions are never written onto a live race doc.
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
