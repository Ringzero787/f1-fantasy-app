import { useQuery } from '@tanstack/react-query';
import { raceService } from '../services/race.service';
import { useAuthStore } from '../store/auth.store';
import { demoRaces, demoRaceResults } from '../data/demoData';
import type { Race, RaceResults } from '../types';

export const raceKeys = {
  all: ['races'] as const,
  lists: () => [...raceKeys.all, 'list'] as const,
  season: (seasonId: string) => [...raceKeys.lists(), seasonId] as const,
  details: () => [...raceKeys.all, 'detail'] as const,
  detail: (id: string) => [...raceKeys.details(), id] as const,
  next: (seasonId: string) => [...raceKeys.all, 'next', seasonId] as const,
  current: (seasonId: string) => [...raceKeys.all, 'current', seasonId] as const,
  completed: (seasonId: string) => [...raceKeys.all, 'completed', seasonId] as const,
  results: (raceId: string) => [...raceKeys.all, 'results', raceId] as const,
};

// Demo data helper functions
function getDemoSeasonRaces(seasonId: string): Race[] {
  return demoRaces.filter(r => r.seasonId === seasonId).sort((a, b) => a.round - b.round);
}

function getDemoNextRace(seasonId: string): Race | null {
  const now = new Date();
  const upcomingRaces = demoRaces
    .filter(r => r.seasonId === seasonId && r.status === 'upcoming')
    .sort((a, b) => a.round - b.round);
  return upcomingRaces[0] || null;
}

function getDemoCompletedRaces(seasonId: string): Race[] {
  return demoRaces
    .filter(r => r.seasonId === seasonId && r.status === 'completed')
    .sort((a, b) => b.round - a.round);
}

export function useSeasonRaces(seasonId: string) {
  const isDemoMode = useAuthStore((state) => state.isDemoMode);

  return useQuery({
    queryKey: raceKeys.season(seasonId),
    queryFn: async () => {
      if (isDemoMode) {
        return getDemoSeasonRaces(seasonId);
      }
      // Try Firebase first, fall back to demo data if empty
      try {
        const races = await raceService.getSeasonRaces(seasonId);
        if (races && races.length > 0) {
          return races;
        }
      } catch (error) {
        console.log('Firebase unavailable, using demo data');
      }
      // Fallback to demo data
      return getDemoSeasonRaces(seasonId);
    },
    enabled: !!seasonId,
  });
}

export function useRace(raceId: string) {
  const isDemoMode = useAuthStore((state) => state.isDemoMode);

  return useQuery({
    queryKey: raceKeys.detail(raceId),
    queryFn: async () => {
      if (isDemoMode) {
        return demoRaces.find(r => r.id === raceId) || null;
      }
      // Try Firebase first, fall back to demo data if not found
      try {
        const race = await raceService.getRaceById(raceId);
        if (race) {
          return race;
        }
      } catch (error) {
        console.log('Firebase unavailable, using demo data');
      }
      // Fallback to demo data
      return demoRaces.find(r => r.id === raceId) || null;
    },
    enabled: !!raceId,
  });
}

function getDemoUpcomingRaces(seasonId: string, count: number): Race[] {
  return demoRaces
    .filter(r => r.seasonId === seasonId && r.status === 'upcoming')
    .sort((a, b) => a.round - b.round)
    .slice(0, count);
}

export function useUpcomingRaces(seasonId: string, count = 5) {
  const isDemoMode = useAuthStore((state) => state.isDemoMode);

  return useQuery({
    queryKey: [...raceKeys.all, 'upcoming', seasonId, count] as const,
    queryFn: async () => {
      if (isDemoMode) {
        return getDemoUpcomingRaces(seasonId, count);
      }
      try {
        const races = await raceService.getSeasonRaces(seasonId);
        if (races && races.length > 0) {
          return races
            .filter(r => r.status === 'upcoming')
            .sort((a, b) => a.round - b.round)
            .slice(0, count);
        }
      } catch (error) {
        console.log('Firebase unavailable, using demo data');
      }
      return getDemoUpcomingRaces(seasonId, count);
    },
    enabled: !!seasonId,
    refetchInterval: 60000,
  });
}

export function useNextRace(seasonId: string) {
  const isDemoMode = useAuthStore((state) => state.isDemoMode);

  return useQuery({
    queryKey: raceKeys.next(seasonId),
    queryFn: async () => {
      if (isDemoMode) {
        return getDemoNextRace(seasonId);
      }
      // Try Firebase first, fall back to demo data
      try {
        const race = await raceService.getNextRace(seasonId);
        if (race) {
          return race;
        }
      } catch (error) {
        console.log('Firebase unavailable, using demo data');
      }
      // Fallback to demo data
      return getDemoNextRace(seasonId);
    },
    enabled: !!seasonId,
    refetchInterval: 60000,
  });
}

export function useCurrentRace(seasonId: string) {
  const isDemoMode = useAuthStore((state) => state.isDemoMode);

  return useQuery({
    queryKey: raceKeys.current(seasonId),
    queryFn: async () => {
      if (isDemoMode) {
        // In demo mode, return the next upcoming race as "current"
        return getDemoNextRace(seasonId);
      }
      // Try Firebase first, fall back to demo data
      try {
        const race = await raceService.getCurrentRace(seasonId);
        if (race) {
          return race;
        }
      } catch (error) {
        console.log('Firebase unavailable, using demo data');
      }
      // Fallback to demo data - return next upcoming race
      return getDemoNextRace(seasonId);
    },
    enabled: !!seasonId,
    refetchInterval: 30000,
  });
}

export function useCompletedRaces(seasonId: string) {
  const isDemoMode = useAuthStore((state) => state.isDemoMode);

  return useQuery({
    queryKey: raceKeys.completed(seasonId),
    queryFn: async () => {
      if (isDemoMode) {
        return getDemoCompletedRaces(seasonId);
      }
      // Try Firebase first, fall back to demo data
      try {
        const races = await raceService.getCompletedRaces(seasonId);
        if (races && races.length > 0) {
          return races;
        }
      } catch (error) {
        console.log('Firebase unavailable, using demo data');
      }
      // Fallback to demo data
      return getDemoCompletedRaces(seasonId);
    },
    enabled: !!seasonId,
  });
}

export function useRaceResults(raceId: string) {
  const isDemoMode = useAuthStore((state) => state.isDemoMode);

  return useQuery({
    queryKey: raceKeys.results(raceId),
    queryFn: async () => {
      if (isDemoMode) {
        return demoRaceResults[raceId] || null;
      }
      // Try Firebase first, fall back to demo data
      try {
        const results = await raceService.getRaceResults(raceId);
        if (results) {
          return results;
        }
      } catch (error) {
        console.log('Firebase unavailable, using demo data');
      }
      // Fallback to demo data
      return demoRaceResults[raceId] || null;
    },
    enabled: !!raceId,
  });
}
