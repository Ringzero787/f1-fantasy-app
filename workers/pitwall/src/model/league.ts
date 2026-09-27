/**
 * One document per league per round (F-072 rivals, F-070 ownership): who holds what, and each
 * team's lineup, bank and how often its manager edits. Readable by the league's members only,
 * which is who the app already shows these lineups to; nothing here is published wider.
 *
 * Ownership is the share of the league's teams holding an entity. Rank follows the app's own
 * order (points, then last race, then id). Activity is how recently the manager last traded,
 * on the app's `racesSinceTransfer`: 1 for a trade this round, falling to 0.1 after ten quiet ones.
 *
 * Pure.
 */
export interface LeagueTeam {
  id: string; userId: string; name: string;
  totalPoints: number; lastRacePoints: number; budget: number; racesSinceTransfer: number;
  drivers: string[]; ctor: string; ace: string;
}
export interface LeagueDocTeam { id: string; name: string; rank: number; points: number; bank: number; activity: number; lineup: { drivers: string[]; ctor: string; ace: string } }
export interface LeagueDoc {
  leagueId: string; season: string; round: number; name: string; size: number; asOf: string;
  /** entity id -> share of the league's teams holding it, 0..100 */
  ownership: Record<string, number>;
  teams: LeagueDocTeam[];
}

export const activityOf = (racesSinceTransfer: number): number => Math.max(0.1, Math.min(1, 1 - Math.max(0, racesSinceTransfer) / 10));

export function buildLeagueDoc(league: { id: string; name: string }, teams: LeagueTeam[], meta: { season: string; round: number; asOf: Date }): LeagueDoc {
  const ordered = [...teams].sort((a, b) => (b.totalPoints - a.totalPoints) || (b.lastRacePoints - a.lastRacePoints) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const held = new Map<string, number>();
  for (const t of teams) for (const id of [...t.drivers, t.ctor].filter(Boolean)) held.set(id, (held.get(id) ?? 0) + 1);
  const ownership: Record<string, number> = {};
  for (const [id, n] of held) ownership[id] = Math.round((n / Math.max(1, teams.length)) * 100);
  return {
    leagueId: league.id, season: meta.season, round: meta.round, name: league.name, size: teams.length, asOf: meta.asOf.toISOString(),
    ownership,
    teams: ordered.map((t, i) => ({ id: t.id, name: t.name, rank: i + 1, points: t.totalPoints, bank: Math.round(t.budget), activity: Math.round(activityOf(t.racesSinceTransfer) * 100) / 100, lineup: { drivers: t.drivers, ctor: t.ctor, ace: t.ace } })),
  };
}
