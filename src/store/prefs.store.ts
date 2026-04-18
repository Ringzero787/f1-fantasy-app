import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ConstructorThemeId } from '../config/themes';

export type UiMode = 'complex' | 'simple';

interface PrefsState {
  showLocalTime: boolean;
  toggleLocalTime: () => void;
  displayScale: number;
  setDisplayScale: (scale: number) => void;
  constructorTheme: ConstructorThemeId;
  setConstructorTheme: (id: ConstructorThemeId) => void;
  uiMode: UiMode;
  setUiMode: (mode: UiMode) => void;

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
