import { create } from 'zustand';
import { garageService } from '../services/garage.service';
import type { Garage } from '../types';

interface GarageState {
  garage: Garage | null;
  isLoading: boolean;
  error: string | null;

  // Loads the garage from Firestore. By default, if no garage exists, performs
  // the silent initial roll (legacy behavior). Pass `initializeIfMissing: false`
  // when the user is in the new opening-roll wizard — the garage doesn't exist
  // until they explicitly Lock It In.
  loadOrInitialize: (userId: string, opts?: { initializeIfMissing?: boolean }) => Promise<void>;
  refresh: (userId: string) => Promise<void>;
  reset: () => void;
}

export const useGarageStore = create<GarageState>((set) => ({
  garage: null,
  isLoading: false,
  error: null,

  loadOrInitialize: async (userId, opts) => {
    set({ isLoading: true, error: null });
    try {
      const existing = await garageService.getGarage(userId);
      if (existing) {
        set({ garage: existing, isLoading: false });
      } else if (opts?.initializeIfMissing === false) {
        set({ garage: null, isLoading: false });
      } else {
        const fresh = await garageService.performInitialRoll(userId);
        set({ garage: fresh, isLoading: false });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load garage';
      set({ error: message, isLoading: false });
    }
  },

  refresh: async (userId) => {
    try {
      const garage = await garageService.getGarage(userId);
      set({ garage });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh garage';
      set({ error: message });
    }
  },

  reset: () => set({ garage: null, isLoading: false, error: null }),
}));
