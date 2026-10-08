/**
 * The league a team is in, as a standings table (F-114). Pure: the Firestore reads live in
 * lib/leagueApi.ts. The order mirrors the server's `orderMembers` (functions/src/scoring/
 * standingsFields.ts): season total descending, then last race, then id — and the rank shown is
 * the position in that order, the way the app's league screen shows it. Movement compares two
 * SERVER-written ranks (`previousRank` − `rank`, stamped once per race over every member document,
 * pending ones included), never the client's filtered index — a pending member ranked above you
 * would otherwise hand everyone below a fake climb (the app's standings.ts makes the same point).
 * A first-time member has no `previousRank` and shows no arrow.
 */

/** `leagues/{id}/members/{uid}` as read, every field unknown until checked. */
export interface MemberDoc { id: string; [k: string]: unknown }
/** The slice of `fantasyTeams` a league member may list: the league's teams. */
export interface TeamInLeague { id: string; userId: string; name: string; moonshotPoints: number }

export interface StandingRow {
  userId: string;
  teamId: string | null;
  team: string;
  manager: string;
  rank: number;
  /** places gained since the last race (positive = up); null when the server has not stamped one */
  move: number | null;
  points: number;
  lastRace: number | null;
  moonshot: number;
  wins: number;
  me: boolean;
}

export interface LeagueStandings { id: string; name: string; size: number; max: number | null; rows: StandingRow[]; me: StandingRow | null }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Members who count: a join awaiting approval and a withdrawn member are not in the table. */
export const counts = (m: MemberDoc): boolean => m.status !== 'pending' && m.isWithdrawn !== true;

export function standingsRows(members: MemberDoc[], teams: TeamInLeague[], uid: string | null): StandingRow[] {
  // first-seen wins, as the app's league screen does, for a player with two teams in one league
  const byUser = new Map<string, TeamInLeague>();
  for (const t of teams) if (!byUser.has(t.userId)) byUser.set(t.userId, t);
  const rows = members.filter(counts).map((m) => {
    const t = byUser.get(m.id) ?? null;
    return {
      userId: m.id,
      teamId: t?.id ?? null,
      team: t?.name || str(m.teamName) || 'Team',
      manager: str(m.displayName) || 'Manager',
      rank: 0,
      move: null as number | null,
      prev: num(m.previousRank),
      srv: num(m.rank),
      points: num(m.totalPoints) ?? 0,
      lastRace: num(m.lastRacePoints),
      moonshot: num(m.moonshotPoints) ?? t?.moonshotPoints ?? 0,   // the member document is what the app shows; the team is the fallback
      wins: num(m.raceWins) ?? 0,
      me: uid != null && m.id === uid,
    };
  });
  rows.sort((a, b) => b.points - a.points || (b.lastRace ?? 0) - (a.lastRace ?? 0) || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
  return rows.map(({ prev, srv, ...r }, i) => ({ ...r, rank: i + 1, move: prev == null || srv == null ? null : prev - srv }));
}

export function buildStandings(league: { id: string; name: string; maxMembers: number | null }, members: MemberDoc[], teams: TeamInLeague[], uid: string | null): LeagueStandings {
  const rows = standingsRows(members, teams, uid);
  return { id: league.id, name: league.name || 'League', size: rows.length, max: league.maxMembers, rows, me: rows.find((r) => r.me) ?? null };
}

/** The rows a collapsed tile shows: the top `top`, plus the viewer's own row when it sits below them. */
export function visibleRows(rows: StandingRow[], expanded: boolean, top = 5): StandingRow[] {
  if (expanded || rows.length <= top) return rows;
  const head = rows.slice(0, top);
  const me = rows.find((r) => r.me);
  return me && !head.includes(me) ? [...head, me] : head;
}

/** "▲2", "▼1", "—" or "" (no stamp yet). */
export const moveLabel = (move: number | null): string => (move == null ? '' : move === 0 ? '—' : move > 0 ? `▲${move}` : `▼${-move}`);

/** The example league the preview renders — ten teams, as the example payload's league line says: never a request. */
export function exampleStandings(): LeagueStandings {
  const members: MemberDoc[] = [
    { id: 'ex-t2', displayName: 'Priya', totalPoints: 300, rank: 1, previousRank: 2, lastRacePoints: 41, raceWins: 3 },
    { id: 'ex-me', displayName: 'You', totalPoints: 267, rank: 2, previousRank: 1, lastRacePoints: 18, moonshotPoints: 60 },
    { id: 'ex-t3', displayName: 'Marco', totalPoints: 200, rank: 3, previousRank: 3, lastRacePoints: 22 },
    ...['Ana', 'Theo', 'Sam', 'Lena', 'Kai', 'Noor', 'Eli'].map((n, i) => ({ id: `ex-${n.toLowerCase()}`, displayName: n, totalPoints: 190 - i * 17, rank: 4 + i, previousRank: 4 + i, lastRacePoints: 9 + i })),
  ];
  const teams: TeamInLeague[] = [
    { id: 'ex-t2', userId: 'ex-t2', name: 'Turn One', moonshotPoints: 0 },
    { id: 'ex-me', userId: 'ex-me', name: 'Late Brakers', moonshotPoints: 60 },
    { id: 'ex-t3', userId: 'ex-t3', name: 'Backmarkers', moonshotPoints: -40 },
    ...[['ana', 'Apex Hunters'], ['theo', 'Box Box'], ['sam', 'Slipstream'], ['lena', 'DRS Club'], ['kai', 'Hard Tyres'], ['noor', 'Lights Out'], ['eli', 'Parc Fermé']].map(([u, name]) => ({ id: `ex-${u}`, userId: `ex-${u}`, name, moonshotPoints: 0 })),
  ];
  return buildStandings({ id: 'example', name: 'Sunday Drivers', maxMembers: 12 }, members, teams, 'ex-me');
}
