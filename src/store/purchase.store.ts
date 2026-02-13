import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { PRODUCT_IDS, AVATAR_PACK_CREDITS } from '../config/products';

// Module-level pending context for bridging requestPurchase → listener callback
let pendingLeagueId: string | null = null;
let pendingUserId: string | null = null;

interface PurchaseHistoryEntry {
  sku: string;
  date: string;
  leagueId?: string;
}

interface PurchaseState {
  // Persisted
  bonusAvatarCredits: Record<string, number>; // userId -> bonus credits remaining
  expandedLeagueIds: string[];
  pendingExpansionCredits: number;
  leagueSlotCredits: number; // extra league slots purchased
  purchaseHistory: PurchaseHistoryEntry[];

  // Transient
  isInitialized: boolean;
  isPurchasing: boolean;

  // Actions
  initializeIAP: () => Promise<void>;
  cleanupIAP: () => void;
  purchaseLeagueExpansion: (leagueId?: string) => Promise<void>;
  purchaseAvatarPack: (userId: string) => Promise<void>;
  purchaseLeagueSlot: () => Promise<void>;
  isLeagueExpanded: (leagueId: string) => boolean;
  getBonusCredits: (userId: string) => number;
  consumeBonusCredit: (userId: string) => void;
  hasExpansionCredit: () => boolean;
  consumeExpansionCredit: () => boolean;
  hasLeagueSlotCredit: () => boolean;
  consumeLeagueSlotCredit: () => boolean;
  handlePurchaseComplete: (purchase: { productId: string }) => Promise<void>;
  handlePurchaseError: (error: { code: string; message: string }) => void;
}

