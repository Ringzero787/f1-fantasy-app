import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { withDismissed } from '../simple/grid/notice';

/**
 * F-174: which server notices this device has dismissed, by notice id. Local only — nothing is
 * sent anywhere — so a dismissal does not follow the player to another device, and a new notice
 * (a new id) shows again. The list is capped (see withDismissed).
 */
interface NoticeState {
  dismissedIds: string[];
  dismiss: (id: string) => void;
}

export const useNoticeStore = create<NoticeState>()(
  persist(
    (set) => ({
      dismissedIds: [],
      dismiss: (id: string) => set((s) => ({ dismissedIds: withDismissed(s.dismissedIds, id) })),
    }),
    {
      name: 'notice-dismissals',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ dismissedIds: s.dismissedIds }),
    }
  )
);
