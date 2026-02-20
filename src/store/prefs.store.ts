import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ConstructorThemeId } from '../config/themes';

interface PrefsState {
  showLocalTime: boolean;
  toggleLocalTime: () => void;
  displayScale: number;
  setDisplayScale: (scale: number) => void;
  constructorTheme: ConstructorThemeId;
  setConstructorTheme: (id: ConstructorThemeId) => void;
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      showLocalTime: false,
      toggleLocalTime: () => set((s) => ({ showLocalTime: !s.showLocalTime })),
      displayScale: 1.0,
      setDisplayScale: (scale: number) => set({ displayScale: scale }),
      constructorTheme: 'default' as ConstructorThemeId,
      setConstructorTheme: (id: ConstructorThemeId) => set({ constructorTheme: id }),
    }),
    {
      name: 'prefs-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
