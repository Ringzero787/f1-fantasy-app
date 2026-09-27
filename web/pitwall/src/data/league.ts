/**
 * Merging the viewer's league document into the payload (F-072). The worker publishes one
 * document per league per round; the rules show it only to the league's members. Here it fills
 * the three things the payload leaves empty for everyone: the league line, the rivals, and each
 * entity's league ownership. Pure.
 */
import type { Payload, Rival } from './types';

export interface LeagueDoc {
  leagueId: string; round: number; name: string; size: number;
  ownership: Record<string, number>;
  teams: Array<{ id: string; name: string; rank: number; points: number; bank: number; activity: number; lineup: { drivers: string[]; ctor: string; ace: string } }>;
}

export function withLeague(p: Payload, doc: LeagueDoc | null, myTeamId: string | null): Payload {
  // the document is for one round; a stale one must not describe this one
  if (!doc || doc.round !== p.round.number || p.example) return p;
  const me = doc.teams.find((t) => t.id === myTeamId);
  const rivals: Rival[] = doc.teams.filter((t) => t.id !== myTeamId).map((t) => ({
    name: t.name, rank: t.rank, gap: me ? t.points - me.points : 0, lineup: t.lineup.drivers, bank: t.bank, activity: t.activity,
  }));
  return {
    ...p,
    league: { name: doc.name, size: doc.size, myRank: me?.rank ?? 0 },
    rivals,
    drivers: p.drivers.map((d) => ({ ...d, own: doc.ownership[d.id] ?? 0 })),
  };
}
