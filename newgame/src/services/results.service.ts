// Results service — fetches the most recent completed race + this user's score doc.

import { collection, doc, getDoc, getDocs, orderBy, limit, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Race } from '../types';

export interface RaceScoreDoc {
  userId: string;
  raceId: string;
  qualifyingPoints: number;
  racePoints: number;
  totalPoints: number;
  cashPayout: number;
  streakBonus: number;
  interest: number;
  computedAt?: Date;
}

export const resultsService = {
  async getMostRecentCompletedRace(): Promise<Race | null> {
    try {
      const q = query(
        collection(db, 'races'),
        where('status', '==', 'completed'),
        orderBy('schedule.race', 'desc'),
        limit(1)
      );
      const snap = await getDocs(q);
      if (snap.empty) return null;
      const d = snap.docs[0];
      return { id: d.id, ...d.data() } as Race;
    } catch {
      return null;
    }
  },

  async getUserScore(userId: string, raceId: string): Promise<RaceScoreDoc | null> {
    const snap = await getDoc(doc(db, 'tl_scores', `${userId}_${raceId}`));
    if (!snap.exists()) return null;
    return snap.data() as RaceScoreDoc;
  },
};
