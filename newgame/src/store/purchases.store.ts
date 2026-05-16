import { create } from 'zustand';
import { purchasesService } from '../services/purchases.service';
import type { UserEntitlements, CosmeticSurface } from '../types';

interface PurchasesState {
  entitlements: UserEntitlements | null;
  isLoading: boolean;
  error: string | null;

  load: (userId: string) => Promise<void>;
  refresh: (userId: string) => Promise<void>;
  buy: (userId: string, productId: string) => Promise<void>;
  restore: () => Promise<{ count: number; errors: string[]; viaMock?: boolean }>;
  selectCosmetic: (userId: string, surface: CosmeticSurface, cosmeticItemId: string) => Promise<void>;
  reset: () => void;
}

export const usePurchasesStore = create<PurchasesState>((set, get) => ({
  entitlements: null,
  isLoading: false,
  error: null,

  load: async (userId) => {
    set({ isLoading: true, error: null });
    try {
      const ent = await purchasesService.getEntitlements(userId);
      set({ entitlements: ent, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load entitlements';
      set({ error: message, isLoading: false });
    }
  },

  refresh: async (userId) => {
    try {
      const ent = await purchasesService.getEntitlements(userId);
      set({ entitlements: ent });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh entitlements';
      set({ error: message });
    }
  },

  buy: async (userId, productId) => {
    set({ isLoading: true, error: null });
    try {
      await purchasesService.requestPurchase({ userId, productId: productId as never });
      await get().refresh(userId);
      set({ isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Purchase failed';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  restore: async () => {
    try {
      return await purchasesService.restorePurchases();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Restore failed';
      set({ error: message });
      throw err;
    }
  },

  selectCosmetic: async (userId, surface, cosmeticItemId) => {
    try {
      await purchasesService.selectCosmetic({ userId, surface, cosmeticItemId });
      await get().refresh(userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not apply cosmetic';
      set({ error: message });
    }
  },

  reset: () => set({ entitlements: null, isLoading: false, error: null }),
}));
