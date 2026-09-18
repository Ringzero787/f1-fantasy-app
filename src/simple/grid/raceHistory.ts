/**
 * Per-race points for the current roster, for the Profile's RACE HISTORY row
 * and stat cards — pure. Mirrors team.store's calculateTeamPointsFromRaces:
 * races before the team joined are skipped outright, a driver is not
 * credited for races run before they were bought, and the *current* ace pick
 * is doubled (a client estimate — the server totals are authoritative).
 */
import { PRICING_CONFIG } from '../../config/pricing.config';
export interface HistoryRaceResult {
  isComplete?: boolean;
  driverResults?: { driverId: string; points: number }[];
  sprintResults?: { driverId: string; points: number }[];
  constructorResults?: { constructorId: string; points: number }[];
  sprintConstructorResults?: { constructorId: string; points: number }[];
}

export interface HistoryTeam {
  joinedAtRace?: number;
  aceDriverId?: string;
  aceConstructorId?: string;
  drivers?: { driverId: string; shortName: string; addedAtRace?: number }[];
  constructor?: { constructorId: string; name: string } | null;
}

export interface HistoryRace { id: string; round: number; name: string }

export interface HistoryEntry {
  raceId: string;
  round: number;
  name: string;
  total: number;
  drivers: { shortName: string; pts: number }[];
  constructor: { name: string; pts: number } | null;
}

export function teamRaceHistory(team: HistoryTeam | null, results: Record<string, HistoryRaceResult>, races: HistoryRace[]): HistoryEntry[] {
  if (!team) return [];
  const byId = new Map(races.map((r) => [r.id, r]));
  const joinedAt = team.joinedAtRace ?? 0;
  const completed = Object.entries(results)
    .filter(([, r]) => r.isComplete)
    .map(([raceId, r]) => ({ raceId, r, round: byId.get(raceId)?.round ?? 999, name: byId.get(raceId)?.name ?? raceId.replace(/_/g, ' ') }))
    .filter(({ round }) => !(round > 0 && round <= joinedAt))
    .sort((a, b) => a.round - b.round);
  return completed.map(({ raceId, r, round, name }) => {
    let total = 0;
    const drivers: { shortName: string; pts: number }[] = [];
    for (const d of team.drivers ?? []) {
      const addedAt = d.addedAtRace ?? team.joinedAtRace ?? 0;
      if (round > 0 && round <= addedAt) continue;
      const base = (r.driverResults?.find((x) => x.driverId === d.driverId)?.points ?? 0)
        + (r.sprintResults?.find((x) => x.driverId === d.driverId)?.points ?? 0);
      const pts = team.aceDriverId === d.driverId ? base * PRICING_CONFIG.ACE_MULTIPLIER : base;
      total += pts;
      drivers.push({ shortName: d.shortName, pts });
    }
    let constructor: HistoryEntry['constructor'] = null;
    const c = team.constructor;
    if (c && typeof c === 'object') {
      const base = (r.constructorResults?.find((x) => x.constructorId === c.constructorId)?.points ?? 0)
        + (r.sprintConstructorResults?.find((x) => x.constructorId === c.constructorId)?.points ?? 0);
      const pts = team.aceConstructorId === c.constructorId ? base * PRICING_CONFIG.ACE_MULTIPLIER : base;
      total += pts;
      constructor = { name: c.name, pts };
    }
    return { raceId, round, name, total, drivers, constructor };
  });
}

/** Race keys in `scoredRaces` are plain race ids; quali/sprint carry a prefix. */
export function scoredRaceCount(scoredRaces: string[] | undefined | null): number | null {
  if (!Array.isArray(scoredRaces)) return null;
  return new Set(scoredRaces.filter((k) => !k.startsWith('quali_') && !k.startsWith('sprint_'))).size;
}

/**
 * RACES / AVG / BEST stat cards. RACES = races the team was scored for
 * (server-stamped `scoredRaces`), falling back to the local history when the
 * stamp is missing; BEST comes only from the server field (F-054) and shows
 * `—` until then.
 */
export function historyStats(history: HistoryEntry[], seasonPoints: number, racesScored: number | null, bestFromServer?: number | null) {
  const races = racesScored ?? history.length;
  const avg = races > 0 ? seasonPoints / races : null;
  const best = bestFromServer ?? null;
  return { races, avg, best };
}
