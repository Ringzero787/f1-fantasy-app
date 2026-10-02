/**
 * Store-screenshot showcase data — pure, no store imports.
 *
 * Demo mode starts empty (zero points, a one-player league), which makes poor
 * store screenshots. A verification build made with EXPO_PUBLIC_ALLOW_DEMO=1
 * AND EXPO_PUBLIC_SHOWCASE=1 fills demo mode with this fictional league. The
 * release scripts refuse EXPO_PUBLIC_ALLOW_DEMO=1, so it cannot reach a store
 * build. Every player, team and league name here is made up.
 */
import type { League, LeagueMember } from '../../types';
import type { LeagueRaceResultDoc } from './raceLeaderboard';

export const SHOWCASE_ENABLED =
  process.env.EXPO_PUBLIC_SHOWCASE === '1' && process.env.EXPO_PUBLIC_ALLOW_DEMO === '1';

export const SHOWCASE_LEAGUE_ID = 'showcase-league';
export const SHOWCASE_USER_NAME = 'Alex Morgan';
export const SHOWCASE_TEAM_NAME = 'Late Brakers';

/** [driverId, season points for this team, contract length, races held] */
export const SHOWCASE_ROSTER: Array<[string, number, number, number]> = [
  ['hadjar', 212, 4, 2],
  ['colapinto', 148, 5, 2],
  ['gasly', 96, 6, 2],
  ['antonelli', 301, 5, 2],
  ['hamilton', 187, 3, 2],
];
export const SHOWCASE_ACE = 'hadjar';
export const SHOWCASE_CONSTRUCTOR: [string, number, number, number] = ['red_bull', 264, 5, 2];
export const SHOWCASE_BANKED = 236;

/** last race / race before, fantasy points per entity */
export const SHOWCASE_LAST: Record<string, number> = { hadjar: 38, colapinto: 41, gasly: 24, antonelli: 73, hamilton: 12, red_bull: 106 };
export const SHOWCASE_PREV: Record<string, number> = { hadjar: 29, colapinto: 18, gasly: 31, antonelli: 55, hamilton: 27, red_bull: 88 };
/** five-round form, oldest first (rounds 12–16) */
export const SHOWCASE_FORM: Record<string, number[]> = {
  hadjar: [22, 31, 17, 29, 38],
  colapinto: [9, 14, 26, 18, 41],
  gasly: [19, 8, 22, 31, 24],
  antonelli: [48, 36, 61, 55, 73],
  hamilton: [33, 41, 20, 27, 12],
  red_bull: [71, 64, 93, 88, 106],
};
export const SHOWCASE_FINISH: Record<string, [number, number]> = {
  hadjar: [6, 9], colapinto: [5, 11], gasly: [9, 10], antonelli: [2, 3], hamilton: [12, 8],
};

const OTHERS: Array<[string, string, number, number, number, number]> = [
  // displayName, teamName, season points, previous rank, race wins, points in the last race
  ['Sam Okafor', 'Box Box Box', 1512, 1, 5, 268],
  ['Priya Nair', 'Slipstream Society', 1391, 4, 3, 301],
  ['Jonas Weber', 'Gravel Trap', 1377, 2, 2, 143],
  ['Maya Castillo', 'Undercut Kings', 1298, 5, 2, 211],
  ['Tom Becker', 'Purple Sectors', 1204, 7, 1, 257],
  ['Hana Sato', 'Blue Flags', 1187, 6, 0, 122],
  ['Leo Marchetti', 'Pit Lane Poets', 1033, 8, 0, 97],
];

export function showcaseTotal(): number {
  return SHOWCASE_ROSTER.reduce((s, r) => s + r[1], 0) + SHOWCASE_CONSTRUCTOR[1] + SHOWCASE_BANKED;
}

export function showcaseLeague(ownerId: string): League {
  const now = new Date();
  return {
    id: SHOWCASE_LEAGUE_ID,
    name: 'Sunday Drivers',
    ownerId,
    ownerName: SHOWCASE_USER_NAME,
    inviteCode: 'SUNDAY26',
    isPublic: false,
    maxMembers: 22,
    memberCount: OTHERS.length + 1,
    seasonId: '2026',
    createdAt: now,
    updatedAt: now,
    settings: { allowLateJoin: true, lockDeadline: 'qualifying' } as League['settings'],
  };
}

/** Standings with the viewer second, up one place, and movement in both directions below. */
export function showcaseMembers(leagueId: string, userId: string): LeagueMember[] | null {
  if (!SHOWCASE_ENABLED || leagueId !== SHOWCASE_LEAGUE_ID) return null;
  const joinedAt = new Date('2026-03-01T00:00:00Z');
  const rows: LeagueMember[] = [
    ...OTHERS.map(([displayName, teamName, totalPoints, previousRank, raceWins, lastRacePoints], i) => ({
      id: `showcase-${i}`, leagueId, userId: `showcase-${i}`, displayName, teamName,
      role: 'member' as const, totalPoints, rank: 0, previousRank, joinedAt, racesPlayed: 16, raceWins, lastRacePoints,
    })),
    {
      id: userId, leagueId, userId, displayName: SHOWCASE_USER_NAME, teamName: SHOWCASE_TEAM_NAME,
      role: 'owner' as const, totalPoints: showcaseTotal(), rank: 0, previousRank: 3, joinedAt, racesPlayed: 16, raceWins: 3, lastRacePoints: 294,
    },
  ];
  rows.sort((a, b) => b.totalPoints - a.totalPoints);
  rows.forEach((m, i) => { m.rank = i + 1; });
  return rows;
}

