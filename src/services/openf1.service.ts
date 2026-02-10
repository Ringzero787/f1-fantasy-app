/**
 * OpenF1 API Service
 *
 * Integrates with https://openf1.org for real-time F1 data
 * - Live session data during races
 * - Race and sprint results
 * - Driver positions and lap times
 * - Championship standings
 *
 * Rate limits: 3 req/s, 30 req/min (free tier)
 */

const BASE_URL = 'https://api.openf1.org/v1';

// Rate limiting: OpenF1 free tier allows 3 req/s, 30 req/min
const REQUEST_DELAY_MS = 400; // 400ms between requests = ~2.5 req/s (safe margin)
let lastRequestTime = 0;

// Simple delay function
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// OpenF1 API response types
export interface OpenF1Session {
  circuit_key: number;
  circuit_short_name: string;
  country_code: string;
  country_key: number;
  country_name: string;
  date_end: string;
  date_start: string;
  gmt_offset: string;
  location: string;
  meeting_key: number;
  session_key: number;
  session_name: string;
  session_type: string;
  year: number;
}

export interface OpenF1Driver {
  broadcast_name: string;
  driver_number: number;
  first_name: string;
  full_name: string;
  headshot_url: string;
  last_name: string;
  meeting_key: number;
  name_acronym: string;
  session_key: number;
  team_colour: string;
  team_name: string;
}

export interface OpenF1Position {
  date: string;
  driver_number: number;
  meeting_key: number;
  session_key: number;
  position: number;
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

export interface OpenF1Lap {
  date_start: string;
  driver_number: number;
  duration_sector_1: number | null;
  duration_sector_2: number | null;
  duration_sector_3: number | null;
  i1_speed: number | null;
  i2_speed: number | null;
  is_pit_out_lap: boolean;
  lap_duration: number | null;
  lap_number: number;
  meeting_key: number;
  session_key: number;
  st_speed: number | null;
}

export interface OpenF1ChampionshipDriver {
  driver_number: number;
  meeting_key: number;
  session_key: number;
  points_current: number;
  points_start: number;
  position_current: number;
  position_start: number;
}

export interface OpenF1ChampionshipTeam {
  meeting_key: number;
  session_key: number;
  team_name: string;
  points_current: number;
  points_start: number;
  position_current: number;
  position_start: number;
}

// Map OpenF1 driver numbers to our app's driver IDs
const DRIVER_NUMBER_TO_ID: Record<number, string> = {
  1: 'verstappen',
  4: 'norris',
  10: 'gasly',
  11: 'perez',
  14: 'alonso',
  16: 'leclerc',
  18: 'stroll',
  20: 'hulkenberg', // Assuming Hulk keeps 20 at Sauber
  22: 'antonelli', // New number for Antonelli - may change
  23: 'albon',
  27: 'hulkenberg',
  31: 'ocon',
  44: 'hamilton',
  55: 'sainz',
  63: 'russell',
  81: 'piastri',
  // 2026 rookies - numbers may change
  6: 'bearman', // Haas
  7: 'lawson', // Red Bull/Racing Bulls
  30: 'bortoleto', // Sauber
  43: 'colapinto', // Alpine (rumored)
  35: 'hadjar', // Racing Bulls
  77: 'bottas', // Cadillac
  87: 'linblad', // Reserve
};

// Map OpenF1 team names to our constructor IDs
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
  'Cadillac': 'cadillac',
  'Cadillac F1': 'cadillac',
};

// F1 points system
const RACE_POINTS: Record<number, number> = {
  1: 25, 2: 18, 3: 15, 4: 12, 5: 10,
  6: 8, 7: 6, 8: 4, 9: 2, 10: 1,
};

const SPRINT_POINTS: Record<number, number> = {
  1: 8, 2: 7, 3: 6, 4: 5, 5: 4,
  6: 3, 7: 2, 8: 1,
};

class OpenF1Service {
  private async fetch<T>(endpoint: string, params?: Record<string, string | number>): Promise<T[]> {
    // Rate limiting: wait if we made a request recently
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < REQUEST_DELAY_MS) {
      const waitTime = REQUEST_DELAY_MS - timeSinceLastRequest;
      console.log(`[OpenF1] Rate limiting: waiting ${waitTime}ms`);
      await delay(waitTime);
    }
    lastRequestTime = Date.now();

