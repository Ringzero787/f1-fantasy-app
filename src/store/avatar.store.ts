import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MAX_FREE_AVATARS = 10;

interface AvatarState {
  // Per-user avatar history keyed by userId
  histories: Record<string, string[]>;

  addAvatar: (userId: string, url: string) => void;
  getHistory: (userId: string) => string[];
  getRemaining: (userId: string) => number;
  canGenerate: (userId: string) => boolean;
  consumeCredit: (userId: string) => void;
}

export const useAvatarStore = create<AvatarState>()(
  persist(
    (set, get) => ({
      histories: {},

      addAvatar: (userId, url) => {
        const { histories } = get();
        const current = histories[userId] || [];
        // Don't add duplicates
        if (current.includes(url)) return;
        // Prepend new avatar (most recent first) — no cap, bonus credits allow more
        const updated = [url, ...current];
        set({ histories: { ...histories, [userId]: updated } });
      },

      getHistory: (userId) => {
        return get().histories[userId] || [];
      },

      getRemaining: (userId) => {
        const count = (get().histories[userId] || []).length;
        const { usePurchaseStore } = require('./purchase.store');
        const bonus = usePurchaseStore.getState().getBonusCredits(userId);
        return Math.max(0, MAX_FREE_AVATARS - count) + bonus;
      },

      canGenerate: (userId) => {
        return get().getRemaining(userId) > 0;
      },

      consumeCredit: (userId) => {
        const count = (get().histories[userId] || []).length;
        // If user has used all free credits, consume a bonus credit
        if (count >= MAX_FREE_AVATARS) {
          const { usePurchaseStore } = require('./purchase.store');
          usePurchaseStore.getState().consumeBonusCredit(userId);
        }
      },
    }),
    {
      name: 'avatar-history-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
