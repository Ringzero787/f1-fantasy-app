/** The viewer's league document for a round (F-072); null when there is none or the rules refuse it. */
import { firestore } from './firebase';
import type { LeagueDoc } from '../data/league';
import { buildStandings, type LeagueStandings, type MemberDoc, type TeamInLeague } from '../data/leagueStandings';

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

/**
 * The league itself, as the app's league screen reads it (F-114): the document, its members and
 * the league's teams — all readable by a league member under the rules (fantasyTeams by leagueId
 * is one of the two list shapes F-112 left open). Null when the rules refuse or anything fails.
 */
export async function loadLeagueStandings(leagueId: string, uid: string): Promise<LeagueStandings | null> {
  try {
    const { m, db } = await firestore();
    // the members query orders by totalPoints, so a document with no such key is not returned at
    // all (the rules require it on create); the teams read is the one that may be refused without
    // losing the table — member documents carry teamName and moonshotPoints themselves
    const [league, members, teams] = await Promise.all([
      m.getDoc(m.doc(db, 'leagues', leagueId)),
      m.getDocs(m.query(m.collection(db, 'leagues', leagueId, 'members'), m.orderBy('totalPoints', 'desc'), m.limit(100))),
      m.getDocs(m.query(m.collection(db, 'fantasyTeams'), m.where('leagueId', '==', leagueId), m.limit(100))).catch(() => null),
    ]);
    if (!league.exists()) return null;
    const x = league.data() as Record<string, unknown>;
    const memberDocs: MemberDoc[] = members.docs.map((d) => ({ ...(d.data() as Record<string, unknown>), id: d.id }));
    const teamDocs: TeamInLeague[] = (teams?.docs ?? []).map((d) => { const t = d.data() as Record<string, unknown>; return { id: d.id, userId: str(t.userId), name: str(t.name), moonshotPoints: num(t.moonshotPoints) }; }).filter((t) => t.userId);
    return buildStandings({ id: leagueId, name: str(x.name), maxMembers: typeof x.maxMembers === 'number' ? x.maxMembers : null }, memberDocs, teamDocs, uid);
  } catch {
    return null;
  }
}