    const url = new URL(`${BASE_URL}${endpoint}`);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, String(value));
      });
    }

    console.log('[OpenF1] Fetching:', url.toString());

    const response = await fetch(url.toString());

    if (!response.ok) {
      // If rate limited, wait and retry once
      if (response.status === 429) {
        console.log('[OpenF1] Rate limited, waiting 2s and retrying...');
        await delay(2000);
        lastRequestTime = Date.now();
        const retryResponse = await fetch(url.toString());
        if (!retryResponse.ok) {
          throw new Error(`OpenF1 API error: ${retryResponse.status} ${retryResponse.statusText}`);
        }
        return retryResponse.json();
      }
      throw new Error(`OpenF1 API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get all sessions for a year
   */
  async getSessions(year: number): Promise<OpenF1Session[]> {
    return this.fetch<OpenF1Session>('/sessions', { year });
  }

  /**
   * Get a specific session by meeting and session type
   */
  async getSession(params: {
    year?: number;
    country_name?: string;
    session_name?: string;
    session_key?: number;
  }): Promise<OpenF1Session[]> {
    return this.fetch<OpenF1Session>('/sessions', params as Record<string, string | number>);
  }

  /**
   * Get race sessions only (excludes practice, qualifying)
   */
  async getRaceSessions(year: number): Promise<OpenF1Session[]> {
    const sessions = await this.getSessions(year);
    return sessions.filter(s => s.session_name === 'Race');
  }

  /**
   * Get sprint sessions only
   */
  async getSprintSessions(year: number): Promise<OpenF1Session[]> {
    const sessions = await this.getSessions(year);
    return sessions.filter(s => s.session_name === 'Sprint');
  }

  /**
   * Get drivers for a session
   */
  async getDrivers(sessionKey: number): Promise<OpenF1Driver[]> {
    return this.fetch<OpenF1Driver>('/drivers', { session_key: sessionKey });
  }

  /**
   * Get session results (final positions)
   */
  async getSessionResults(sessionKey: number): Promise<OpenF1SessionResult[]> {
    return this.fetch<OpenF1SessionResult>('/session_result', { session_key: sessionKey });
  }

  /**
   * Get live positions during a session
   */
  async getPositions(sessionKey: number): Promise<OpenF1Position[]> {
    return this.fetch<OpenF1Position>('/position', { session_key: sessionKey });
  }

  /**
   * Get lap data for a session
   */
  async getLaps(sessionKey: number, driverNumber?: number): Promise<OpenF1Lap[]> {
    const params: Record<string, number> = { session_key: sessionKey };
    if (driverNumber) {
      params.driver_number = driverNumber;
    }
    return this.fetch<OpenF1Lap>('/laps', params);
  }

  /**
   * Get driver championship standings
   */
  async getDriverChampionship(sessionKey: number): Promise<OpenF1ChampionshipDriver[]> {
    return this.fetch<OpenF1ChampionshipDriver>('/championship_drivers', { session_key: sessionKey });
  }

  /**
   * Get constructor championship standings
   */
  async getTeamChampionship(sessionKey: number): Promise<OpenF1ChampionshipTeam[]> {
    return this.fetch<OpenF1ChampionshipTeam>('/championship_teams', { session_key: sessionKey });
  }

  /**
   * Find the most recent race session
   */
  async getLatestRaceSession(year: number): Promise<OpenF1Session | null> {
    const races = await this.getRaceSessions(year);

    if (!races || races.length === 0) {
      console.log('[OpenF1] No race sessions found for year:', year);
      return null;
    }

    const now = new Date();

    // Find the most recent completed race
    const completedRaces = races.filter(r => {
      if (!r.date_end) return false;
      return new Date(r.date_end) < now;
    });

    if (completedRaces.length === 0) {
      console.log('[OpenF1] No completed races found. Total races:', races.length);
      return null;
    }

    console.log('[OpenF1] Found', completedRaces.length, 'completed races');
    return completedRaces[completedRaces.length - 1];
  }

  /**
   * Convert OpenF1 driver number to our app's driver ID
   */
  driverNumberToId(driverNumber: number): string | null {
    return DRIVER_NUMBER_TO_ID[driverNumber] || null;
  }

  /**
   * Convert OpenF1 team name to our app's constructor ID
   */
  teamNameToId(teamName: string): string | null {
    return TEAM_NAME_TO_ID[teamName] || null;
  }

  /**
   * Get points for a race position
   */
  getRacePoints(position: number | null): number {
    if (!position) return 0;
    return RACE_POINTS[position] || 0;
  }

  /**
   * Get points for a sprint position
   */
  getSprintPoints(position: number | null): number {
    if (!position) return 0;
    return SPRINT_POINTS[position] || 0;
  }

  /**
   * Convert OpenF1 session results to our app's race result format
   * Returns data ready to be imported into AdminStore
   */
  async convertSessionResultsForApp(sessionKey: number, isSprint: boolean = false): Promise<{
    driverResults: Array<{
      driverId: string;
      driverNumber: number;
      position: number | null;
      points: number;
      dnf: boolean;
    }>;
    constructorResults: Array<{
      constructorId: string;
      points: number;
    }>;
  }> {
    console.log('[OpenF1] Converting session results for key:', sessionKey, 'isSprint:', isSprint);

    const [results, drivers] = await Promise.all([
      this.getSessionResults(sessionKey),
      this.getDrivers(sessionKey),
    ]);

    if (!results || results.length === 0) {
      console.warn('[OpenF1] No results found for session:', sessionKey);
      return { driverResults: [], constructorResults: [] };
    }

    console.log('[OpenF1] Found', results.length, 'results and', drivers?.length || 0, 'drivers');

    // Create driver number to team mapping
    const driverTeams: Record<number, string> = {};
    if (drivers && drivers.length > 0) {
      drivers.forEach(d => {
        if (d && d.team_name) {
          const teamId = this.teamNameToId(d.team_name);
          if (teamId) {
            driverTeams[d.driver_number] = teamId;
          }
        }
      });
    }

    // Process driver results
    const driverResults: Array<{
      driverId: string;
      driverNumber: number;
      position: number | null;
      points: number;
      dnf: boolean;
    }> = [];

    // Aggregate constructor points
    const constructorPoints: Record<string, number> = {};

    for (const result of results) {
      if (!result || result.driver_number === undefined) {
        continue;
      }

      const driverId = this.driverNumberToId(result.driver_number);
      if (!driverId) {
        console.warn(`[OpenF1] Unknown driver number: ${result.driver_number}`);
        continue;
      }

      const points = isSprint
        ? this.getSprintPoints(result.position)
        : this.getRacePoints(result.position);

      const isDnf = result.dnf === true || result.dns === true || result.dsq === true;

      driverResults.push({
        driverId,
        driverNumber: result.driver_number,
        position: isDnf ? null : result.position,
        points,
        dnf: isDnf,
      });

      // Add to constructor points
      const constructorId = driverTeams[result.driver_number];
      if (constructorId) {
        constructorPoints[constructorId] = (constructorPoints[constructorId] || 0) + points;
      }
    }

    // Convert constructor points to array
    const constructorResults = Object.entries(constructorPoints).map(([constructorId, points]) => ({
      constructorId,
      points,
    }));

    console.log('[OpenF1] Converted', driverResults.length, 'driver results and', constructorResults.length, 'constructor results');

    return { driverResults, constructorResults };
  }

  /**
   * Get complete race weekend results (race + sprint if applicable)
   */
  async getRaceWeekendResults(meetingKey: number): Promise<{
    race: Awaited<ReturnType<typeof this.convertSessionResultsForApp>> | null;
    sprint: Awaited<ReturnType<typeof this.convertSessionResultsForApp>> | null;
    sessions: OpenF1Session[];
  }> {
    // Get all sessions for this meeting
    const allSessions = await this.fetch<OpenF1Session>('/sessions', { meeting_key: meetingKey });

    const raceSession = allSessions.find(s => s.session_name === 'Race');
    const sprintSession = allSessions.find(s => s.session_name === 'Sprint');

    let race = null;
    let sprint = null;

    if (raceSession) {
      try {
        race = await this.convertSessionResultsForApp(raceSession.session_key, false);
      } catch (e) {
        console.error('[OpenF1] Failed to get race results:', e);
      }
    }

    if (sprintSession) {
      try {
        sprint = await this.convertSessionResultsForApp(sprintSession.session_key, true);
      } catch (e) {
        console.error('[OpenF1] Failed to get sprint results:', e);
      }
    }

    return { race, sprint, sessions: allSessions };
  }
}

export const openF1Service = new OpenF1Service();
