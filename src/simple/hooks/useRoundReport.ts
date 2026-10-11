import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../../store/auth.store';
import { useRemoteConfigStore } from '../../store/remoteConfig.store';
import { getLeagueRaceResult } from '../../services/leagueRaceResults.service';
import { raceOptions, type LeagueRaceResultDoc } from '../grid/raceLeaderboard';
import { buildRoundReport, previousRaceId, type RoundReport } from '../grid/roundReport';
import { SHOWCASE_RESULT_ROUND, showcaseRaceResult } from '../grid/showcaseData';

// Leaderboards do not change once a race is scored, so one read per league and race serves the
// League tab and the recap for the session.
const cache = new Map<string, Promise<LeagueRaceResultDoc | null>>();
const read = (leagueId: string, raceId: string) => {
  const key = `${leagueId}:${raceId}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = getLeagueRaceResult(leagueId, raceId).catch(() => { cache.delete(key); return null; });
    cache.set(key, hit);
  }
  return hit;
};
export const clearRoundReportCache = () => cache.clear();

export interface RoundReportState {
  report: RoundReport | null;
  loading: boolean;
  /** "RD 19 · SINGAPORE" */
  label: string | null;
}

/**
 * The league round report (F-120) for one race: that race's leaderboard and the one before it,
 * two document reads at most. `resultIds` is the league's `raceResultIds`, so the round before
 * is the last one the league actually has a leaderboard for.
 */
export function useRoundReport(leagueId: string | null, raceId: string | null, resultIds: string[] | null | undefined): RoundReportState {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const races = useRemoteConfigStore((s) => s.races);
  const [docs, setDocs] = useState<{ key: string; current: LeagueRaceResultDoc | null; previous: LeagueRaceResultDoc | null } | null>(null);

  const ids = resultIds ?? (isDemoMode ? races.filter((r) => r.round === SHOWCASE_RESULT_ROUND).map((r) => r.id) : []);
  const options = useMemo(() => raceOptions(races as never, ids), [races, ids.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const option = raceId ? options.find((o) => o.raceId === raceId) ?? null : null;
  const key = leagueId && raceId ? `${leagueId}:${raceId}:${isDemoMode ? 'demo' : 'live'}` : null;

  useEffect(() => {
    if (!leagueId || !raceId || !key) { setDocs(null); return; }
    let cancelled = false;
    const load = isDemoMode
      // the showcase league has one round on record; the round before it is derived so the comparison can be seen
      ? Promise.resolve([showcaseRaceResult(leagueId, userId ?? '', option?.round ?? 0), showcaseRaceResult(leagueId, userId ?? '', (option?.round ?? 0) - 1)] as const)
      : Promise.all([read(leagueId, raceId), (() => { const prev = previousRaceId(options, raceId); return prev ? read(leagueId, prev) : Promise.resolve(null); })()]);
    load.then(([current, previous]) => { if (!cancelled) setDocs({ key, current, previous }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- league, race, mode and the set of rounds on record
  }, [key, options.length]);

  const ready = !!key && docs?.key === key;
  const report = useMemo(() => (ready ? buildRoundReport(docs!.current, docs!.previous, userId) : null), [ready, docs, userId]);
  return { report, loading: !!key && !ready, label: option?.label ?? null };
}
