import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useAuthStore } from '@store/auth.store';
import { useGarageStore } from '@store/garage.store';
import { dataService } from '@services/data.service';
import type { Driver, Constructor, Garage } from '@/types';

interface GarageWithEntities {
  garage: Garage | null;
  // All entities the user owns (active + bench, in owned-order).
  drivers: Driver[];
  constructors: Constructor[];
  // Currently-deployed subset — what the Lineup screen pulls from.
  rosteredDrivers: Driver[];
  rosteredConstructors: Constructor[];
  // Owned but not currently deployed.
  benchDrivers: Driver[];
  benchConstructors: Constructor[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useGarageWithEntities(): GarageWithEntities {
  const userId = useAuthStore((s) => s.user?.id);
  const garage = useGarageStore((s) => s.garage);
  const garageLoading = useGarageStore((s) => s.isLoading);
  const garageError = useGarageStore((s) => s.error);
  const loadOrInitialize = useGarageStore((s) => s.loadOrInitialize);

  useEffect(() => {
    if (userId && !garage && !garageLoading) {
      loadOrInitialize(userId);
    }
  }, [userId, garage, garageLoading, loadOrInitialize]);

  const driverIds = garage?.ownedDriverIds ?? [];
  const constructorIds = garage?.ownedConstructorIds ?? [];

  const driversQ = useQuery({
    queryKey: ['tl', 'drivers', driverIds],
    queryFn: () => dataService.getDriversByIds(driverIds),
    enabled: driverIds.length > 0,
  });

  const constructorsQ = useQuery({
    queryKey: ['tl', 'constructors', constructorIds],
    queryFn: () => dataService.getConstructorsByIds(constructorIds),
    enabled: constructorIds.length > 0,
  });

  const allDrivers = driversQ.data ?? [];
  const allConstructors = constructorsQ.data ?? [];

  const { rosteredDrivers, benchDrivers } = useMemo(() => {
    const rosterIds = new Set(garage?.rosteredDriverIds ?? []);
    const rosterOrder = garage?.rosteredDriverIds ?? [];
    const rostered = rosterOrder
      .map((id) => allDrivers.find((d) => d.id === id))
      .filter(Boolean) as Driver[];
    const bench = allDrivers.filter((d) => !rosterIds.has(d.id));
    return { rosteredDrivers: rostered, benchDrivers: bench };
  }, [allDrivers, garage?.rosteredDriverIds]);

  const { rosteredConstructors, benchConstructors } = useMemo(() => {
    const rosterIds = new Set(garage?.rosteredConstructorIds ?? []);
    const rosterOrder = garage?.rosteredConstructorIds ?? [];
    const rostered = rosterOrder
      .map((id) => allConstructors.find((c) => c.id === id))
      .filter(Boolean) as Constructor[];
    const bench = allConstructors.filter((c) => !rosterIds.has(c.id));
    return { rosteredConstructors: rostered, benchConstructors: bench };
  }, [allConstructors, garage?.rosteredConstructorIds]);

  return {
    garage,
    drivers: allDrivers,
    constructors: allConstructors,
    rosteredDrivers,
    rosteredConstructors,
    benchDrivers,
    benchConstructors,
    isLoading: garageLoading || driversQ.isLoading || constructorsQ.isLoading,
    error: garageError ?? (driversQ.error as Error | null)?.message ?? null,
    refetch: () => {
      driversQ.refetch();
      constructorsQ.refetch();
      if (userId) useGarageStore.getState().refresh(userId);
    },
  };
}
