import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface PrefsState {
  showLocalTime: boolean;
  toggleLocalTime: () => void;
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      showLocalTime: false,
      toggleLocalTime: () => set((s) => ({ showLocalTime: !s.showLocalTime })),
    }),
    {
      name: 'prefs-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
