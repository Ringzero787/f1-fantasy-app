import { useEffect, useMemo, useCallback } from 'react';
import { useRaceScoresStore } from '../../store/raceScores.store';
import { useRemoteConfigStore } from '../../store/remoteConfig.store';
import { usePrefsStore } from '../../store/prefs.store';
import { useLeagueStore } from '../../store/league.store';
import { useSimpleTeam } from './useSimpleTeam';

export interface RecapEntity {
  name: string;
  points: number;
  isConstructor: boolean;
}

export interface WeekendRecap {
  raceId: string;
  raceName: string;
  teamPoints: number;       // points from this team's roster for the race
  entities: RecapEntity[];  // per-roster-entity, sorted high→low
  best: RecapEntity | null;
  worst: RecapEntity | null;
  rank: number | null;      // league rank (null if not in a league / not loaded)
  leagueSize: number | null;
}

/**
 * Post-weekend recap shown once per completed race on sign-in.
 *
 * Returns null unless: the latest completed race has scored, the user's team
 * was actually scored for it (team.scoredRaces includes it — so late joiners
 * aren't shown points they didn't earn), and they haven't already dismissed
 * this race's recap (persisted in prefs). Fail-silent: any missing data → null.
 */
export function useWeekendRecap(): { recap: WeekendRecap | null; dismiss: () => void } {
  const { team, teamConstructor } = useSimpleTeam();
  const lastRaceScores = useRaceScoresStore((s) => s.lastRaceScores);
  const lastRaceId = useRaceScoresStore((s) => s.lastRaceId);
  const fetchLastRaceScores = useRaceScoresStore((s) => s.fetchLastRaceScores);
  const races = useRemoteConfigStore((s) => s.races);
  const members = useLeagueStore((s) => s.members);
  const lastSeenRecapRaceId = usePrefsStore((s) => s.lastSeenRecapRaceId);
  const markRecapSeen = usePrefsStore((s) => s.markRecapSeen);

  // Ensure the latest race scores are loaded.
  useEffect(() => { fetchLastRaceScores(); }, [fetchLastRaceScores]);

  const recap = useMemo<WeekendRecap | null>(() => {
    if (!team || !lastRaceId) return null;
    if (lastSeenRecapRaceId === lastRaceId) return null;            // already seen
    if (!(team.scoredRaces || []).includes(lastRaceId)) return null; // team wasn't scored for it

    const entities: RecapEntity[] = [];
    for (const d of team.drivers || []) {
      entities.push({
        name: d.shortName || d.name || 'Driver',
        points: lastRaceScores[d.driverId]?.totalPoints ?? 0,
        isConstructor: false,
      });
    }
    if (teamConstructor) {
      entities.push({
        name: teamConstructor.name?.split(' ')[0] || 'Constructor',
        points: lastRaceScores[teamConstructor.constructorId]?.totalPoints ?? 0,
        isConstructor: true,
      });
    }
    if (entities.length === 0) return null;

    entities.sort((a, b) => b.points - a.points);
    const teamPoints = entities.reduce((sum, e) => sum + e.points, 0);

    const raceName = races.find((r) => r.id === lastRaceId)?.name
      || lastRaceId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    // Rank only if this team's league members happen to be loaded.
    let rank: number | null = null;
    let leagueSize: number | null = null;
    if (team.leagueId) {
      const mine = members.find((m) => m.userId === team.userId && m.leagueId === team.leagueId);
      if (mine) {
        rank = mine.rank ?? null;
        leagueSize = members.filter((m) => m.leagueId === team.leagueId).length || null;
      }
    }

    return {
      raceId: lastRaceId,
      raceName,
      teamPoints,
      entities,
      best: entities[0] ?? null,
      worst: entities[entities.length - 1] ?? null,
      rank,
      leagueSize,
    };
  }, [team, teamConstructor, lastRaceId, lastRaceScores, races, members, lastSeenRecapRaceId]);

  const dismiss = useCallback(() => {
    if (lastRaceId) markRecapSeen(lastRaceId);
  }, [lastRaceId, markRecapSeen]);

  return { recap, dismiss };
}
