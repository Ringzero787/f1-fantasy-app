import { create } from 'zustand';
import { shopService } from '../services/shop.service';
import type { Driver, Constructor } from '../types';

interface ShopState {
  drivers: Driver[];
  constructors: Constructor[];
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;

  loadCatalog: (opts: { excludeDriverIds: string[]; excludeConstructorIds: string[] }) => Promise<void>;
  reset: () => void;
}

export const useShopStore = create<ShopState>((set) => ({
  drivers: [],
  constructors: [],
  isLoading: false,
  hasLoaded: false,
  error: null,

  loadCatalog: async (opts) => {
    set({ isLoading: true, error: null });
    try {
      const catalog = await shopService.getCatalog(opts);
      set({
        drivers: catalog.drivers,
        constructors: catalog.constructors,
        isLoading: false,
        hasLoaded: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Shop refresh failed';
      set({ error: message, isLoading: false });
    }
  },

  reset: () => set({ drivers: [], constructors: [], isLoading: false, hasLoaded: false, error: null }),
}));
