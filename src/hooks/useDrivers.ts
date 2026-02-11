import { useQuery } from '@tanstack/react-query';
import { driverService } from '../services/driver.service';
import { useAuthStore } from '../store/auth.store';
import { useAdminStore } from '../store/admin.store';
import { demoDrivers } from '../data/demoData';
import { assignValueTiers } from '../config/pricing.config';
import type { Driver, DriverFilter } from '../types';

export const driverKeys = {
  all: ['drivers'] as const,
  lists: () => [...driverKeys.all, 'list'] as const,
  list: (filter: DriverFilter) => [...driverKeys.lists(), filter] as const,
  details: () => [...driverKeys.all, 'detail'] as const,
  detail: (id: string) => [...driverKeys.details(), id] as const,
  byConstructor: (constructorId: string) => [...driverKeys.all, 'constructor', constructorId] as const,
  affordable: (maxPrice: number) => [...driverKeys.all, 'affordable', maxPrice] as const,
  top: (limit: number) => [...driverKeys.all, 'top', limit] as const,
  movers: (direction: 'up' | 'down') => [...driverKeys.all, 'movers', direction] as const,
};

// Demo data helper functions
function getDemoDrivers(): Driver[] {
  return [...demoDrivers].sort((a, b) => b.price - a.price);
}

function getDemoDriversFiltered(filter: DriverFilter): Driver[] {
  let drivers = [...demoDrivers];

  if (filter.constructorId) {
    drivers = drivers.filter(d => d.constructorId === filter.constructorId);
  }

  if (filter.tier) {
    drivers = drivers.filter(d => d.tier === filter.tier);
  }

  if (filter.search) {
    const searchLower = filter.search.toLowerCase();
    drivers = drivers.filter(
      d => d.name.toLowerCase().includes(searchLower) ||
           d.shortName.toLowerCase().includes(searchLower)
    );
  }

  if (filter.minPrice !== undefined) {
    drivers = drivers.filter(d => d.price >= filter.minPrice!);
  }
  if (filter.maxPrice !== undefined) {
    drivers = drivers.filter(d => d.price <= filter.maxPrice!);
  }

  if (filter.sortBy) {
    drivers.sort((a, b) => {
      let comparison = 0;
      switch (filter.sortBy) {
        case 'price':
          comparison = a.price - b.price;
          break;
        case 'points':
          comparison = a.fantasyPoints - b.fantasyPoints;
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'priceChange':
          comparison = (a.price - a.previousPrice) - (b.price - b.previousPrice);
          break;
      }
      return filter.sortOrder === 'desc' ? -comparison : comparison;
    });
  }

  return drivers;
}

// Helper to calculate 2026 season points from race results
function getSeasonPointsFromRaces(driverId: string, raceResults: Record<string, any>): number {
  let total = 0;
  Object.values(raceResults).forEach((result: any) => {
    if (result.isComplete) {
      // Race points
      const driverResult = result.driverResults?.find((dr: any) => dr.driverId === driverId);
      if (driverResult) {
        total += driverResult.points;
      }
      // Sprint points
      const sprintResult = result.sprintResults?.find((sr: any) => sr.driverId === driverId);
      if (sprintResult) {
        total += sprintResult.points;
      }
    }
  });
  return total;
}

