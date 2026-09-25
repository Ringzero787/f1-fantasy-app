import { assertAllowedInputs } from './inputs';
import type { HistPrice, HistRace, HistScore, History } from './types';

type Raw = Record<string, Array<Record<string, any>>>;

/** Parse an export of the allowed collections (see cli/exportHistory) into the model's History. */
export function parseHistory(raw: Raw): History {
  assertAllowedInputs(Object.keys(raw));
  const races: HistRace[] = (raw.races ?? [])
    .filter((r) => r.status === 'completed' && Array.isArray(r.results?.raceResults) && r.results.raceResults.length > 0)
    .map((r) => {
      const rr = r.results.raceResults as HistRace['raceResults'];
      const laps = typeof r.totalLaps === 'number' && r.totalLaps > 0 ? r.totalLaps : rr.reduce((m, x) => (x.status === 'finished' ? Math.max(m, x.laps ?? 0) : m), 0);
      return {
        id: String(r.id), season: String(r.seasonId), circuitId: String(r.circuitId ?? ''), round: Number(r.round) || 0, hasSprint: Array.isArray(r.results.sprintResults) && r.results.sprintResults.length > 0,
        totalLaps: laps, raceResults: rr, qualifyingResults: r.results.qualifyingResults ?? [], sprintResults: r.results.sprintResults ?? [],
      };
    })
    .sort((a, b) => (a.season < b.season ? -1 : a.season > b.season ? 1 : a.round - b.round));
  const scores: HistScore[] = (raw.raceScores ?? []).map((s) => ({ raceId: s.raceId, round: s.round, entityId: s.entityId, entityType: s.entityType, totalPoints: Number(s.totalPoints) || 0 }));
  const prices: HistPrice[] = (raw.priceHistory ?? []).filter((p) => p.raceId).map((p) => ({ raceId: p.raceId, entityId: p.entityId, entityType: p.entityType, previousPrice: Number(p.previousPrice) || 0, change: Number(p.change) || 0 }));
  return { races, scores, prices };
}
