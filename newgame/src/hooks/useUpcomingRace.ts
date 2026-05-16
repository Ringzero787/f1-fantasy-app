import { useQuery } from '@tanstack/react-query';
import { dataService } from '@services/data.service';
import type { Race } from '@/types';

export function useUpcomingRace() {
  return useQuery<Race | null>({
    queryKey: ['tl', 'upcoming-race'],
    queryFn: () => dataService.getUpcomingRace(),
    staleTime: 5 * 60_000,
  });
}
