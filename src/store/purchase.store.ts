import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { secureStorage } from '../utils/secureStorage';
import { Alert, Platform } from 'react-native';
import { PRODUCT_IDS, ALL_PRODUCT_IDS, AVATAR_PACK_CREDITS } from '../config/products';
import { functions, httpsCallable } from '../config/firebase';
import { usePitWallStore } from './pitwall.store';
import { receiptOf, storeOf, type StorePurchase } from '../pitwall/receipt';

// Module-level pending context for bridging requestPurchase → listener callback
let pendingLeagueId: string | null = null;
let pendingUserId: string | null = null;

/** One purchase request, shaped per platform the way the library expects. */
const buy = async (sku: string): Promise<void> => {
  const Iap = require('expo-iap');
  await Iap.requestPurchase({ request: { apple: { sku }, google: { skus: [sku] } }, type: 'in-app' });
};

interface PurchaseHistoryEntry {
  sku: string;
  date: string;
  leagueId?: string;
}

interface ServerPurchase {
  id: string;
  productId: string;
  purchaseToken?: string;
  transactionReceipt?: string;
  transactionId?: string;
  platform?: string;
  status: string;
  validatedAt?: string;
  createdAt?: string;
}

interface PurchaseState {
  // Persisted
  bonusAvatarCredits: Record<string, number>; // userId -> bonus credits remaining
  expandedLeagueIds: string[];
  pendingExpansionCredits: number;
  leagueSlotCredits: number; // extra league slots purchased
  purchaseHistory: PurchaseHistoryEntry[];
  lastSyncedAt: string | null;

  // Transient
  isInitialized: boolean;
  isPurchasing: boolean;

  // Actions
  initializeIAP: () => Promise<void>;
  cleanupIAP: () => void;
  purchaseLeagueExpansion: (leagueId?: string) => Promise<void>;
  purchaseAvatarPack: (userId: string) => Promise<void>;
  purchaseLeagueSlot: () => Promise<void>;
  /** Buy the Pit Wall Pass. Resolves once the store has the order; the entitlement lands when the server grants it. */
  purchasePitWallPass: () => Promise<void>;
  isLeagueExpanded: (leagueId: string) => boolean;
  getBonusCredits: (userId: string) => number;
  consumeBonusCredit: (userId: string) => void;
  hasExpansionCredit: () => boolean;
  consumeExpansionCredit: () => boolean;
  hasLeagueSlotCredit: () => boolean;
  consumeLeagueSlotCredit: () => boolean;
  handlePurchaseComplete: (purchase: { productId: string; purchaseToken?: string; transactionReceipt?: string; transactionId?: string }) => Promise<void>;
  handlePurchaseError: (error: { code: string; message: string }) => void;
  recordPurchaseOnServer: (productId: string, verificationData: { purchaseToken?: string; transactionReceipt?: string; transactionId?: string }, platform: string) => Promise<void>;
  syncPurchasesFromServer: () => Promise<void>;
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
      lastSyncedAt: null,

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
          const Iap = require('expo-iap');
          await Iap.initConnection();

          // Ask the store about every product, so a missing one shows up in the log at start-up
          // rather than as a failed purchase later.
          await Iap.fetchProducts({ skus: [...ALL_PRODUCT_IDS], type: 'in-app' });

          Iap.purchaseUpdatedListener(async (purchase: StorePurchase) => {
            await get().handlePurchaseComplete(purchase);
          });

          Iap.purchaseErrorListener((error: { code: string; message: string }) => {
            get().handlePurchaseError(error);
          });

          set({ isInitialized: true });

