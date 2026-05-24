import { useQuery } from '@tanstack/react-query';
import { configService } from '@services/config.service';
import type { AppConfig } from '@/types';

// Reads tl_config/app once on launch (5-min cache). retry:0 so a failed read
// resolves fast to null and the gate stays open instead of blocking on retries.
export function useAppConfig() {
  return useQuery<AppConfig | null>({
    queryKey: ['tl', 'app-config'],
    queryFn: () => configService.get(),
    staleTime: 5 * 60_000,
    retry: 0,
  });
}
