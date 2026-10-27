import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { toRaceSnapshot, type RaceSnapshot } from '../simple/grid/weekendRecap';

/**
 * One document read: the team's roster and points for one race weekend as scoring recorded them
 * (F-029), or null when none was written. The rules let the team's owner and its league read it.
 */
export async function getRaceSnapshot(teamId: string, raceId: string): Promise<RaceSnapshot | null> {
  const snap = await getDoc(doc(db, 'fantasyTeams', teamId, 'raceSnapshots', raceId));
  if (!snap.exists()) return null;
  return toRaceSnapshot(snap.data() as Record<string, unknown>);
}
