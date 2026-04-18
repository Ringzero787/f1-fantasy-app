import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ConstructorThemeId } from '../config/themes';

export type UiMode = 'complex' | 'simple';
export type ThemeMode = 'system' | 'light' | 'dark';

interface PrefsState {
  showLocalTime: boolean;
  toggleLocalTime: () => void;
  displayScale: number;
  setDisplayScale: (scale: number) => void;
  constructorTheme: ConstructorThemeId;
  setConstructorTheme: (id: ConstructorThemeId) => void;
  uiMode: UiMode;
  setUiMode: (mode: UiMode) => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;

  // Review prompt tracking
  hasPromptedReview: boolean;
  lastReviewPromptDate: number | null;
  sessionCount: number;
  incrementSession: () => void;
  markReviewPrompted: () => void;
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
      uiMode: 'simple' as UiMode,
      setUiMode: (mode: UiMode) => set({ uiMode: mode }),
      themeMode: 'system' as ThemeMode,
      setThemeMode: (mode: ThemeMode) => set({ themeMode: mode }),

      // Review prompt
      hasPromptedReview: false,
      lastReviewPromptDate: null,
      sessionCount: 0,
      incrementSession: () => set((s) => ({ sessionCount: s.sessionCount + 1 })),
      markReviewPrompted: () => set({ hasPromptedReview: true, lastReviewPromptDate: Date.now() }),
    }),
    {
      name: 'prefs-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
