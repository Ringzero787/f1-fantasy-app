// User preference store. Currently only display-size scaling — extend as
// more user-tunable settings appear (theme override, sound, haptics, etc).
//
// Persisted to AsyncStorage so the choice survives reloads.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const DISPLAY_SCALE_OPTIONS = [0.9, 1.0, 1.15, 1.3] as const;
export type DisplayScale = (typeof DISPLAY_SCALE_OPTIONS)[number];

interface PrefsState {
  /** Multiplier applied to font sizes + tap-target padding throughout the
   *  app. 1.0 = native sizing; below for compact, above for accessibility. */
  displayScale: DisplayScale;
  setDisplayScale: (s: DisplayScale) => void;
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      displayScale: 1.0,
      setDisplayScale: (s) => set({ displayScale: s }),
    }),
    {
      name: 'tl-prefs',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
