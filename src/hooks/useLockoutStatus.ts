import { useMemo } from 'react';
import { useAdminStore } from '../store/admin.store';
import { demoRaces } from '../data/demoData';
import { computeLockoutStatus, type LockoutInfo } from '../utils/lockout';

/**
 * React hook that computes the current lockout status.
 * Reads race results and admin override from the admin store.
 */
export function useLockoutStatus(): LockoutInfo {
  const raceResults = useAdminStore((s) => s.raceResults);
  const adminLockOverride = useAdminStore((s) => s.adminLockOverride);

  return useMemo(() => {
    const completedRaceIds = new Set<string>();
    Object.entries(raceResults).forEach(([raceId, result]) => {
      if (result.isComplete) {
        completedRaceIds.add(raceId);
      }
    });

    return computeLockoutStatus(
      demoRaces,
      completedRaceIds,
      new Date(),
      adminLockOverride,
    );
  }, [raceResults, adminLockOverride]);
}
