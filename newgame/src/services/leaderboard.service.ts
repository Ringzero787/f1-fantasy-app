// Leaderboard service — reads Ben-mechanic weekend + season scores.
// Both collections are written by the tlSettleWeekend Cloud Function.

import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { WeekendScore, SeasonScore } from '../types';

export const leaderboardService = {
  // The current user's running season totals (null until first settlement).
  // Shown on the weekend-wrap recap so week-to-week trend is visible.
  async getMySeason(userId: string, seasonId: string): Promise<SeasonScore | null> {
    const snap = await getDoc(doc(db, 'tl_season_scores', `${userId}_${seasonId}`));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as SeasonScore) : null;
  },

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

  // Every settled weekend for one player in a season, newest round first.
  // Equality-only filters (no orderBy) so no composite index is needed; the
  // handful of rounds per season sorts client-side.
  async getMemberWeekends(userId: string, seasonId: string): Promise<WeekendScore[]> {
    const q = query(
      collection(db, 'tl_weekend_scores'),
      where('userId', '==', userId),
      where('seasonId', '==', seasonId)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as WeekendScore)
      .sort((a, b) => b.round - a.round);
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
