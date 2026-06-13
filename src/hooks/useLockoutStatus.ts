import { useMemo, useEffect, useState } from 'react';
import { useAdminStore } from '../store/admin.store';
import { useRemoteConfigStore } from '../store/remoteConfig.store';
import { computeLockoutStatus, type LockoutInfo } from '../utils/lockout';

// Coarse clock tick so lock status flips as deadlines pass. Without a time
// dependency the memo captured `new Date()` ONCE — leave the app open through
// FP3 and the UI never locked (and the countdown's gates went stale).
const TICK_MS = 30 * 1000;

export function useLockoutStatus(): LockoutInfo {
  const raceResults = useAdminStore((s) => s.raceResults);
  const adminLockOverride = useAdminStore((s) => s.adminLockOverride);
  const races = useRemoteConfigStore((s) => s.races);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, []);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick drives time-based recompute
  }, [races, raceResults, adminLockOverride, tick]);
}