export const usePurchaseStore = create<PurchaseState>()(
  persist(
    (set, get) => ({
      // Persisted state
      bonusAvatarCredits: {},
      expandedLeagueIds: [],
      pendingExpansionCredits: 0,
      leagueSlotCredits: 0,
      purchaseHistory: [],

      // Transient state
      isInitialized: false,
      isPurchasing: false,

      initializeIAP: async () => {
        // Lazy import to avoid bundling issues when IAP isn't configured
        const { useAuthStore } = require('./auth.store');
        const isDemoMode = useAuthStore.getState().isDemoMode;
        if (isDemoMode) {
          set({ isInitialized: true });
          return;
        }

        try {
          const RNIap = require('react-native-iap');
          await RNIap.initConnection();

          // Fetch products
          await RNIap.getProducts({
            skus: [PRODUCT_IDS.LEAGUE_EXPANSION, PRODUCT_IDS.AVATAR_PACK, PRODUCT_IDS.LEAGUE_SLOT],
          });

          // Register purchase listener
          RNIap.purchaseUpdatedListener(async (purchase: { productId: string }) => {
            await get().handlePurchaseComplete(purchase);
          });

          RNIap.purchaseErrorListener((error: { code: string; message: string }) => {
            get().handlePurchaseError(error);
          });

          set({ isInitialized: true });
        } catch (err) {
          console.warn('IAP init failed (expected in dev/emulator):', err);
          set({ isInitialized: true });
        }
      },

      cleanupIAP: () => {
        try {
          const RNIap = require('react-native-iap');
          RNIap.endConnection();
        } catch {}
        set({ isInitialized: false });
      },

      purchaseLeagueExpansion: async (leagueId?: string) => {
        const { useAuthStore } = require('./auth.store');
        const isDemoMode = useAuthStore.getState().isDemoMode;

        if (isDemoMode) {
          // Demo mode: immediately grant
          set((state) => ({
            pendingExpansionCredits: state.pendingExpansionCredits + 1,
            purchaseHistory: [
              ...state.purchaseHistory,
              { sku: PRODUCT_IDS.LEAGUE_EXPANSION, date: new Date().toISOString(), leagueId },
            ],
          }));
          Alert.alert('Purchase Complete', 'League expansion unlocked! (Demo mode)');
          return;
        }

        set({ isPurchasing: true });
        pendingLeagueId = leagueId || null;
        try {
          const RNIap = require('react-native-iap');
          await RNIap.requestPurchase({ sku: PRODUCT_IDS.LEAGUE_EXPANSION });
        } catch (err) {
          set({ isPurchasing: false });
          pendingLeagueId = null;
        }
      },

      purchaseAvatarPack: async (userId: string) => {
        const { useAuthStore } = require('./auth.store');
        const isDemoMode = useAuthStore.getState().isDemoMode;

        if (isDemoMode) {
          // Demo mode: immediately grant credits
          set((state) => ({
            bonusAvatarCredits: {
              ...state.bonusAvatarCredits,
              [userId]: (state.bonusAvatarCredits[userId] || 0) + AVATAR_PACK_CREDITS,
            },
            purchaseHistory: [
              ...state.purchaseHistory,
              { sku: PRODUCT_IDS.AVATAR_PACK, date: new Date().toISOString() },
            ],
          }));
          Alert.alert('Purchase Complete', `${AVATAR_PACK_CREDITS} avatar credits added! (Demo mode)`);
          return;
        }

        set({ isPurchasing: true });
        pendingUserId = userId;
        try {
          const RNIap = require('react-native-iap');
          await RNIap.requestPurchase({ sku: PRODUCT_IDS.AVATAR_PACK });
        } catch (err) {
          set({ isPurchasing: false });
          pendingUserId = null;
        }
      },

      purchaseLeagueSlot: async () => {
        const { useAuthStore } = require('./auth.store');
        const isDemoMode = useAuthStore.getState().isDemoMode;

        if (isDemoMode) {
          set((state) => ({
            leagueSlotCredits: state.leagueSlotCredits + 1,
            purchaseHistory: [
              ...state.purchaseHistory,
              { sku: PRODUCT_IDS.LEAGUE_SLOT, date: new Date().toISOString() },
            ],
          }));
          Alert.alert('Purchase Complete', 'Extra league slot unlocked! (Demo mode)');
          return;
        }

        set({ isPurchasing: true });
        try {
          const RNIap = require('react-native-iap');
          await RNIap.requestPurchase({ sku: PRODUCT_IDS.LEAGUE_SLOT });
        } catch (err) {
          set({ isPurchasing: false });
        }
      },

      handlePurchaseComplete: async (purchase: { productId: string }) => {
        try {
          const RNIap = require('react-native-iap');
          const { productId } = purchase;

          if (productId === PRODUCT_IDS.LEAGUE_EXPANSION) {
            set((state) => ({
              pendingExpansionCredits: state.pendingExpansionCredits + 1,
              expandedLeagueIds: pendingLeagueId
                ? [...state.expandedLeagueIds, pendingLeagueId]
                : state.expandedLeagueIds,
              purchaseHistory: [
                ...state.purchaseHistory,
                { sku: productId, date: new Date().toISOString(), leagueId: pendingLeagueId || undefined },
              ],
            }));
            Alert.alert('Purchase Complete', 'League expansion unlocked!');
            pendingLeagueId = null;
          } else if (productId === PRODUCT_IDS.LEAGUE_SLOT) {
            set((state) => ({
              leagueSlotCredits: state.leagueSlotCredits + 1,
              purchaseHistory: [
                ...state.purchaseHistory,
                { sku: productId, date: new Date().toISOString() },
              ],
            }));
            Alert.alert('Purchase Complete', 'Extra league slot unlocked!');
          } else if (productId === PRODUCT_IDS.AVATAR_PACK) {
            const userId = pendingUserId;
            if (userId) {
              set((state) => ({
                bonusAvatarCredits: {
                  ...state.bonusAvatarCredits,
                  [userId]: (state.bonusAvatarCredits[userId] || 0) + AVATAR_PACK_CREDITS,
                },
                purchaseHistory: [
                  ...state.purchaseHistory,
                  { sku: productId, date: new Date().toISOString() },
                ],
              }));
              Alert.alert('Purchase Complete', `${AVATAR_PACK_CREDITS} avatar credits added!`);
            }
            pendingUserId = null;
          }

          // Finish the transaction (consumable so it can be re-purchased)
          await RNIap.finishTransaction({ purchase, isConsumable: true });
        } catch (err) {
          console.error('Error completing purchase:', err);
        } finally {
          set({ isPurchasing: false });
        }
      },

      handlePurchaseError: (error: { code: string; message: string }) => {
        set({ isPurchasing: false });
        pendingLeagueId = null;
        pendingUserId = null;

        // Don't show alert for user cancellations
        if (error.code === 'E_USER_CANCELLED') return;

        Alert.alert('Purchase Failed', error.message || 'Something went wrong. Please try again.');
      },

      isLeagueExpanded: (leagueId: string) => {
        return get().expandedLeagueIds.includes(leagueId);
      },

      getBonusCredits: (userId: string) => {
        return get().bonusAvatarCredits[userId] || 0;
      },

      consumeBonusCredit: (userId: string) => {
        const current = get().bonusAvatarCredits[userId] || 0;
        if (current <= 0) return;
        set((state) => ({
          bonusAvatarCredits: {
            ...state.bonusAvatarCredits,
            [userId]: current - 1,
          },
        }));
      },

      hasExpansionCredit: () => {
        return get().pendingExpansionCredits > 0;
      },

      consumeExpansionCredit: () => {
        const credits = get().pendingExpansionCredits;
        if (credits <= 0) return false;
        set({ pendingExpansionCredits: credits - 1 });
        return true;
      },

      hasLeagueSlotCredit: () => {
        return get().leagueSlotCredits > 0;
      },

      consumeLeagueSlotCredit: () => {
        const credits = get().leagueSlotCredits;
        if (credits <= 0) return false;
        set({ leagueSlotCredits: credits - 1 });
        return true;
      },
    }),
    {
      name: 'purchase-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        bonusAvatarCredits: state.bonusAvatarCredits,
        expandedLeagueIds: state.expandedLeagueIds,
        pendingExpansionCredits: state.pendingExpansionCredits,
        leagueSlotCredits: state.leagueSlotCredits,
        purchaseHistory: state.purchaseHistory,
      }),
    }
  )
);
