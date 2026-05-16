import { useQuery } from '@tanstack/react-query';
import { lineupService } from '@services/lineup.service';
import { useAuthStore } from '@store/auth.store';
import type { Lineup } from '@/types';

export function useLineup(raceId: string | undefined) {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery<Lineup | null>({
    queryKey: ['tl', 'lineup', userId, raceId],
    queryFn: () => (userId && raceId ? lineupService.getLineup(userId, raceId) : Promise.resolve(null)),
    enabled: !!userId && !!raceId,
  });
}
