import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MAX_AVATARS = 10;

interface AvatarState {
  // Per-user avatar history keyed by userId
  histories: Record<string, string[]>;

  addAvatar: (userId: string, url: string) => void;
  getHistory: (userId: string) => string[];
  getRemaining: (userId: string) => number;
  canGenerate: (userId: string) => boolean;
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
        // Prepend new avatar (most recent first), cap at MAX
        const updated = [url, ...current].slice(0, MAX_AVATARS);
        set({ histories: { ...histories, [userId]: updated } });
      },

      getHistory: (userId) => {
        return get().histories[userId] || [];
      },

      getRemaining: (userId) => {
        const count = (get().histories[userId] || []).length;
        return Math.max(0, MAX_AVATARS - count);
      },

      canGenerate: (userId) => {
        return (get().histories[userId] || []).length < MAX_AVATARS;
      },
    }),
    {
      name: 'avatar-history-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
