import { useMemo } from 'react';
import { useAdminStore } from '../store/admin.store';
import { useRemoteConfigStore } from '../store/remoteConfig.store';
import { computeLockoutStatus, type LockoutInfo } from '../utils/lockout';

/**
 * React hook that computes the current lockout status.
 * Reads live race data from remoteConfig store (Firestore-backed).
 */
export function useLockoutStatus(): LockoutInfo {
  const raceResults = useAdminStore((s) => s.raceResults);
  const adminLockOverride = useAdminStore((s) => s.adminLockOverride);
  const races = useRemoteConfigStore((s) => s.races);

  return useMemo(() => {
    const completedRaceIds = new Set<string>();
    Object.entries(raceResults).forEach(([raceId, result]) => {
      if (result.isComplete) {
        completedRaceIds.add(raceId);
      }
    });

    return computeLockoutStatus(
      races,
      completedRaceIds,
      new Date(),
      adminLockOverride,
    );
  }, [races, raceResults, adminLockOverride]);
}