export function useDrivers(filter?: DriverFilter) {
  const isDemoMode = useAuthStore((state) => state.isDemoMode);
  const raceResults = useAdminStore((state) => state.raceResults);
  const driverPrices = useAdminStore((state) => state.driverPrices);

  return useQuery({
    // Use lightweight version counter instead of full objects to prevent unnecessary cache invalidation
    queryKey: filter
      ? [...driverKeys.list(filter), `${Object.keys(raceResults).length}_${Object.keys(driverPrices).length}`]
      : [...driverKeys.lists(), `${Object.keys(raceResults).length}_${Object.keys(driverPrices).length}`],
    queryFn: async () => {
      // Add 2026 season points and apply price updates to drivers
      const addSeasonPointsAndPrices = (drivers: Driver[], sortFilter?: DriverFilter) => {
        let updated = drivers.map(d => {
          const priceUpdate = driverPrices[d.id];
          return {
            ...d,
            // Apply price updates from race results
            price: priceUpdate?.currentPrice ?? d.price,
            previousPrice: priceUpdate?.previousPrice ?? d.previousPrice,
            // seasonPoints stays as 2025 data (used for pricing calculations)
            // currentSeasonPoints is 2026 data (displayed to users)
            currentSeasonPoints: priceUpdate?.totalPoints ?? getSeasonPointsFromRaces(d.id, raceResults),
          };
        });

        // Assign value-based tiers (percentile PPD ranking)
        updated = assignValueTiers(updated);

        // Re-sort after price updates are applied (ensures correct order with updated prices)
        if (sortFilter?.sortBy) {
          updated.sort((a, b) => {
            let comparison = 0;
            switch (sortFilter.sortBy) {
              case 'price':
                comparison = a.price - b.price;
                break;
              case 'points':
                comparison = (a.currentSeasonPoints || 0) - (b.currentSeasonPoints || 0);
                break;
              case 'name':
                comparison = a.name.localeCompare(b.name);
                break;
              case 'priceChange':
                comparison = (a.price - a.previousPrice) - (b.price - b.previousPrice);
                break;
            }
            return sortFilter.sortOrder === 'desc' ? -comparison : comparison;
          });
        } else {
          // Default sort by price descending
          updated.sort((a, b) => b.price - a.price);
        }

        return updated;
      };

      if (isDemoMode) {
        const drivers = filter ? getDemoDriversFiltered(filter) : getDemoDrivers();
        return addSeasonPointsAndPrices(drivers, filter);
      }
      // Try Firestore first, fall back to demo data on error or empty
      try {
        const firestoreData = filter
          ? await driverService.getDriversFiltered(filter)
          : await driverService.getAllDrivers();
        if (firestoreData.length === 0) {
          console.log('Firestore empty, using demo drivers');
          const drivers = filter ? getDemoDriversFiltered(filter) : getDemoDrivers();
          return addSeasonPointsAndPrices(drivers, filter);
        }
        return addSeasonPointsAndPrices(firestoreData, filter);
      } catch (error) {
        console.log('Firestore error, using demo drivers:', error);
        const drivers = filter ? getDemoDriversFiltered(filter) : getDemoDrivers();
        return addSeasonPointsAndPrices(drivers, filter);
      }
    },
  });
}

export function useDriver(driverId: string) {
  const isDemoMode = useAuthStore((state) => state.isDemoMode);
  const raceResults = useAdminStore((state) => state.raceResults);
  const driverPrices = useAdminStore((state) => state.driverPrices);

  return useQuery({
    queryKey: [...driverKeys.detail(driverId), `${Object.keys(raceResults).length}_${Object.keys(driverPrices).length}`],
    queryFn: async () => {
      const addSeasonPointsAndPrice = (driver: Driver | null) => {
        if (!driver) return null;
        const priceUpdate = driverPrices[driver.id];
        return {
          ...driver,
          price: priceUpdate?.currentPrice ?? driver.price,
          previousPrice: priceUpdate?.previousPrice ?? driver.previousPrice,
          // currentSeasonPoints is 2026 data (displayed to users)
          currentSeasonPoints: priceUpdate?.totalPoints ?? getSeasonPointsFromRaces(driver.id, raceResults),
        };
      };

      if (isDemoMode) {
        const driver = demoDrivers.find(d => d.id === driverId) || null;
        return addSeasonPointsAndPrice(driver);
      }
      try {
        const firestoreData = await driverService.getDriverById(driverId);
        if (!firestoreData) {
          const driver = demoDrivers.find(d => d.id === driverId) || null;
          return addSeasonPointsAndPrice(driver);
        }
        return addSeasonPointsAndPrice(firestoreData);
      } catch (error) {
        console.log('Firestore error, using demo driver:', error);
        const driver = demoDrivers.find(d => d.id === driverId) || null;
        return addSeasonPointsAndPrice(driver);
      }
    },
    enabled: !!driverId,
  });
}

export function useDriversByConstructor(constructorId: string) {
  const isDemoMode = useAuthStore((state) => state.isDemoMode);

  return useQuery({
    queryKey: driverKeys.byConstructor(constructorId),
    queryFn: async () => {
      if (isDemoMode) {
        return demoDrivers.filter(d => d.constructorId === constructorId);
      }
      try {
        const firestoreData = await driverService.getDriversByConstructor(constructorId);
        if (firestoreData.length === 0) {
          return demoDrivers.filter(d => d.constructorId === constructorId);
        }
        return firestoreData;
      } catch (error) {
        console.log('Firestore error, using demo drivers:', error);
        return demoDrivers.filter(d => d.constructorId === constructorId);
      }
    },
    enabled: !!constructorId,
  });
}

