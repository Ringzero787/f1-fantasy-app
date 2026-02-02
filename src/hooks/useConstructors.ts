import { useQuery } from '@tanstack/react-query';
import { constructorService } from '../services/constructor.service';
import { useAuthStore } from '../store/auth.store';
import { demoConstructors } from '../data/demoData';

export const constructorKeys = {
  all: ['constructors'] as const,
  lists: () => [...constructorKeys.all, 'list'] as const,
  details: () => [...constructorKeys.all, 'detail'] as const,
  detail: (id: string) => [...constructorKeys.details(), id] as const,
  affordable: (maxPrice: number) => [...constructorKeys.all, 'affordable', maxPrice] as const,
  top: (limit: number) => [...constructorKeys.all, 'top', limit] as const,
};

export function useConstructors() {
  const isDemoMode = useAuthStore((state) => state.isDemoMode);

  return useQuery({
    queryKey: constructorKeys.lists(),
    queryFn: () => {
      if (isDemoMode) {
        return [...demoConstructors].sort((a, b) => b.price - a.price);
      }
      return constructorService.getAllConstructors();
    },
  });
}

export function useConstructor(constructorId: string) {
  const isDemoMode = useAuthStore((state) => state.isDemoMode);

  return useQuery({
    queryKey: constructorKeys.detail(constructorId),
    queryFn: () => {
      if (isDemoMode) {
        return demoConstructors.find(c => c.id === constructorId) || null;
      }
      return constructorService.getConstructorById(constructorId);
    },
    enabled: !!constructorId,
  });
}

export function useAffordableConstructors(maxPrice: number) {
  const isDemoMode = useAuthStore((state) => state.isDemoMode);

  return useQuery({
    queryKey: constructorKeys.affordable(maxPrice),
    queryFn: () => {
      if (isDemoMode) {
        return demoConstructors
          .filter(c => c.price <= maxPrice)
          .sort((a, b) => b.price - a.price);
      }
      return constructorService.getAffordableConstructors(maxPrice);
    },
    enabled: maxPrice > 0,
  });
}

export function useTopConstructors(limit: number = 5) {
  const isDemoMode = useAuthStore((state) => state.isDemoMode);

  return useQuery({
    queryKey: constructorKeys.top(limit),
    queryFn: () => {
      if (isDemoMode) {
        return [...demoConstructors]
          .sort((a, b) => b.fantasyPoints - a.fantasyPoints)
          .slice(0, limit);
      }
      return constructorService.getTopConstructors(limit);
    },
  });
}
