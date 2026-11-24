import { useRemoteConfigStore, selectCurrentSeasonId } from '../store/remoteConfig.store';

/**
 * F-157: the season the app is in — `config/app.currentSeason`, else the live calendar, else the
 * documented last resort (src/utils/season.ts). Screens use this instead of writing a year.
 */
export function useCurrentSeasonId(): string {
  return useRemoteConfigStore((s) => selectCurrentSeasonId(s));
}
