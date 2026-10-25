import { useEffect, useMemo, useCallback, useState } from 'react';
import { useRaceScoresStore } from '../../store/raceScores.store';
import { useRemoteConfigStore } from '../../store/remoteConfig.store';
import { usePrefsStore } from '../../store/prefs.store';
import { useLeagueStore } from '../../store/league.store';
import { useSimpleTeam } from './useSimpleTeam';
import { useAuthStore } from '../../store/auth.store';
import { useMoonshotStore } from '../../store/moonshot.store';
import { useMoonshotConfig } from './useMoonshotConfig';
import { recapMoonshot, type MoonshotCall } from '../grid/moonshot';

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
  /** F-127: this team's Moonshot on the race once it has settled; null while open, or when there was none */
  moonshot: MoonshotCall | null;
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
  // F-127: the team's Moonshot on the race. The recap can show before the Team screen has asked
  // for the season's calls, so it asks itself; the store answers one read per team and season.
  const user = useAuthStore((s) => s.user);
  const moonshotCfg = useMoonshotConfig();
  const moonshotCalls = useMoonshotStore((s) => s.calls);
  const callsFor = useMoonshotStore((s) => s.callsFor);
  const loadMoonshotCalls = useMoonshotStore((s) => s.loadCalls);
  const lastRace = races.find((r) => r.id === lastRaceId);
  const lastRaceSeason = lastRace?.seasonId ?? null;
  const uid = user?.id ?? null;
  const teamId = team?.id ?? null;
  const recapDue = !!lastRaceId && lastSeenRecapRaceId !== lastRaceId && !!team && (team.scoredRaces || []).includes(lastRaceId);
  const callsKey = moonshotCfg.enabled && uid && teamId && lastRaceSeason ? `${uid}:${teamId}:${lastRaceSeason}` : null;
  // the key this hook has asked for and been answered on, whether or not the read succeeded
  const [askedKey, setAskedKey] = useState<string | null>(null);

  // Ensure the latest race scores are loaded.
  useEffect(() => { fetchLastRaceScores(); }, [fetchLastRaceScores]);
  useEffect(() => {
    if (!callsKey || !recapDue || !uid || !teamId || !lastRaceSeason) return;
    let current = true;
    void loadMoonshotCalls(uid, teamId, lastRaceSeason).finally(() => { if (current) setAskedKey(callsKey); });
    return () => { current = false; };
  }, [callsKey, recapDue, uid, teamId, lastRaceSeason, loadMoonshotCalls]);
  // Shown before the calls land, the recap could be dismissed with the Moonshot still on its way,
  // and a dismissed recap never comes back. So it waits for the answer; a failed read (the store
  // keeps what it had and warns) still lets the roster recap through, without the card.
  const callsReady = !callsKey || callsFor === callsKey || askedKey === callsKey;

  const recap = useMemo<WeekendRecap | null>(() => {
    if (!team || !lastRaceId) return null;
    if (lastSeenRecapRaceId === lastRaceId) return null;            // already seen
    if (!(team.scoredRaces || []).includes(lastRaceId)) return null; // team wasn't scored for it
    if (!callsReady) return null;                                     // F-127: the Moonshot read is still out

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

    const raceName = lastRace?.name
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
      moonshot: callsKey && callsFor === callsKey ? recapMoonshot(moonshotCalls, team.id, lastRaceId) : null,
    };
  }, [team, teamConstructor, lastRaceId, lastRaceScores, lastRace, members, lastSeenRecapRaceId, callsReady, callsKey, callsFor, moonshotCalls]);

  const dismiss = useCallback(() => {
    if (lastRaceId) markRecapSeen(lastRaceId);
  }, [lastRaceId, markRecapSeen]);

  return { recap, dismiss };
}