export function useAffordableDrivers(maxPrice: number, excludeIds: string[] = []) {
  const isDemoMode = useAuthStore((state) => state.isDemoMode);
  const driverPrices = useAdminStore((state) => state.driverPrices);

  return useQuery({
    queryKey: [...driverKeys.affordable(maxPrice), excludeIds, Object.keys(driverPrices).length],
    queryFn: async () => {
      const getDemoAffordable = () => {
        const all = demoDrivers.map(d => {
          const priceUpdate = driverPrices[d.id];
          return {
            ...d,
            price: priceUpdate?.currentPrice ?? d.price,
            previousPrice: priceUpdate?.previousPrice ?? d.previousPrice,
          };
        });
        return assignValueTiers(all)
          .filter(d => d.price <= maxPrice && !excludeIds.includes(d.id))
          .sort((a, b) => b.price - a.price);
      };

      if (isDemoMode) {
        return getDemoAffordable();
      }
      try {
        const firestoreData = await driverService.getAffordableDrivers(maxPrice, excludeIds);
        if (firestoreData.length === 0) {
          return getDemoAffordable();
        }
        return firestoreData;
      } catch (error) {
        console.log('Firestore error, using demo drivers:', error);
        return getDemoAffordable();
      }
    },
    enabled: maxPrice > 0,
  });
}

export function useTopDrivers(limit: number = 10) {
  const isDemoMode = useAuthStore((state) => state.isDemoMode);
  const raceResults = useAdminStore((state) => state.raceResults);
  const driverPrices = useAdminStore((state) => state.driverPrices);

  return useQuery({
    queryKey: [...driverKeys.top(limit), `${Object.keys(raceResults).length}_${Object.keys(driverPrices).length}`],
    queryFn: async () => {
      // Calculate 2026 season points from race results
      const getSeasonPoints = (driverId: string): number => {
        // First check if we have tracked points from price updates
        const priceUpdate = driverPrices[driverId];
        if (priceUpdate) {
          return priceUpdate.totalPoints;
        }
        // Otherwise calculate from race results
        let total = 0;
        Object.values(raceResults).forEach(result => {
          if (result.isComplete) {
            // Race points
            const driverResult = result.driverResults.find(dr => dr.driverId === driverId);
            if (driverResult) {
              total += driverResult.points;
            }
            // Sprint points
            const sprintResult = result.sprintResults?.find(sr => sr.driverId === driverId);
            if (sprintResult) {
              total += sprintResult.points;
            }
          }
        });
        return total;
      };

      const getDemoTop = () => {
        const all = [...demoDrivers]
          .filter(d => d.isActive)
          .map(d => {
            const priceUpdate = driverPrices[d.id];
            const currentSeasonPts = getSeasonPoints(d.id);
            return {
              ...d,
              price: priceUpdate?.currentPrice ?? d.price,
              previousPrice: priceUpdate?.previousPrice ?? d.previousPrice,
              currentSeasonPoints: currentSeasonPts,
            };
          });
        return assignValueTiers(all)
          .sort((a, b) => (b.currentSeasonPoints || 0) - (a.currentSeasonPoints || 0))
          .slice(0, limit);
      };

      if (isDemoMode) {
        return getDemoTop();
      }
      try {
        const firestoreData = await driverService.getTopDrivers(limit);
        if (firestoreData.length === 0) {
          return getDemoTop();
        }
        return firestoreData;
      } catch (error) {
        console.log('Firestore error, using demo drivers:', error);
        return getDemoTop();
      }
    },
  });
}

export function usePriceMovers(direction: 'up' | 'down', limit: number = 5) {
  const isDemoMode = useAuthStore((state) => state.isDemoMode);
  const driverPrices = useAdminStore((state) => state.driverPrices);

  return useQuery({
    queryKey: [...driverKeys.movers(direction), Object.keys(driverPrices).length],
    queryFn: async () => {
      const getDemoMovers = () => {
        const all = [...demoDrivers]
          .map(d => {
            const priceUpdate = driverPrices[d.id];
            const currentPrice = priceUpdate?.currentPrice ?? d.price;
            const previousPrice = priceUpdate?.previousPrice ?? d.previousPrice;
            return {
              ...d,
              price: currentPrice,
              previousPrice: previousPrice,
              priceChange: currentPrice - previousPrice,
            };
          });
        return assignValueTiers(all)
          .sort((a, b) => {
            if (direction === 'up') {
              return b.priceChange - a.priceChange;
            }
            return a.priceChange - b.priceChange;
          })
          .slice(0, limit);
      };

      if (isDemoMode) {
        return getDemoMovers();
      }
      try {
        const firestoreData = await driverService.getPriceMovers(direction, limit);
        if (firestoreData.length === 0) {
          return getDemoMovers();
        }
        return firestoreData;
      } catch (error) {
        console.log('Firestore error, using demo drivers:', error);
        return getDemoMovers();
      }
    },
  });
}
