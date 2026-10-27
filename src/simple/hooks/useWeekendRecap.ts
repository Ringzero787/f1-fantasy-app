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
import { constructorShortName } from '../grid/entityNames';
import type { LeagueRaceResultDoc } from '../grid/raceLeaderboard';
import { nextRoundLines, recapStanding, recapTitle, rosterFromSnapshot, rosterFromTeam, type NextRound, type RaceSnapshot, type RecapRoster, type RecapStanding } from '../grid/weekendRecap';

export interface WeekendRecap {
  raceId: string;
  raceName: string;
  /** "UNITED STATES": the race name without the series' own words */
  title: string;
  round: number | null;
  /** F-130: the team this recap is about, so a two-team player knows which one they are reading */
  teamName: string;
  teamIndex: number;
  teamCount: number;
  /** F-130: the player's other team, when it has a recap of its own for this race still to see */
  nextTeam: { index: number; name: string } | null;
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

/** How long to wait for a leaderboard that scoring writes a moment after the team's snapshot. */
const RESULT_RETRY_MS = 4000;

/**
 * Post-weekend recap shown once per completed race on sign-in — once per team (F-130): a
 * two-team player gets each team's own weekend, and the card names the team.
 *
 * Returns null unless: the latest completed race has scored, the user's team
 * was actually scored for it (team.scoredRaces includes it — so late joiners
 * aren't shown points they didn't earn), and they haven't already dismissed
 * this race's recap for this team (persisted in prefs). Fail-silent: any missing data → null.
 */
export function useWeekendRecap(): { recap: WeekendRecap | null; dismiss: () => void; showTeam: (index: number) => void } {
  const { team, teamConstructor, teamCount, activeTeamIndex, switchTeam, leagueTeams: userTeams } = useSimpleTeam();
  const lastRaceScores = useRaceScoresStore((s) => s.lastRaceScores);
  const lastRaceId = useRaceScoresStore((s) => s.lastRaceId);
  const fetchLastRaceScores = useRaceScoresStore((s) => s.fetchLastRaceScores);
  const races = useRemoteConfigStore((s) => s.races);
  const drivers = useRemoteConfigStore((s) => s.drivers);
  const constructors = useRemoteConfigStore((s) => s.constructors);
  // the config as a signed-in reader gets it: before that, Moonshot reads as off (see ensureSignedInConfig)
  const configLoaded = useRemoteConfigStore((s) => s.isLoaded && s.fetchedSignedIn);
  const members = useLeagueStore((s) => s.members);
  const seenRecaps = usePrefsStore((s) => s.seenRecaps);
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
  // F-130: seen is per team, so the second team's recap is not lost when the first is dismissed
  const seenForTeam = teamId ? seenRecaps[teamId] ?? null : null;
  const recapDue = !!lastRaceId && seenForTeam !== lastRaceId && !!team && (team.scoredRaces || []).includes(lastRaceId);
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
    let timer: ReturnType<typeof setTimeout> | null = null;
    // A failed read is not a reason to hide the weekend: the card falls back to the roster as it
    // is now and says so. Both reads are small (one document each) and cached per session.
    const read = () => Promise.all([
      getRaceSnapshot(teamId, lastRaceId).catch(() => null),
      leagueId ? readLeagueRaceResult(leagueId, lastRaceId) : Promise.resolve(null),
    ]);
    read().then(([snapshot, result]) => {
      if (!current) return;
      // Scoring writes the team's snapshot first and the league's leaderboard a moment later. A
      // player with the app open at that moment would get a card with no round line and never see
      // it again, so a missing leaderboard is asked for once more before the card is shown.
      if (leagueId && snapshot && !result) {
        timer = setTimeout(() => { read().then(([s2, r2]) => { if (current) setRecord({ key: recordKey, snapshot: s2 ?? snapshot, result: r2 }); }); }, RESULT_RETRY_MS);
        return;
      }
      setRecord({ key: recordKey, snapshot, result });
    });
    return () => { current = false; if (timer) clearTimeout(timer); };
  }, [recordKey, teamId, lastRaceId, leagueId]);
  // Shown before the calls land, the recap could be dismissed with the Moonshot still on its way,
  // and a dismissed recap never comes back. So it waits for the answer; a failed read (the store
  // keeps what it had and warns) still lets the roster recap through, without the card.
  const callsReady = !callsKey || callsFor === callsKey || askedKey === callsKey;
  const recordReady = !recordKey || record?.key === recordKey;

  const recap = useMemo<WeekendRecap | null>(() => {
    if (!team || !lastRaceId) return null;
    if (seenForTeam === lastRaceId) return null;                       // already seen, for this team
    if (!(team.scoredRaces || []).includes(lastRaceId)) return null; // team wasn't scored for it
    // F-130: the Moonshot config decides whether the calls are asked for at all. Before it has
    // loaded, Moonshot reads as off and the card would show without the Moonshot the player made.
    if (!configLoaded && !isDemoMode) return null;
    if (!callsReady) return null;                                     // F-127: the Moonshot read is still out
    if (!recordReady) return null;                                    // F-130: the record is still out

    const surname = (name: string | undefined, id: string) => (name ? name.trim().split(/\s+/).slice(-1)[0] : id);
    const names = {
      driver: (id: string) => { const d = drivers.find((x) => x.id === id); return surname(d?.name, d?.shortName || id); },
      // the grid's short constructor names (entityNames), never the series' own words from the data
      constructor: (id: string) => constructorShortName(id, constructors.find((x) => x.id === id)?.name || id),
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

    const callsKnown = callsKey && callsFor === callsKey ? moonshotCalls : null;
    const nextRace = lockout.nextRace;
    const next = nextRoundLines(nextRace ? { id: nextRace.id, round: nextRace.round, name: nextRace.name, city: nextRace.city } : null, lockout.lockTime, lockout.isLocked, Date.now(), callsKnown, team.id, moonshotCfg, names.driver);

    // F-130: the other team, when it was scored for this race and its recap is still unseen
    const other = userTeams.find((t, i) => i !== activeTeamIndex && t.id !== team.id && (t.scoredRaces || []).includes(lastRaceId) && seenRecaps[t.id] !== lastRaceId);
    const otherIndex = other ? userTeams.findIndex((t) => t.id === other.id) : -1;

    return {
      raceId: lastRaceId,
      raceName,
      title: recapTitle(raceName),
      round: lastRace?.round ?? snapshot?.round ?? null,
      teamName: team.name || `Team ${activeTeamIndex + 1}`,
      teamIndex: activeTeamIndex,
      teamCount,
      nextTeam: other && otherIndex >= 0 ? { index: otherIndex, name: other.name || `Team ${otherIndex + 1}` } : null,
      teamPoints: roster.total,
      roster,
      standing,
      next,
      rank,
      leagueSize,
      moonshot: callsKey && callsFor === callsKey ? recapMoonshot(moonshotCalls, team.id, lastRaceId) : null,
    };
  }, [team, teamConstructor, lastRaceId, lastRaceScores, lastRace, members, seenForTeam, seenRecaps, callsReady, callsKey, callsFor, moonshotCalls, recordReady, record, recordKey, drivers, constructors, lockout, moonshotCfg, configLoaded, isDemoMode, userTeams, activeTeamIndex, teamCount]);

  const dismiss = useCallback(() => {
    if (lastRaceId) markRecapSeen(lastRaceId, teamId);
  }, [lastRaceId, teamId, markRecapSeen]);
  // F-130: dismiss this team's recap and switch to the other team, whose own recap then shows.
  // The switch waits for this card's fade-out: iOS will not present a modal while the previous
  // one is still going away, and the other team's record can be back well inside that time.
  const showTeam = useCallback((index: number) => {
    if (lastRaceId) markRecapSeen(lastRaceId, teamId);
    setTimeout(() => switchTeam(index), 400);
  }, [lastRaceId, teamId, markRecapSeen, switchTeam]);

  return { recap, dismiss, showTeam };
}
