import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { LeagueRaceResultDoc } from '../simple/grid/raceLeaderboard';

/** One document read: the league's leaderboard for one race (F-062), or null if none was written. */
export async function getLeagueRaceResult(leagueId: string, raceId: string): Promise<LeagueRaceResultDoc | null> {
  const snap = await getDoc(doc(db, 'leagues', leagueId, 'raceResults', raceId));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    raceId,
    season: d.season ?? null,
    round: d.round ?? null,
    raceName: d.raceName ?? null,
    entries: Array.isArray(d.entries) ? d.entries : [],
    winners: Array.isArray(d.winners) ? d.winners : [],
    topPoints: d.topPoints ?? null,
    estimated: d.estimated === true,
  };
}
