import {
  collection,
  getDocs,
  limit,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db } from '../config/firebase';

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

  /** Get all race scores for a specific driver or constructor across all races */
  async getScoresForEntity(entityId: string): Promise<RaceScore[]> {
    const q = query(
      raceScoresCollection,
      where('entityId', '==', entityId),
      orderBy('round', 'asc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as RaceScore);
  },

  /** Get the latest race scores (for "last race" display) */
  async getLatestRaceScores(): Promise<RaceScore[]> {
    const latest = await this.getLatestRound();
    if (!latest) return [];
    return this.getScoresForRace(latest.raceId);
  },

  /**
   * The highest scored round and its raceId — one document read instead of
   * the whole driver history.
   */
  async getLatestRound(): Promise<{ raceId: string; round: number } | null> {
    const q = query(
      raceScoresCollection,
      where('entityType', '==', 'driver'),
      orderBy('round', 'desc'),
      limit(1),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const top = snap.docs[0].data() as RaceScore;
    return { raceId: top.raceId, round: top.round };
  },

  /** Scores for the round before `round` (for ▲/▼ trends); [] when none. */
  async getPreviousRaceScores(round: number): Promise<RaceScore[]> {
    const q = query(
      raceScoresCollection,
      where('entityType', '==', 'driver'),
      where('round', '<', round),
      orderBy('round', 'desc'),
      limit(1),
    );
    const snap = await getDocs(q);
    if (snap.empty) return [];
    const prev = snap.docs[0].data() as RaceScore;
    return this.getScoresForRace(prev.raceId);
  },
};
