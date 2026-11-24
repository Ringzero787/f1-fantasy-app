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
  /** false until AsyncStorage has been read: the banner waits, so a dismissed notice never flashes */
  hydrated: boolean;
  dismiss: (id: string) => void;
}

export const useNoticeStore = create<NoticeState>()(
  persist(
    (set) => ({
      dismissedIds: [],
      hydrated: false,
      dismiss: (id: string) => set((s) => ({ dismissedIds: withDismissed(s.dismissedIds, id) })),
    }),
    {
      name: 'notice-dismissals',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ dismissedIds: s.dismissedIds }),
      // a corrupted or foreign value on the device must not crash the panel: keep only string ids
      merge: (persisted, current) => {
        const ids = (persisted as { dismissedIds?: unknown } | undefined)?.dismissedIds;
        return { ...current, dismissedIds: Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [] };
      },
      // runs after a successful or failed read alike, so the banner is never held back for good
      onRehydrateStorage: () => () => { useNoticeStore.setState({ hydrated: true }); },
    }
  )
);
