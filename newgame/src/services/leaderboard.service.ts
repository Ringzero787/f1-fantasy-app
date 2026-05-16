// Leaderboard service — reads Ben-mechanic weekend + season scores.
// Both collections are written by the tlSettleWeekend Cloud Function.

import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { WeekendScore, SeasonScore } from '../types';

export const leaderboardService = {
  // Top N players for a given race weekend, ranked by points (tiebreak: cash).
  async getWeekend(raceId: string, top = 50): Promise<WeekendScore[]> {
    const q = query(
      collection(db, 'tl_weekend_scores'),
      where('raceId', '==', raceId),
      orderBy('points', 'desc'),
      orderBy('cash', 'desc'),
      limit(top)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as WeekendScore);
  },

  // Top N players in a season, ranked by total points (tiebreak: total cash).
  async getSeason(seasonId: string, top = 100): Promise<SeasonScore[]> {
    const q = query(
      collection(db, 'tl_season_scores'),
      where('seasonId', '==', seasonId),
      orderBy('totalPoints', 'desc'),
      orderBy('totalCash', 'desc'),
      limit(top)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SeasonScore);
  },
};
