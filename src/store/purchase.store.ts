import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { secureStorage } from '../utils/secureStorage';
import { Alert, Platform } from 'react-native';
import { PRODUCT_IDS, ALL_PRODUCT_IDS, AVATAR_PACK_CREDITS } from '../config/products';
import { readStorePrices } from './storePrices';
import { functions, httpsCallable, firebaseAuth } from '../config/firebase';
import { usePitWallStore } from './pitwall.store';
import { receiptOf, storeOf, transactionKeyOf, type StorePurchase } from '../pitwall/receipt';
import { alreadyHonoured, grantDecision, isTerminalValidationError, rememberHonoured } from './purchaseGrant';

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
  /**
   * Store transactions this device has already granted something for (F-092). Persisted, because
   * the double-grant it prevents happens across launches: a purchase whose `finishTransaction`
   * never completed is handed back by the store on every start.
   */
  honouredTransactions: string[];

  // Transient
  isInitialized: boolean;
  isPurchasing: boolean;
  /** product id -> the price string the store itself formatted, in the buyer's currency. */
  storePrices: Record<string, string>;

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
  /** `isReplay` marks a purchase the store handed back at launch rather than one just bought. */
  handlePurchaseComplete: (purchase: { productId: string; purchaseToken?: string; transactionReceipt?: string; transactionId?: string }, opts?: { isReplay?: boolean }) => Promise<void>;
  handlePurchaseError: (error: { code: string; message: string }) => void;
  /** @returns whether the server had already recorded this store transaction. */
  recordPurchaseOnServer: (productId: string, verificationData: { purchaseToken?: string; transactionReceipt?: string; transactionId?: string }, platform: string) => Promise<{ duplicate: boolean }>;
  syncPurchasesFromServer: () => Promise<void>;
  /** Finish anything the store is still holding from a previous run. */
  replayHeldPurchases: () => Promise<void>;
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
      honouredTransactions: [],

      // Transient state
      isInitialized: false,
      isPurchasing: false,
      // Not persisted: a price belongs to the storefront and the currency of the moment, so it is
      // asked for again every launch rather than remembered from the last one.
      storePrices: {},

      initializeIAP: async () => {
        // Once only. A second call would register a second purchaseUpdatedListener, and a purchase
        // delivered to two handlers is granted twice and finished twice.
        if (get().isInitialized) return;
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

          // The listeners go on before anything else that can fail. They are the only route from a
          // completed purchase to the server grant, so a session that reaches `requestPurchase`
          // without them is one where the buyer pays and is granted nothing — which is the whole
          // defect this wiring exists to fix, and it would come straight back if a failed price
          // fetch could skip past this.
          Iap.purchaseUpdatedListener(async (purchase: StorePurchase) => {
            await get().handlePurchaseComplete(purchase);
          });

          Iap.purchaseErrorListener((error: { code: string; message: string }) => {
            get().handlePurchaseError(error);
          });

          set({ isInitialized: true });

          // Ask the store about every product, so a missing one shows up in the log at start-up
          // rather than as a failed purchase later. The answer also carries the price as that
          // storefront formats it, which is the only price we may show: the catalogue's "$14.99" is
          // the US one and would be wrong, in the wrong currency, everywhere else.
          //
          // Its own try: an offline launch or a SKU not yet active in one storefront must cost us
          // the price label, never the listeners.
          try {
            const products = await Iap.fetchProducts({ skus: [...ALL_PRODUCT_IDS], type: 'in-app' });
            const prices = readStorePrices(products);
            const missing = ALL_PRODUCT_IDS.filter((id) => !prices[id]);
            if (missing.length) console.warn('[iap] store did not return these products:', missing.join(', '));
            set({ storePrices: prices });
          } catch (err) {
            console.warn('[iap] price fetch failed; the row will not show a price:', err);
          }

          // Two different recoveries, and the app only ever did the second one.
          //
          // The store holds a purchase until the app finishes it, and it only finishes one after
          // the server has granted the entitlement. So a purchase whose grant failed — the server
          // down, a receipt it could not verify, no network — is still sitting with the store on
          // the next launch, and nothing was asking for it. The buyer had paid, the store would not
          // sell it again because they already owned it, and the app told them it would sort itself
          // out next time. It never would have.
          await get().replayHeldPurchases().catch((err) => {
            console.warn('[iap] replay of held purchases failed:', err);
          });

          // Reconcile against what the server already knows, which is what restores device-local
          // credits after a reinstall. It cannot recover a purchase the server never recorded.
          //
          // After the replay, not alongside it. The replay now records a purchase with the server
          // before granting it locally, so a sync running in parallel could read the server's copy
          // while the local history was still empty, see itself one credit short, and top up —
          // granting twice for one payment through the other door (F-092).
          await get().syncPurchasesFromServer().catch((err) => {
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

      /**
       * Validates the receipt with the server and reports whether the server had already recorded
       * it. That flag is half of the double-grant guard (F-092): it is the only thing that knows
       * about a purchase made on a device this one has never been, and it survives a reinstall,
       * which the local honoured list cannot.
       *
       * It throws on failure now, for every product. It used to swallow the error for the three
       * consumables, on the reasoning that the entitlement was already on the device and this call
       * only persisted it — but that reasoning is what let a purchase be granted again on each
       * launch. A purchase that cannot be validated is left unfinished with the store instead, and
       * tried again next start, exactly as the pass has always been.
       */
      recordPurchaseOnServer: async (productId: string, verificationData: { purchaseToken?: string; transactionReceipt?: string; transactionId?: string; userIdAmazon?: string }, platform: string) => {
        const validatePurchaseFn = httpsCallable<Record<string, unknown>, { success?: boolean; purchaseId?: string; duplicate?: boolean }>(functions, 'validatePurchase');
        const result = await validatePurchaseFn({ productId, ...verificationData, platform });
        return { duplicate: result.data?.duplicate === true };
      },

      replayHeldPurchases: async () => {
        try {
          const Iap = require('expo-iap');
          const held = await Iap.getAvailablePurchases();
          const list = Array.isArray(held) ? held : [];
          if (!list.length) return;
          console.log(`[iap] the store is holding ${list.length} unfinished purchase(s); finishing them`);
          // One at a time. These go through the same handler a live purchase does, so each one
          // validates, grants and finishes exactly as it would have at the till, and the server's
          // own de-duplication makes a replay of something already recorded a no-op.
          for (const purchase of list) {
            try {
              await get().handlePurchaseComplete(purchase as StorePurchase, { isReplay: true });
            } catch (err) {
              // Left unfinished on purpose, so the store hands it back again next launch. This is
              // the state a buyer is stuck in, and it has to stay recoverable rather than be
              // swallowed here.
              console.warn('[iap] could not finish a held purchase; it stays with the store:', err instanceof Error ? err.message : err);
            }
          }
        } catch (err) {
          console.warn('[iap] could not ask the store what it is holding:', err instanceof Error ? err.message : err);
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

          const now = new Date().toISOString();
          const updates: Partial<PurchaseState> = { lastSyncedAt: now };
          // Every top-up also writes the history rows it was derived from. The comparison above is
          // against `purchaseHistory`, so a top-up that did not record itself was recomputed on the
          // next launch and applied again — the same once-per-launch grant this feature is about,
          // reached by a different road (F-092).
          const history: PurchaseHistoryEntry[] = [];
          const rows = (sku: string, n: number) => { for (let i = 0; i < n; i++) history.push({ sku, date: now }); };

          if (serverExpansions > localExpansions) {
            const delta = serverExpansions - localExpansions;
            updates.pendingExpansionCredits = state.pendingExpansionCredits + delta;
            rows(PRODUCT_IDS.LEAGUE_EXPANSION, delta);
          }
          if (serverSlots > localSlots) {
            const delta = serverSlots - localSlots;
            updates.leagueSlotCredits = state.leagueSlotCredits + delta;
            rows(PRODUCT_IDS.LEAGUE_SLOT, delta);
          }
          if (serverAvatars > localAvatars) {
            // This is the way back for an avatar pack the server has and this device does not —
            // after a reinstall, or after a purchase was recorded and then replayed. It used to
            // only log, on the reasoning that the credits could not be attributed to a user; but
            // `getUserPurchases` answers for the signed-in account and nobody else, so that
            // account is exactly who they belong to. Without this the pack was consumed and lost.
            const uid = firebaseAuth.currentUser?.uid ?? null;
            const delta = serverAvatars - localAvatars;
            if (uid) {
              updates.bonusAvatarCredits = {
                ...state.bonusAvatarCredits,
                [uid]: (state.bonusAvatarCredits[uid] || 0) + delta * AVATAR_PACK_CREDITS,
              };
              rows(PRODUCT_IDS.AVATAR_PACK, delta);
            } else {
              // Signed out mid-sync. Leave the gap for the next launch rather than crediting
              // nobody and recording that it was handled.
              console.warn(`[iap] ${delta} avatar pack(s) on the server with nobody signed in to credit`);
            }
          }

          if (history.length) updates.purchaseHistory = [...state.purchaseHistory, ...history];
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
        // Claimed before the refresh below, not after: that refresh is a network round trip, and
        // until the flag is set the row still looks idle and takes a second press. Two presses are
        // two charges, and the server never extends an existing pass, so the second buys nothing.
        if (get().isPurchasing) return;
        set({ isPurchasing: true });
        try {
          // Refuse before the store takes any money. Forced, because a stale token is exactly how
          // someone ends up buying twice.
          await usePitWallStore.getState().refresh(true);
          if (usePitWallStore.getState().pass.active) {
            set({ isPurchasing: false });
            Alert.alert('Pit Wall Pass', 'You already have a pass for this season.');
            return;
          }
        } catch {
          // The pass could not be read, so whether one is already held is unknown. Do not sell.
          set({ isPurchasing: false });
          Alert.alert('Pit Wall Pass', 'Could not check your pass just now. Check your connection and try again.');
          return;
        }
        try {
          await buy(PRODUCT_IDS.PITWALL_PASS);
        } catch (err: any) {
          set({ isPurchasing: false });
          if (err?.code !== 'E_USER_CANCELLED') {
            Alert.alert('Purchase Unavailable', 'The Pit Wall Pass is not available right now. Please try again later.');
          }
        }
      },

      handlePurchaseComplete: async (purchase: { productId: string; purchaseToken?: string; transactionReceipt?: string; transactionId?: string }, opts?: { isReplay?: boolean }) => {
        const isReplay = opts?.isReplay === true;
        try {
          const { productId } = purchase;
          const receipt = () => receiptOf(purchase, Platform.OS);
          const store = () => storeOf(purchase, Platform.OS);

          if (productId === PRODUCT_IDS.LEAGUE_EXPANSION || productId === PRODUCT_IDS.LEAGUE_SLOT || productId === PRODUCT_IDS.AVATAR_PACK) {
            // The three consumables used to be granted here and then recorded, which is how one
            // payment became one credit per launch: a purchase the store could not finish is handed
            // back on every start, and nothing remembered it had already been honoured (F-092).
            //
            // So the server answers first — it is the only party that knows about a purchase made
            // on another device, and about one made before a reinstall — and this device keeps its
            // own list of honoured transactions for when the server cannot be reached at all. A
            // validation failure throws, leaving the purchase with the store to be tried again,
            // which is what the pass has always done.
            const key = transactionKeyOf(purchase, Platform.OS);

            // Avatar credits are the one grant that needs a person: they are held per account, so
            // there is nowhere to put them with nobody signed in. Stop here rather than anywhere
            // later in this function, because every later exit finishes the transaction — and a
            // finished transaction is gone. Signed out at the till, or signed out at the launch
            // that replays it, the pack stays with the store until there is an account to credit.
            const avatarUid = pendingUserId ?? firebaseAuth.currentUser?.uid ?? null;
            if (productId === PRODUCT_IDS.AVATAR_PACK && !avatarUid) {
              throw new Error('no signed-in account to credit the avatar pack to');
            }

            // No need to ask the server about a transaction this device has already granted for —
            // and not asking is what lets the offline replay loop finish the transaction at all.
            let duplicate: boolean;
            if (alreadyHonoured(get().honouredTransactions, key)) {
              duplicate = true;
            } else {
              try {
                ({ duplicate } = await get().recordPurchaseOnServer(productId, receipt(), store()));
              } catch (err) {
                // A refusal that retrying cannot fix has to end the loop, or the store hands this
                // purchase back on every launch forever — and on Play an unconsumed consumable
                // also stops the buyer from purchasing that product again.
                if (!isTerminalValidationError(err)) throw err;
                console.warn('[iap] the store cannot validate this purchase and never will; finishing it ungranted:', err instanceof Error ? err.message : err);
                set((state) => ({ honouredTransactions: rememberHonoured(state.honouredTransactions, key) }));
                await require('expo-iap').finishTransaction({ purchase, isConsumable: true });
                return;
              }
            }
            const decision = grantDecision({ key, honoured: get().honouredTransactions, duplicate, isReplay });

            if (decision === 'grant') {
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
                if (!isReplay) Alert.alert('Purchase Complete', 'League expansion unlocked!');
              } else if (productId === PRODUCT_IDS.LEAGUE_SLOT) {
                set((state) => ({
                  leagueSlotCredits: state.leagueSlotCredits + 1,
                  purchaseHistory: [...state.purchaseHistory, { sku: productId, date: new Date().toISOString() }],
                }));
                if (!isReplay) Alert.alert('Purchase Complete', 'Extra league slot unlocked!');
              } else {
                // On a replay there is no pending context — the buy call that set it was a launch
                // ago — so this falls back to whoever is signed in. Without that the credits went
                // nowhere and the transaction was finished anyway: paid for, never granted. The
                // guard at the top of this branch has already established there is somebody.
                const userId = avatarUid as string;
                set((state) => ({
                  bonusAvatarCredits: {
                    ...state.bonusAvatarCredits,
                    [userId]: (state.bonusAvatarCredits[userId] || 0) + AVATAR_PACK_CREDITS,
                  },
                  purchaseHistory: [...state.purchaseHistory, { sku: productId, date: new Date().toISOString() }],
                }));
                if (!isReplay) Alert.alert('Purchase Complete', `${AVATAR_PACK_CREDITS} avatar credits added!`);
              }
            } else if (decision === 'cannot-verify') {
              console.warn('[iap] a replayed purchase carries no transaction id; leaving the grant to the server sync');
            } else {
              console.log(`[iap] ${productId} already honoured (${decision}); finishing without granting again`);
            }

            pendingLeagueId = null;
            pendingUserId = null;
            set((state) => ({ honouredTransactions: rememberHonoured(state.honouredTransactions, key) }));
            // Only now: a finished transaction is one the store will not hand back, so finishing
            // before the grant is recorded is how a purchase gets lost.
            await require('expo-iap').finishTransaction({ purchase, isConsumable: true });
            return;
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

          // A product this build does not know about, so there is nothing to grant and nothing to
          // de-duplicate. Try to record it — the receipt is worth keeping — but finish it either
          // way: `validatePurchase` refuses an unknown product id outright, and leaving it
          // unfinished would hand it back on every launch for the life of the install.
          await get().recordPurchaseOnServer(productId, receipt(), store()).catch((err) => {
            console.warn('[iap] could not record an unrecognised product; finishing it anyway:', err instanceof Error ? err.message : err);
          });
          await require('expo-iap').finishTransaction({ purchase, isConsumable: true });
        } catch (err) {
          console.error('Error completing purchase:', err);
          // Unfinished, so the store hands it back on the next start and this runs again. Say so
          // when someone is standing there having just paid; a replay failing at launch is not
          // something to interrupt anyone about.
          if (purchase.productId === PRODUCT_IDS.PITWALL_PASS) {
            Alert.alert('Pit Wall Pass', 'The purchase went through but activating it failed. It will finish by itself next time you open the app.');
          } else if (!isReplay) {
            Alert.alert('Purchase received', 'Your purchase went through but could not be applied just yet. It will finish by itself next time you open the app.');
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
        honouredTransactions: state.honouredTransactions,
      }),
    }
  )
);
