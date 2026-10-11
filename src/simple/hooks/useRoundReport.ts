import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../../store/auth.store';
import { useRemoteConfigStore } from '../../store/remoteConfig.store';
import { useMoonshotStore } from '../../store/moonshot.store';
import { getLeagueRaceResult } from '../../services/leagueRaceResults.service';
import { moonshotService } from '../../services/moonshot.service';
import type { LeagueRaceResultDoc } from '../grid/raceLeaderboard';
import type { ActivityEntry } from '../grid/moonshot';
import { buildRoundReport, reportRaces, type RoundReport } from '../grid/roundReport';
import { SHOWCASE_RESULT_ROUND, showcaseRaceResult } from '../grid/showcaseData';

// Leaderboards and settled Moonshots do not change once a race is scored, so one read per league
// and race serves the League tab's table, its report and the recap for the session. Cleared by
// pull-to-refresh and on sign-out.
const results = new Map<string, Promise<LeagueRaceResultDoc | null>>();
const shots = new Map<string, Promise<ActivityEntry[]>>();
export function cached<T>(store: Map<string, Promise<T>>, key: string, load: () => Promise<T>, onError: T, keep: (value: T) => boolean = () => true): Promise<T> {
  let hit = store.get(key);
  if (!hit) {
    // Only an answer worth keeping is remembered. A failed read is not, and neither is "nothing
    // there yet": the recap can ask for a leaderboard minutes before scoring writes it, and that
    // must not empty the League tab's table for the rest of the session. Forgetting never evicts
    // a newer attempt made after a refresh.
    const forget = () => { if (store.get(key) === p) store.delete(key); };
    const p: Promise<T> = load().then((value) => { if (!keep(value)) forget(); return value; }, () => { forget(); return onError; });
    hit = p;
    store.set(key, hit);
  }
  return hit;
}
/** One league's leaderboard for one race, read once per session. */
export const readLeagueRaceResult = (leagueId: string, raceId: string) =>
  cached(results, `${leagueId}:${raceId}`, () => getLeagueRaceResult(leagueId, raceId), null, (doc) => doc !== null);
const readRaceMoonshots = (leagueId: string, raceId: string) =>
  cached(shots, `${leagueId}:${raceId}`, () => moonshotService.leagueActivityForRace(leagueId, raceId), [] as ActivityEntry[]);
export const clearRoundReportCache = () => { results.clear(); shots.clear(); };
const NO_ACTIVITY: ActivityEntry[] = [];

export interface RoundReportState {
  report: RoundReport | null;
  loading: boolean;
  /** "RD 19 · SINGAPORE" */
  label: string | null;
}

/**
 * The league round report (F-120) for one race: that race's leaderboard, the one for the round
 * before it, and the Moonshots settled on it. Three reads at most. `resultIds` is the league's
 * `raceResultIds` when it is known; it only narrows which earlier round is compared.
 */
export function useRoundReport(leagueId: string | null, raceId: string | null, resultIds: string[] | null | undefined): RoundReportState {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const races = useRemoteConfigStore((s) => s.races);
  // only the demo league's history comes from the store; a live league's is read per race below
  const demoActivity = useMoonshotStore((s) => (isDemoMode ? s.activity : NO_ACTIVITY));
  const loadActivity = useMoonshotStore((s) => s.loadActivity);
  const [docs, setDocs] = useState<{ key: string; current: LeagueRaceResultDoc | null; previous: LeagueRaceResultDoc | null; activity: ActivityEntry[] } | null>(null);

  const ids = (resultIds ?? []).join('|');
  const race = useMemo(() => (raceId ? reportRaces(races as never, raceId, resultIds) : { round: null, label: null, previousId: null }), [races, raceId, ids]); // eslint-disable-line react-hooks/exhaustive-deps
  const key = leagueId && raceId ? `${leagueId}:${raceId}:${race.previousId ?? '-'}:${isDemoMode ? `demo:${race.round}:${userId}` : 'live'}` : null;

  useEffect(() => {
    if (!leagueId || !raceId || !key) { setDocs(null); return; }
    let cancelled = false;
    if (isDemoMode) {
      // The showcase league has one round on record; the round before it is derived so the comparison can be seen.
      loadActivity(leagueId).catch(() => {});
      const round = race.round ?? SHOWCASE_RESULT_ROUND;
      setDocs({ key, current: showcaseRaceResult(leagueId, userId ?? '', round), previous: showcaseRaceResult(leagueId, userId ?? '', round - 1), activity: [] });
      return;
    }
    Promise.all([
      readLeagueRaceResult(leagueId, raceId),
      race.previousId ? readLeagueRaceResult(leagueId, race.previousId) : Promise.resolve(null),
      readRaceMoonshots(leagueId, raceId),
    ]).then(([current, previous, activity]) => { if (!cancelled) setDocs({ key, current, previous, activity }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` carries the league, both races, the mode and the viewer
  }, [key]);

  const ready = !!key && docs?.key === key;
  const report = useMemo(() => {
    if (!ready) return null;
    // demo history is one fixed list with its own race ids; show it as this round's so the block can be seen
    const activity = isDemoMode && docs!.current ? demoActivity.map((a) => ({ ...a, raceId: docs!.current!.raceId })) : docs!.activity;
    return buildRoundReport(docs!.current, docs!.previous, userId, activity);
  }, [ready, docs, userId, isDemoMode, demoActivity]);
  return { report, loading: !!key && !ready, label: race.label };
}
