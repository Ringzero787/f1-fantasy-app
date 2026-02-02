import { useQuery } from '@tanstack/react-query';
import { driverService } from '../services/driver.service';
import { useAuthStore } from '../store/auth.store';
import { demoDrivers } from '../data/demoData';
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

export function useDrivers(filter?: DriverFilter) {
  const isDemoMode = useAuthStore((state) => state.isDemoMode);

  return useQuery({
    queryKey: filter ? driverKeys.list(filter) : driverKeys.lists(),
    queryFn: () => {
      if (isDemoMode) {
        return filter ? getDemoDriversFiltered(filter) : getDemoDrivers();
      }
      return filter ? driverService.getDriversFiltered(filter) : driverService.getAllDrivers();
    },
  });
}

export function useDriver(driverId: string) {
  const isDemoMode = useAuthStore((state) => state.isDemoMode);

  return useQuery({
    queryKey: driverKeys.detail(driverId),
    queryFn: () => {
      if (isDemoMode) {
        return demoDrivers.find(d => d.id === driverId) || null;
      }
      return driverService.getDriverById(driverId);
    },
    enabled: !!driverId,
  });
}

export function useDriversByConstructor(constructorId: string) {
  const isDemoMode = useAuthStore((state) => state.isDemoMode);

  return useQuery({
    queryKey: driverKeys.byConstructor(constructorId),
    queryFn: () => {
      if (isDemoMode) {
        return demoDrivers.filter(d => d.constructorId === constructorId);
      }
      return driverService.getDriversByConstructor(constructorId);
    },
    enabled: !!constructorId,
  });
}

export function useAffordableDrivers(maxPrice: number, excludeIds: string[] = []) {
  const isDemoMode = useAuthStore((state) => state.isDemoMode);

  return useQuery({
    queryKey: [...driverKeys.affordable(maxPrice), excludeIds],
    queryFn: () => {
      if (isDemoMode) {
        return demoDrivers
          .filter(d => d.price <= maxPrice && !excludeIds.includes(d.id))
          .sort((a, b) => b.price - a.price);
      }
      return driverService.getAffordableDrivers(maxPrice, excludeIds);
    },
    enabled: maxPrice > 0,
  });
}

export function useTopDrivers(limit: number = 10) {
  const isDemoMode = useAuthStore((state) => state.isDemoMode);

  return useQuery({
    queryKey: driverKeys.top(limit),
    queryFn: () => {
      if (isDemoMode) {
        return [...demoDrivers]
          .sort((a, b) => b.fantasyPoints - a.fantasyPoints)
          .slice(0, limit);
      }
      return driverService.getTopDrivers(limit);
    },
  });
}

export function usePriceMovers(direction: 'up' | 'down', limit: number = 5) {
  const isDemoMode = useAuthStore((state) => state.isDemoMode);

  return useQuery({
    queryKey: driverKeys.movers(direction),
    queryFn: () => {
      if (isDemoMode) {
        const sorted = [...demoDrivers]
          .map(d => ({ ...d, priceChange: d.price - d.previousPrice }))
          .sort((a, b) => {
            if (direction === 'up') {
              return b.priceChange - a.priceChange;
            }
            return a.priceChange - b.priceChange;
          })
          .slice(0, limit);
        return sorted;
      }
      return driverService.getPriceMovers(direction, limit);
    },
  });
}
