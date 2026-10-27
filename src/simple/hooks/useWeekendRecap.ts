import { useEffect, useMemo, useCallback, useState } from 'react';
import { useRaceScoresStore } from '../../store/raceScores.store';
import { useRemoteConfigStore } from '../../store/remoteConfig.store';
import { usePrefsStore } from '../../store/prefs.store';
import { useLeagueStore } from '../../store/league.store';
import { useSimpleTeam } from './useSimpleTeam';
import { useAuthStore } from '../../store/auth.store';
import { useMoonshotStore } from '../../store/moonshot.store';
import { useMoonshotConfig } from './useMoonshotConfig';
import { useLockoutStatus } from '../../hooks/useLockoutStatus';
import { recapMoonshot, type MoonshotCall } from '../grid/moonshot';
import { getRaceSnapshot } from '../../services/raceSnapshots.service';
import { readLeagueRaceResult } from './useRoundReport';
import type { LeagueRaceResultDoc } from '../grid/raceLeaderboard';
import { nextRoundLines, recapStanding, recapTitle, rosterFromSnapshot, rosterFromTeam, type NextRound, type RaceSnapshot, type RecapRoster, type RecapStanding } from '../grid/weekendRecap';

export interface WeekendRecap {
  raceId: string;
  raceName: string;
  /** "UNITED STATES": the race name without the series' own words */
  title: string;
  round: number | null;
  /** points from this team's roster for the race: the server's record when there is one */
  teamPoints: number;
  /** F-130: the weekend pick by pick as it was scored, with what was fielded and what was not */
  roster: RecapRoster;
  /** F-130: the round in the league and the season table after it; empty outside a league */
  standing: RecapStanding;
  /** F-130: the next round, its lock and the team's Moonshot on it */
  next: NextRound | null;
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
  const drivers = useRemoteConfigStore((s) => s.drivers);
  const constructors = useRemoteConfigStore((s) => s.constructors);
  const members = useLeagueStore((s) => s.members);
  const lastSeenRecapRaceId = usePrefsStore((s) => s.lastSeenRecapRaceId);
  const markRecapSeen = usePrefsStore((s) => s.markRecapSeen);
  // F-127: the team's Moonshot on the race. The recap can show before the Team screen has asked
  // for the season's calls, so it asks itself; the store answers one read per team and season.
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const moonshotCfg = useMoonshotConfig();
  const moonshotCalls = useMoonshotStore((s) => s.calls);
  const callsFor = useMoonshotStore((s) => s.callsFor);
  const loadMoonshotCalls = useMoonshotStore((s) => s.loadCalls);
  const lockout = useLockoutStatus();
  const lastRace = races.find((r) => r.id === lastRaceId);
  const lastRaceSeason = lastRace?.seasonId ?? null;
  const uid = user?.id ?? null;
  const teamId = team?.id ?? null;
  const leagueId = team?.leagueId ?? null;
  const recapDue = !!lastRaceId && lastSeenRecapRaceId !== lastRaceId && !!team && (team.scoredRaces || []).includes(lastRaceId);
  const callsKey = moonshotCfg.enabled && uid && teamId && lastRaceSeason ? `${uid}:${teamId}:${lastRaceSeason}` : null;
  // the key this hook has asked for and been answered on, whether or not the read succeeded
  const [askedKey, setAskedKey] = useState<string | null>(null);
  // F-130: the server's record of the weekend (the team's snapshot and the league's leaderboard),
  // read once per team and race. Not in demo mode, which has no such documents.
  const recordKey = recapDue && teamId && lastRaceId && !isDemoMode ? `${teamId}:${lastRaceId}:${leagueId ?? '-'}` : null;
  const [record, setRecord] = useState<{ key: string; snapshot: RaceSnapshot | null; result: LeagueRaceResultDoc | null } | null>(null);

