/** The viewer's league document for a round (F-072); null when there is none or the rules refuse it. */
import { firestore } from './firebase';
import type { LeagueDoc } from '../data/league';

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export async function loadLeagueDoc(leagueId: string, season: string, round: number): Promise<LeagueDoc | null> {
  try {
    const { m, db } = await firestore();
    const snap = await m.getDoc(m.doc(db, 'pw_leagues', `${leagueId}_${season}_${round}`));
    if (!snap.exists()) return null;
    const x = snap.data() as Record<string, unknown>;
    const ownership: Record<string, number> = {};
    for (const [id, v] of Object.entries((x.ownership && typeof x.ownership === 'object' ? x.ownership : {}) as Record<string, unknown>)) ownership[id] = Math.max(0, Math.min(100, num(v)));
    const teams = (Array.isArray(x.teams) ? x.teams : []).map((t: Record<string, any>) => ({
      id: str(t?.id), name: str(t?.name) || 'Team', rank: num(t?.rank), points: num(t?.points), bank: num(t?.bank), activity: Math.max(0, Math.min(1, num(t?.activity))),
      lineup: { drivers: (Array.isArray(t?.lineup?.drivers) ? t.lineup.drivers : []).filter((d: unknown): d is string => typeof d === 'string'), ctor: str(t?.lineup?.ctor), ace: str(t?.lineup?.ace) },
    })).filter((t) => t.id);
    return { leagueId: str(x.leagueId) || leagueId, round: num(x.round), name: str(x.name) || 'League', size: num(x.size) || teams.length, ownership, teams };
  } catch {
    return null;
  }
}