          // Sync purchases from server in background (reconcile after reinstall)
          get().syncPurchasesFromServer().catch((err) => {
            console.warn('Purchase sync failed (non-critical):', err);
          });
        } catch (err) {
          console.warn('IAP init failed (expected in dev/emulator):', err);
          set({ isInitialized: true });
        }
      },

      cleanupIAP: () => {
        try {
          require('expo-iap').endConnection();
        } catch { /* never initialised */ }
        set({ isInitialized: false });
      },

      recordPurchaseOnServer: async (productId: string, verificationData: { purchaseToken?: string; transactionReceipt?: string; transactionId?: string; userIdAmazon?: string }, platform: string) => {
        try {
          const validatePurchaseFn = httpsCallable(functions, 'validatePurchase');
          await validatePurchaseFn({ productId, ...verificationData, platform });
        } catch (err) {
          // For everything else the entitlement is already on the device and this call only
          // persists it. The Pit Wall Pass is the opposite: the server grant IS the entitlement,
          // so a failure here has to be visible and the receipt has to survive for a retry.
          if (productId === PRODUCT_IDS.PITWALL_PASS) throw err;
          console.warn('Failed to record purchase on server:', err);
        }
      },

      syncPurchasesFromServer: async () => {
        try {
          const getUserPurchasesFn = httpsCallable<unknown, ServerPurchase[]>(functions, 'getUserPurchases');
          const result = await getUserPurchasesFn({});
          const serverPurchases = result.data;

          if (!serverPurchases || serverPurchases.length === 0) return;

          // Count purchases by product on server
          const serverCounts: Record<string, number> = {};
          for (const p of serverPurchases) {
            serverCounts[p.productId] = (serverCounts[p.productId] || 0) + 1;
          }

          const state = get();

          // Count local purchases by product
          const localCounts: Record<string, number> = {};
          for (const p of state.purchaseHistory) {
            localCounts[p.sku] = (localCounts[p.sku] || 0) + 1;
          }

          // Only override local if server has MORE (e.g., after reinstall)
          const serverExpansions = serverCounts[PRODUCT_IDS.LEAGUE_EXPANSION] || 0;
          const localExpansions = localCounts[PRODUCT_IDS.LEAGUE_EXPANSION] || 0;
          const serverSlots = serverCounts[PRODUCT_IDS.LEAGUE_SLOT] || 0;
          const localSlots = localCounts[PRODUCT_IDS.LEAGUE_SLOT] || 0;
          const serverAvatars = serverCounts[PRODUCT_IDS.AVATAR_PACK] || 0;
          const localAvatars = localCounts[PRODUCT_IDS.AVATAR_PACK] || 0;

          const updates: Partial<PurchaseState> = {
            lastSyncedAt: new Date().toISOString(),
          };

          if (serverExpansions > localExpansions) {
            updates.pendingExpansionCredits = state.pendingExpansionCredits + (serverExpansions - localExpansions);
          }
          if (serverSlots > localSlots) {
            updates.leagueSlotCredits = state.leagueSlotCredits + (serverSlots - localSlots);
          }
          if (serverAvatars > localAvatars) {
            // Can't easily re-attribute avatar credits to specific user here,
            // so just log the discrepancy
            console.warn(`Server has ${serverAvatars - localAvatars} more avatar packs than local`);
          }

          set(updates);
        } catch (err) {
          console.warn('syncPurchasesFromServer failed:', err);
        }
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
          await buy(PRODUCT_IDS.LEAGUE_EXPANSION);
        } catch (err: any) {
          set({ isPurchasing: false });
          pendingLeagueId = null;
          if (err?.code !== 'E_USER_CANCELLED') {
            Alert.alert(
              'Purchase Unavailable',
              'In-app purchases are not available right now. Please try again later.'
            );
          }
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
          await buy(PRODUCT_IDS.AVATAR_PACK);
        } catch (err: any) {
          set({ isPurchasing: false });
          pendingUserId = null;
          if (err?.code !== 'E_USER_CANCELLED') {
            Alert.alert(
              'Purchase Unavailable',
              'In-app purchases are not available right now. Please try again later.'
            );
          }
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
          await buy(PRODUCT_IDS.LEAGUE_SLOT);
        } catch (err: any) {
          set({ isPurchasing: false });
          if (err?.code !== 'E_USER_CANCELLED') {
            Alert.alert(
              'Purchase Unavailable',
              'In-app purchases are not available right now. Please try again later.'
            );
          }
        }
      },

      purchasePitWallPass: async () => {
        const { useAuthStore } = require('./auth.store');
        if (useAuthStore.getState().isDemoMode) {
          Alert.alert('Demo mode', 'The Pit Wall Pass cannot be bought in demo mode.');
          return;
        }
        set({ isPurchasing: true });
        try {
          await buy(PRODUCT_IDS.PITWALL_PASS);
        } catch (err: any) {
          set({ isPurchasing: false });
          if (err?.code !== 'E_USER_CANCELLED') {
            Alert.alert('Purchase Unavailable', 'The Pit Wall Pass is not available right now. Please try again later.');
          }
        }
      },

      handlePurchaseComplete: async (purchase: { productId: string; purchaseToken?: string; transactionReceipt?: string; transactionId?: string }) => {
        try {
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

          if (productId === PRODUCT_IDS.PITWALL_PASS) {
            // The pass is not granted on the device. The server checks the receipt with the store,
            // writes the pass and a trigger stamps the auth claim the Firestore rules read. Only
            // once that has happened is the transaction finished, so a failure leaves the receipt
            // with the store to be retried rather than losing a paid pass.
            await get().recordPurchaseOnServer(productId, receiptOf(purchase, Platform.OS), storeOf(purchase, Platform.OS));
            await require('expo-iap').finishTransaction({ purchase, isConsumable: true });
            set((state) => ({ purchaseHistory: [...state.purchaseHistory, { sku: productId, date: new Date().toISOString() }] }));
            // Pick up the claim now rather than an hour from now, when the token would refresh.
            await usePitWallStore.getState().refresh(true);
            Alert.alert('Pit Wall Pass', 'Your pass is active. Open Pit Wall from your profile.');
            return;
          }

          // Finish the transaction (consumable so it can be re-purchased next season)
          await require('expo-iap').finishTransaction({ purchase, isConsumable: true });

          // Record on server for persistence across reinstalls
          await get().recordPurchaseOnServer(productId, receiptOf(purchase, Platform.OS), storeOf(purchase, Platform.OS)).catch(() => {});
        } catch (err) {
          console.error('Error completing purchase:', err);
          if (purchase.productId === PRODUCT_IDS.PITWALL_PASS) {
            // Unfinished, so the store hands it back on the next start and this runs again.
            Alert.alert('Pit Wall Pass', 'The purchase went through but activating it failed. It will finish by itself next time you open the app.');
          }
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
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        bonusAvatarCredits: state.bonusAvatarCredits,
        expandedLeagueIds: state.expandedLeagueIds,
        pendingExpansionCredits: state.pendingExpansionCredits,
        leagueSlotCredits: state.leagueSlotCredits,
        purchaseHistory: state.purchaseHistory,
        lastSyncedAt: state.lastSyncedAt,
      }),
    }
  )
);
