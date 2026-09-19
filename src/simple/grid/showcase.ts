/** Fills demo mode with the store-screenshot league (see showcaseData.ts). */
import { useAuthStore } from '../../store/auth.store';
import { useTeamStore } from '../../store/team.store';
import { useLeagueStore } from '../../store/league.store';
import { useRaceScoresStore } from '../../store/raceScores.store';
import { demoDrivers, demoConstructors } from '../../data/demoData';
import type { FantasyTeam } from '../../types';
import type { RaceScore } from '../../services/raceScores.service';
import {
  SHOWCASE_ENABLED, SHOWCASE_LEAGUE_ID, SHOWCASE_USER_NAME, SHOWCASE_TEAM_NAME, SHOWCASE_ROSTER, SHOWCASE_ACE,
  SHOWCASE_CONSTRUCTOR, SHOWCASE_BANKED, SHOWCASE_LAST, SHOWCASE_PREV, SHOWCASE_FORM, SHOWCASE_FINISH,
  showcaseLeague, showcaseMembers, showcaseTotal,
} from './showcaseData';

const LAST_ROUND = 16;

function score(entityId: string, round: number, totalPoints: number): RaceScore {
  const isDriver = entityId in SHOWCASE_FINISH;
  const [position, gridPosition] = SHOWCASE_FINISH[entityId] ?? [undefined, undefined];
  const latest = round === LAST_ROUND;
  return {
    raceId: `showcase_r${round}`, round, entityId, entityType: isDriver ? 'driver' : 'constructor',
    racePoints: Math.round(totalPoints * 0.8), qualiPoints: totalPoints - Math.round(totalPoints * 0.8), sprintPoints: 0,
    totalPoints,
    ...(isDriver && latest ? { position, gridPosition, positionsGained: (gridPosition ?? 0) - (position ?? 0) } : {}),
  } as RaceScore;
}

export function applyShowcase(): void {
  if (!SHOWCASE_ENABLED) return;
  const auth = useAuthStore.getState();
  if (!auth.isDemoMode || !auth.user) return;
  const userId = auth.user.id;
  // Team and league persist across launches; race scores do not, so all three must be in place.
  if (useTeamStore.getState().currentTeam?.id === 'showcase-team'
    && useLeagueStore.getState().currentLeague?.id === SHOWCASE_LEAGUE_ID
    && useRaceScoresStore.getState().lastRaceId === `showcase_r${LAST_ROUND}`) return;
  if (auth.user.displayName !== SHOWCASE_USER_NAME) auth.setUser({ ...auth.user, displayName: SHOWCASE_USER_NAME });

  const now = new Date();
  const drivers = SHOWCASE_ROSTER.flatMap(([id, pts, contractLength, racesHeld]) => {
    const d = demoDrivers.find((x) => x.id === id);
    if (!d) return [];
    return [{
      driverId: d.id, name: d.name, shortName: d.shortName, constructorId: d.constructorId,
      purchasePrice: d.price, currentPrice: d.price, pointsScored: pts, racesHeld, contractLength, addedAtRace: LAST_ROUND - racesHeld,
    }];
  });
  const [cid, cpts, clen, cheld] = SHOWCASE_CONSTRUCTOR;
  const c = demoConstructors.find((x) => x.id === cid);
  const spent = drivers.reduce((s, d) => s + d.purchasePrice, 0) + (c?.price ?? 0);
  const team = {
    id: 'showcase-team', userId, leagueId: SHOWCASE_LEAGUE_ID, name: SHOWCASE_TEAM_NAME,
    drivers,
    constructor: c ? { constructorId: c.id, name: c.name, purchasePrice: c.price, currentPrice: c.price, pointsScored: cpts, racesHeld: cheld, contractLength: clen, addedAtRace: LAST_ROUND - cheld } : null,
    budget: Math.max(0, 1000 - spent), totalSpent: spent, totalPoints: showcaseTotal() - SHOWCASE_BANKED, lockedPoints: SHOWCASE_BANKED,
    isLocked: false, lockStatus: { isSeasonLocked: false, seasonLockRacesRemaining: 0, canModify: true },
    createdAt: now, updatedAt: now, aceDriverId: SHOWCASE_ACE,
    racesSinceTransfer: 2, racesPlayed: LAST_ROUND, pointsHistory: [88, 121, 97, 134, 162], joinedAtRace: 0, raceWins: 3,
    bestRacePoints: 162, bestRaceId: 'madrid_2026',
  } as unknown as FantasyTeam;
  useTeamStore.setState({ currentTeam: team, userTeams: [team] } as never);

  const league = showcaseLeague(userId);
  useLeagueStore.setState({ leagues: [league], currentLeague: league, members: showcaseMembers(SHOWCASE_LEAGUE_ID, userId) ?? [] } as never);

  const last: Record<string, RaceScore> = {};
  const prev: Record<string, RaceScore> = {};
  const history: Record<string, RaceScore[]> = {};
  for (const id of Object.keys(SHOWCASE_LAST)) {
    last[id] = score(id, LAST_ROUND, SHOWCASE_LAST[id]);
    prev[id] = score(id, LAST_ROUND - 1, SHOWCASE_PREV[id]);
    history[id] = SHOWCASE_FORM[id].map((pts, i) => score(id, LAST_ROUND - 4 + i, pts));
  }
  // Every other driver and constructor gets a plausible last-two-races pair so Pick Team shows trends throughout.
  const others = [...demoDrivers.map((d) => d.id), ...demoConstructors.map((x) => x.id)].filter((id) => !(id in SHOWCASE_LAST));
  others.forEach((id, i) => {
    const isDriver = demoDrivers.some((d) => d.id === id);
    const base = isDriver ? 6 + ((i * 37) % 52) : 30 + ((i * 29) % 70);
    const delta = ((i * 17) % 23) - 11;
    last[id] = { ...score(id, LAST_ROUND, base), entityType: isDriver ? 'driver' : 'constructor' } as RaceScore;
    prev[id] = { ...score(id, LAST_ROUND - 1, Math.max(0, base - delta)), entityType: isDriver ? 'driver' : 'constructor' } as RaceScore;
  });

  useRaceScoresStore.setState({
    lastRaceScores: last, prevRaceScores: prev, entityHistory: history,
    lastRaceId: `showcase_r${LAST_ROUND}`, prevRaceId: `showcase_r${LAST_ROUND - 1}`,
    lastFetched: Date.now() + 365 * 24 * 3600 * 1000, // never refetch: demo mode cannot read scores
    isLoading: false,
  });
}