/** The one round the showcase league has a leaderboard for. */
export const SHOWCASE_RESULT_ROUND = 16;

/** The latest race's leaderboard for the showcase league (F-062); other races have none. */
export function showcaseRaceResult(leagueId: string, userId: string, round: number): LeagueRaceResultDoc | null {
  const members = showcaseMembers(leagueId, userId);
  if (!members || round !== SHOWCASE_RESULT_ROUND) return null;
  const sorted = members.map((m) => ({ userId: m.userId, displayName: m.displayName, teamName: m.teamName ?? null, points: m.lastRacePoints ?? 0 })).sort((a, b) => b.points - a.points);
  const entries = sorted.map((e, i) => ({ ...e, rank: i > 0 && sorted[i - 1].points === e.points ? i : i + 1 }));
  return { raceId: `showcase_r${round}`, season: '2026', round, entries, winners: entries.filter((e) => e.points === entries[0].points).map((e) => e.userId), topPoints: entries[0].points, estimated: false };
}

/**
 * Pit Wall projections for the showcase (F-084).
 *
 * A pass-holder screen cannot be seen, screenshotted or reviewed without a pass, and a real pass
 * means real money and a real account. This is the fixture that makes the paid experience visible
 * in demo mode. It is shaped exactly like what the worker publishes, so what is on screen here is
 * what a buyer sees.
 *
 * Gated behind SHOWCASE_ENABLED, which needs two environment variables the store build scripts
 * refuse, so it cannot reach anybody who paid.
 */
export const SHOWCASE_PROJECTION_ROUNDS = ['SINGAPORE', 'AUSTIN', 'MEXICO', 'BRAZIL', 'VEGAS', 'QATAR'];

export const showcaseProjections = () => ({
  round: SHOWCASE_RESULT_ROUND,
  asOf: new Date().toISOString(),
  rounds: SHOWCASE_PROJECTION_ROUNDS,
  byId: Object.fromEntries(
    [
      { id: 'antonelli', med: 58, floor: 41, ceil: 77, dnf: 9, win: 22, pod: 54, t10: 91, val: 19.4, price: 29.8, dprice: 0.4, ptsRise: 46, ptsHold: 31, pRise: 61, pFall: 12, own: 73, fit: [4, 5, 3, 2, 4, 1], mix: { race: 180, quali: 44, sprint: 12, fl: 4 }, splits: [{ cls: 'street-high', label: 'Street · high speed', n: 4, avg: 46.5 }, { cls: 'perm-med', label: 'Permanent · medium', n: 7, avg: 38.1 }] },
      { id: 'hadjar', med: 44, floor: 26, ceil: 63, dnf: 13, win: 6, pod: 28, t10: 79, val: 21.2, price: 20.8, dprice: 0.6, ptsRise: 39, ptsHold: 22, pRise: 58, pFall: 14, own: 41, fit: [5, 3, 4, 3, 2, 4], mix: { race: 148, quali: 51, sprint: 11, fl: 2 }, splits: [{ cls: 'street-high', label: 'Street · high speed', n: 4, avg: 41.0 }, { cls: 'perm-low', label: 'Permanent · low speed', n: 5, avg: 33.4 }] },
      { id: 'colapinto', med: 31, floor: 14, ceil: 49, dnf: 15, win: 0, pod: 9, t10: 58, val: 18.3, price: 16.9, dprice: -0.3, ptsRise: 34, ptsHold: 17, pRise: 27, pFall: 38, own: 24, fit: [3, 4, 2, 3, 3, 2], mix: { race: 102, quali: 33, sprint: 8, fl: 1 }, splits: [{ cls: 'perm-med', label: 'Permanent · medium', n: 6, avg: 28.2 }] },
      { id: 'gasly', med: 24, floor: 8, ceil: 42, dnf: 18, win: 0, pod: 4, t10: 46, val: 15.1, price: 15.9, dprice: -0.5, ptsRise: 31, ptsHold: 12, pRise: 16, pFall: 47, own: 11, fit: [2, 2, 1, 3, 2, 2], mix: { race: 71, quali: 19, sprint: 5, fl: 1 }, splits: [{ cls: 'street-low', label: 'Street · low speed', n: 3, avg: 19.7 }] },
      { id: 'hamilton', med: 39, floor: 19, ceil: 58, dnf: 12, win: 3, pod: 19, t10: 71, val: 16.4, price: 23.8, dprice: 0.2, ptsRise: 42, ptsHold: 25, pRise: 44, pFall: 21, own: 56, fit: [4, 3, 3, 4, 3, 3], mix: { race: 131, quali: 42, sprint: 9, fl: 5 }, splits: [{ cls: 'perm-high', label: 'Permanent · high speed', n: 6, avg: 37.8 }] },
      { id: 'red_bull', med: 71, floor: 44, ceil: 98, dnf: 10, win: 0, pod: 0, t10: 0, val: 14.9, price: 47.6, dprice: 1.1, ptsRise: 68, ptsHold: 44, pRise: 52, pFall: 11, own: 81, fit: [4, 4, 5, 3, 4, 4], mix: { race: 232, quali: 68, sprint: 21, fl: 7 }, splits: [{ cls: 'perm-high', label: 'Permanent · high speed', n: 6, avg: 66.0 }] },
    ].map((d) => [d.id, { ...d, form: [] }]),
  ),
});
