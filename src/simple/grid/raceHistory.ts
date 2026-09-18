/**
 * Per-race points for the current roster, for the Profile's RACE HISTORY row
 * and stat cards — pure. Mirrors the tenure rule in team.store's calculator:
 * a driver is not credited for races run before they were bought.
 */
export interface HistoryRaceResult {
  isComplete?: boolean;
  driverResults?: { driverId: string; points: number }[];
  sprintResults?: { driverId: string; points: number }[];
  constructorResults?: { constructorId: string; points: number }[];
  sprintConstructorResults?: { constructorId: string; points: number }[];
}

export interface HistoryTeam {
  joinedAtRace?: number;
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
  const completed = Object.entries(results)
    .filter(([, r]) => r.isComplete)
    .map(([raceId, r]) => ({ raceId, r, round: byId.get(raceId)?.round ?? 999, name: byId.get(raceId)?.name ?? raceId.replace(/_/g, ' ') }))
    .sort((a, b) => a.round - b.round);
  return completed.map(({ raceId, r, round, name }) => {
    let total = 0;
    const drivers: { shortName: string; pts: number }[] = [];
    for (const d of team.drivers ?? []) {
      const addedAt = d.addedAtRace ?? team.joinedAtRace ?? 0;
      if (round > 0 && round <= addedAt) continue;
      const pts = (r.driverResults?.find((x) => x.driverId === d.driverId)?.points ?? 0)
        + (r.sprintResults?.find((x) => x.driverId === d.driverId)?.points ?? 0);
      total += pts;
      drivers.push({ shortName: d.shortName, pts });
    }
    let constructor: HistoryEntry['constructor'] = null;
    const c = team.constructor;
    if (c && typeof c === 'object') {
      const pts = (r.constructorResults?.find((x) => x.constructorId === c.constructorId)?.points ?? 0)
        + (r.sprintConstructorResults?.find((x) => x.constructorId === c.constructorId)?.points ?? 0);
      total += pts;
      constructor = { name: c.name, pts };
    }
    return { raceId, round, name, total, drivers, constructor };
  });
}

/** RACES / AVG / BEST stat cards from a history (BEST reads the server field when F-054 lands). */
export function historyStats(history: HistoryEntry[], seasonPoints: number, bestFromServer?: number | null) {
  const races = history.length;
  const avg = races > 0 ? seasonPoints / races : null;
  const best = bestFromServer ?? (races > 0 ? Math.max(...history.map((h) => h.total)) : null);
  return { races, avg, best };
}

export const DISPLAY_SCALES: { key: 'S' | 'M' | 'L' | 'XL'; scale: number }[] = [
  { key: 'S', scale: 0.85 },
  { key: 'M', scale: 1.0 },
  { key: 'L', scale: 1.15 },
  { key: 'XL', scale: 1.3 },
];
