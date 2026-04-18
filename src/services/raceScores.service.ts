import {
  collection,
  getDocs,
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
    // Get all driver scores sorted by round desc, grab the highest round
    const q = query(
      raceScoresCollection,
      where('entityType', '==', 'driver'),
      orderBy('round', 'desc'),
    );
    const snap = await getDocs(q);
    const allScores = snap.docs.map(d => d.data() as RaceScore);
    if (allScores.length === 0) return [];

    const latestRound = allScores[0].round;
    const latestRaceId = allScores[0].raceId;

    // Return all scores (drivers + constructors) for the latest race
    const allForRace = await this.getScoresForRace(latestRaceId);
    return allForRace;
  },
};
