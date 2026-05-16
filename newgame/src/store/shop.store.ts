import { create } from 'zustand';
import { shopService } from '../services/shop.service';
import type { Driver, Constructor } from '../types';

interface ShopState {
  drivers: Driver[];
  constructors: Constructor[];
  isLoading: boolean;
  hasInitialOffer: boolean;
  error: string | null;

  rollFresh: (opts: { excludeDriverIds: string[]; excludeConstructorIds: string[] }) => Promise<void>;
  reset: () => void;
}

export const useShopStore = create<ShopState>((set) => ({
  drivers: [],
  constructors: [],
  isLoading: false,
  hasInitialOffer: false,
  error: null,

  rollFresh: async (opts) => {
    set({ isLoading: true, error: null });
    try {
      const offer = await shopService.rollOffer(opts);
      set({
        drivers: offer.drivers,
        constructors: offer.constructors,
        isLoading: false,
        hasInitialOffer: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Shop refresh failed';
      set({ error: message, isLoading: false });
    }
  },

  reset: () => set({ drivers: [], constructors: [], isLoading: false, hasInitialOffer: false, error: null }),
}));