  // Ensure the latest race scores are loaded.
  useEffect(() => { fetchLastRaceScores(); }, [fetchLastRaceScores]);
  useEffect(() => {
    if (!callsKey || !recapDue || !uid || !teamId || !lastRaceSeason) return;
    let current = true;
    void loadMoonshotCalls(uid, teamId, lastRaceSeason).finally(() => { if (current) setAskedKey(callsKey); });
    return () => { current = false; };
  }, [callsKey, recapDue, uid, teamId, lastRaceSeason, loadMoonshotCalls]);
  useEffect(() => {
    if (!recordKey || !teamId || !lastRaceId) return;
    let current = true;
    // A failed read is not a reason to hide the weekend: the card falls back to the roster as it
    // is now and says so. Both reads are small (one document each) and cached per session.
    Promise.all([
      getRaceSnapshot(teamId, lastRaceId).catch(() => null),
      leagueId ? readLeagueRaceResult(leagueId, lastRaceId) : Promise.resolve(null),
    ]).then(([snapshot, result]) => { if (current) setRecord({ key: recordKey, snapshot, result }); });
    return () => { current = false; };
  }, [recordKey, teamId, lastRaceId, leagueId]);
  // Shown before the calls land, the recap could be dismissed with the Moonshot still on its way,
  // and a dismissed recap never comes back. So it waits for the answer; a failed read (the store
  // keeps what it had and warns) still lets the roster recap through, without the card.
  const callsReady = !callsKey || callsFor === callsKey || askedKey === callsKey;
  const recordReady = !recordKey || record?.key === recordKey;

  const recap = useMemo<WeekendRecap | null>(() => {
    if (!team || !lastRaceId) return null;
    if (lastSeenRecapRaceId === lastRaceId) return null;            // already seen
    if (!(team.scoredRaces || []).includes(lastRaceId)) return null; // team wasn't scored for it
    if (!callsReady) return null;                                     // F-127: the Moonshot read is still out
    if (!recordReady) return null;                                    // F-130: the record is still out

    const surname = (name: string | undefined, id: string) => (name ? name.trim().split(/\s+/).slice(-1)[0] : id);
    const names = {
      driver: (id: string) => { const d = drivers.find((x) => x.id === id); return surname(d?.name, d?.shortName || id); },
      constructor: (id: string) => { const c = constructors.find((x) => x.id === id); return c?.name?.split(' ')[0] || c?.shortName || id; },
    };
    const snapshot = record?.key === recordKey ? record.snapshot : null;
    const roster = snapshot ? rosterFromSnapshot(snapshot, names) : rosterFromTeam(team, teamConstructor, lastRaceScores);
    if (roster.picks.length === 0 && !snapshot) return null;

    const raceName = lastRace?.name
      || lastRaceId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    const standing = recapStanding(record?.key === recordKey ? record.result : null, team.userId, members, team.leagueId ?? null);

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

    const nextRace = lockout.nextRace;
    const next = nextRoundLines(nextRace ? { id: nextRace.id, round: nextRace.round, name: nextRace.name, city: nextRace.city } : null, lockout.lockTime, lockout.isLocked, Date.now(), callsKey && callsFor === callsKey ? moonshotCalls : [], team.id, moonshotCfg, names.driver);

    return {
      raceId: lastRaceId,
      raceName,
      title: recapTitle(raceName),
      round: lastRace?.round ?? snapshot?.round ?? null,
      teamPoints: roster.total,
      roster,
      standing,
      next,
      rank,
      leagueSize,
      moonshot: callsKey && callsFor === callsKey ? recapMoonshot(moonshotCalls, team.id, lastRaceId) : null,
    };
  }, [team, teamConstructor, lastRaceId, lastRaceScores, lastRace, members, lastSeenRecapRaceId, callsReady, callsKey, callsFor, moonshotCalls, recordReady, record, recordKey, drivers, constructors, lockout, moonshotCfg]);

  const dismiss = useCallback(() => {
    if (lastRaceId) markRecapSeen(lastRaceId);
  }, [lastRaceId, markRecapSeen]);

  return { recap, dismiss };
}
