import { useQuery } from '@tanstack/react-query';
import { constructorService } from '../services/constructor.service';
import { useAuthStore } from '../store/auth.store';
import { useAdminStore } from '../store/admin.store';
import { demoConstructors } from '../data/demoData';
import type { Constructor } from '../types';

export const constructorKeys = {
  all: ['constructors'] as const,
  lists: () => [...constructorKeys.all, 'list'] as const,
  details: () => [...constructorKeys.all, 'detail'] as const,
  detail: (id: string) => [...constructorKeys.details(), id] as const,
  affordable: (maxPrice: number) => [...constructorKeys.all, 'affordable', maxPrice] as const,
  top: (limit: number) => [...constructorKeys.all, 'top', limit] as const,
};

// Helper to calculate 2026 season points from race results
function getConstructorSeasonPoints(constructorId: string, raceResults: Record<string, any>): number {
  let total = 0;
  Object.values(raceResults).forEach((result: any) => {
    if (result.isComplete) {
      // Race points
      const constructorResult = result.constructorResults?.find((cr: any) => cr.constructorId === constructorId);
      if (constructorResult) {
        total += constructorResult.points;
      }
      // Sprint points
      const sprintResult = result.sprintConstructorResults?.find((scr: any) => scr.constructorId === constructorId);
      if (sprintResult) {
        total += sprintResult.points;
      }
    }
  });
  return total;
}

export function useConstructors() {
  const isDemoMode = useAuthStore((state) => state.isDemoMode);
  const raceResults = useAdminStore((state) => state.raceResults);
  const constructorPrices = useAdminStore((state) => state.constructorPrices);

  return useQuery({
    queryKey: [...constructorKeys.lists(), raceResults, constructorPrices],
    queryFn: async () => {
      const addSeasonPointsAndPrices = (constructors: Constructor[]) => {
        return constructors.map(c => {
          const priceUpdate = constructorPrices[c.id];
          return {
            ...c,
            price: priceUpdate?.currentPrice ?? c.price,
            previousPrice: priceUpdate?.previousPrice ?? c.previousPrice,
            // currentSeasonPoints is 2026 data (displayed to users)
            currentSeasonPoints: priceUpdate?.totalPoints ?? getConstructorSeasonPoints(c.id, raceResults),
          };
        });
      };

      if (isDemoMode) {
        const constructors = [...demoConstructors].sort((a, b) => b.price - a.price);
        return addSeasonPointsAndPrices(constructors);
      }
      try {
        // Try Firestore first, fall back to demo data if empty
        const firestoreData = await constructorService.getAllConstructors();
        if (firestoreData.length === 0) {
          console.log('Firestore empty, using demo constructors');
          const constructors = [...demoConstructors].sort((a, b) => b.price - a.price);
          return addSeasonPointsAndPrices(constructors);
        }
        return addSeasonPointsAndPrices(firestoreData);
      } catch (error) {
        console.log('Firestore error, using demo constructors:', error);
        const constructors = [...demoConstructors].sort((a, b) => b.price - a.price);
        return addSeasonPointsAndPrices(constructors);
      }
    },
  });
}

export function useConstructor(constructorId: string) {
  const isDemoMode = useAuthStore((state) => state.isDemoMode);
  const raceResults = useAdminStore((state) => state.raceResults);
  const constructorPrices = useAdminStore((state) => state.constructorPrices);

  return useQuery({
    queryKey: [...constructorKeys.detail(constructorId), raceResults, constructorPrices],
    queryFn: async () => {
      const addSeasonPointsAndPrice = (constructor: Constructor | null) => {
        if (!constructor) return null;
        const priceUpdate = constructorPrices[constructor.id];
        return {
          ...constructor,
          price: priceUpdate?.currentPrice ?? constructor.price,
          previousPrice: priceUpdate?.previousPrice ?? constructor.previousPrice,
          // currentSeasonPoints is 2026 data (displayed to users)
          currentSeasonPoints: priceUpdate?.totalPoints ?? getConstructorSeasonPoints(constructor.id, raceResults),
        };
      };

      if (isDemoMode) {
        const constructor = demoConstructors.find(c => c.id === constructorId) || null;
        return addSeasonPointsAndPrice(constructor);
      }
      try {
        const firestoreData = await constructorService.getConstructorById(constructorId);
        if (!firestoreData) {
          const constructor = demoConstructors.find(c => c.id === constructorId) || null;
          return addSeasonPointsAndPrice(constructor);
        }
        return addSeasonPointsAndPrice(firestoreData);
      } catch (error) {
        console.log('Firestore error, using demo constructor:', error);
        const constructor = demoConstructors.find(c => c.id === constructorId) || null;
        return addSeasonPointsAndPrice(constructor);
      }
    },
    enabled: !!constructorId,
  });
}

export function useAffordableConstructors(maxPrice: number) {
  const isDemoMode = useAuthStore((state) => state.isDemoMode);
  const constructorPrices = useAdminStore((state) => state.constructorPrices);

  return useQuery({
    queryKey: [...constructorKeys.affordable(maxPrice), constructorPrices],
    queryFn: async () => {
      const getDemoAffordable = () => {
        return demoConstructors
          .map(c => {
            const priceUpdate = constructorPrices[c.id];
            return {
              ...c,
              price: priceUpdate?.currentPrice ?? c.price,
              previousPrice: priceUpdate?.previousPrice ?? c.previousPrice,
            };
          })
          .filter(c => c.price <= maxPrice)
          .sort((a, b) => b.price - a.price);
      };

      if (isDemoMode) {
        return getDemoAffordable();
      }
      try {
        const firestoreData = await constructorService.getAffordableConstructors(maxPrice);
        if (firestoreData.length === 0) {
          return getDemoAffordable();
        }
        return firestoreData;
      } catch (error) {
        console.log('Firestore error, using demo constructors:', error);
        return getDemoAffordable();
      }
    },
    enabled: maxPrice > 0,
  });
}

export function useTopConstructors(limit: number = 5) {
  const isDemoMode = useAuthStore((state) => state.isDemoMode);
  const constructorPrices = useAdminStore((state) => state.constructorPrices);
  const raceResults = useAdminStore((state) => state.raceResults);

  return useQuery({
    queryKey: [...constructorKeys.top(limit), constructorPrices, raceResults],
    queryFn: async () => {
      const getDemoTop = () => {
        return [...demoConstructors]
          .map(c => {
            const priceUpdate = constructorPrices[c.id];
            const currentSeasonPts = priceUpdate?.totalPoints ?? getConstructorSeasonPoints(c.id, raceResults);
            return {
              ...c,
              price: priceUpdate?.currentPrice ?? c.price,
              previousPrice: priceUpdate?.previousPrice ?? c.previousPrice,
              currentSeasonPoints: currentSeasonPts,
            };
          })
          .sort((a, b) => (b.currentSeasonPoints || 0) - (a.currentSeasonPoints || 0))
          .slice(0, limit);
      };

      if (isDemoMode) {
        return getDemoTop();
      }
      try {
        const firestoreData = await constructorService.getTopConstructors(limit);
        if (firestoreData.length === 0) {
          return getDemoTop();
        }
        return firestoreData;
      } catch (error) {
        console.log('Firestore error, using demo constructors:', error);
        return getDemoTop();
      }
    },
  });
}
