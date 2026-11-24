import {
  collection,
  getDocs,
  limit,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { rowSeasonId } from '../utils/season';

const raceScoresCollection = collection(db, 'raceScores');

export interface RaceScore {
  raceId: string;
  round: number;
  entityId: string;
  entityType: 'driver' | 'constructor';
  constructorId?: string;
  position?: number;
  gridPosition?: number;
  status?: string;
  positionsGained?: number;
  racePoints: number;
  sprintPoints: number;
  qualiPoints: number;
  sprintPosition?: number | null;
  qualiPosition?: number | null;
  fastestLap?: boolean;
  fastestLapBonus?: number;
  totalPoints: number;
  /** F-168 and later; older rows have none (rowSeasonId reads the race id instead) */
  seasonId?: string | null;
}

/**
 * Pure: of the candidate rows, the one with the highest round that belongs to `seasonId`. Null when
 * none does (an unscoped candidate from another season is dropped, never shown as this season's).
 */
export function pickSeasonRow<T extends { raceId: string; round: number; seasonId?: unknown }>(
  rows: ReadonlyArray<T | null | undefined>,
  seasonId: string,
  raceSeasons?: ReadonlyMap<string, string>,
): T | null {
  let best: T | null = null;
  for (const r of rows) {
    if (!r || rowSeasonId(r, raceSeasons) !== seasonId) continue;
    if (!best || r.round > best.round) best = r;
  }
  return best;
}

/** The first driver row of a query ordered by round desc, below `beforeRound` when given; null when empty or on error. */
async function topDriverRow(scoped: string | null, beforeRound?: number): Promise<RaceScore | null> {
  const clauses = [where('entityType', '==', 'driver')];
  if (scoped) clauses.push(where('seasonId', '==', scoped));
  if (beforeRound !== undefined) clauses.push(where('round', '<', beforeRound));
  try {
    const snap = await getDocs(query(raceScoresCollection, ...clauses, orderBy('round', 'desc'), limit(1)));
    return snap.empty ? null : (snap.docs[0].data() as RaceScore);
  } catch (e) {
    if (!scoped) throw e;
    // the scoped index may not be deployed yet: the unscoped read still answers for pre-F-168 rows
    console.warn('[RaceScores] season-scoped query failed, using the unscoped one:', e);
    return null;
  }
}

async function topRowInSeason(seasonId: string, raceSeasons?: ReadonlyMap<string, string>, beforeRound?: number): Promise<RaceScore | null> {
  const [scoped, unscoped] = await Promise.all([topDriverRow(seasonId, beforeRound), topDriverRow(null, beforeRound)]);
  return pickSeasonRow([scoped, unscoped], seasonId, raceSeasons);
}

export const raceScoresService = {
  /** Get all scores for a specific race */
  async getScoresForRace(raceId: string): Promise<RaceScore[]> {
    const q = query(
      raceScoresCollection,
      where('raceId', '==', raceId),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as RaceScore);
  },

  /**
   * One entity's race scores, oldest first. F-157: with `seasonId`, only that season's rows (filtered
   * here, not in the query: rows written before F-168 carry no seasonId, and the race id still says
   * the year — see rowSeasonId).
   */
  async getScoresForEntity(entityId: string, seasonId?: string, raceSeasons?: ReadonlyMap<string, string>): Promise<RaceScore[]> {
    const q = query(
      raceScoresCollection,
      where('entityId', '==', entityId),
      orderBy('round', 'asc'),
    );
    const snap = await getDocs(q);
    const rows = snap.docs.map(d => d.data() as RaceScore);
    return seasonId ? rows.filter(r => rowSeasonId(r, raceSeasons) === seasonId) : rows;
  },

  /** The latest scored race of `seasonId` (for "last race" display) */
  async getLatestRaceScores(seasonId: string, raceSeasons?: ReadonlyMap<string, string>): Promise<RaceScore[]> {
    const latest = await this.getLatestRound(seasonId, raceSeasons);
    if (!latest) return [];
    return this.getScoresForRace(latest.raceId);
  },

  /**
   * The highest scored round of `seasonId` and its raceId. F-157: it used to take the highest round
   * of every season, so in 2027 the last-race view would have sat on Abu Dhabi 2026 (round 25)
   * until 2027 passed round 25.
   *
   * Two one-document reads: the season-scoped query (index entityType + seasonId + round desc) finds
   * every row written since F-168, which stamps seasonId; the unscoped one finds an older row that
   * has none, and is kept only when it belongs to the season (rowSeasonId). A scoped query that fails
   * — its index not yet deployed — counts as empty, so the build works before the index op.
   */
  async getLatestRound(seasonId: string, raceSeasons?: ReadonlyMap<string, string>): Promise<{ raceId: string; round: number } | null> {
    const top = await topRowInSeason(seasonId, raceSeasons);
    return top ? { raceId: top.raceId, round: top.round } : null;
  },

  /** Scores for the round of `seasonId` before `round` (for ▲/▼ trends); [] when none. */
  async getPreviousRaceScores(round: number, seasonId: string, raceSeasons?: ReadonlyMap<string, string>): Promise<RaceScore[]> {
    const prev = await topRowInSeason(seasonId, raceSeasons, round);
    if (!prev) return [];
    return this.getScoresForRace(prev.raceId);
  },
};
