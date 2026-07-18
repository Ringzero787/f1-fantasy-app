// Purchase service for IAP integration.
//
// USE_REAL_IAP toggle: when true, purchases go through react-native-iap →
// tl_validatePurchase Cloud Function → entitlement application. When false,
// the mock flow applies entitlements client-side without billing — used during
// development and for emulator testing before SKUs are registered.
//
// Set USE_REAL_IAP=true after:
//   1. All SKUs registered in App Store Connect / Play Console / Amazon Developer
//   2. App signed with production cert (TestFlight / Play internal track)
//   3. APPLE_SHARED_SECRET set via `firebase functions:secrets:set`

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
  increment,
} from 'firebase/firestore';
import { db, functions, httpsCallable } from '../config/firebase';
import { garageService } from './garage.service';
import {
  consumableProducts,
  garageExpansionProducts,
  cosmeticPacks,
  monetizationConfig,
  DEFAULT_HELMET_ITEM_ID,
  DEFAULT_HELMET_URL,
  getHelmetUrl,
} from '../data/cosmeticsCatalog';
import { realPurchasesService } from './realPurchases.service';
import type {
  IAPProductId,
  UserEntitlements,
  CosmeticSurface,
} from '../types';

// Flip this to true after SKUs are registered + app is on TestFlight / Play internal track.
export const USE_REAL_IAP = false;

const entitlementsDoc = (userId: string) => doc(db, 'tl_entitlements', userId);
const userDoc = (userId: string) => doc(db, 'tl_users', userId);

export const purchasesService = {
  async getEntitlements(userId: string): Promise<UserEntitlements> {
    // READ-ONLY: tl_entitlements is server-authoritative (rules deny client
    // writes). A missing doc — or missing fields on an old doc — resolve to
    // local defaults; the server creates/updates the doc on the first
    // purchase or cosmetic selection (tlMockPurchase / tlSelectCosmetic).
    const snap = await getDoc(entitlementsDoc(userId));
    if (!snap.exists()) {
      return {
        userId,
        extraDriverSlots: 0,
        extraConstructorSlots: 0,
        ownedCosmeticPacks: ['foundation'],
        activeCosmetics: { helmet_livery: DEFAULT_HELMET_ITEM_ID },
        commissionerProActive: false,
        updatedAt: new Date(),
      };
    }
    const ent = { userId, ...snap.data() } as UserEntitlements;
    if (!ent.ownedCosmeticPacks?.length) ent.ownedCosmeticPacks = ['foundation'];
    if (!ent.activeCosmetics?.helmet_livery) {
      ent.activeCosmetics = { ...ent.activeCosmetics, helmet_livery: DEFAULT_HELMET_ITEM_ID };
    }
    return ent;
  },

  // Mock purchase — grants the entitlement WITHOUT billing, via the
  // tlMockPurchase callable (entitlements are server-authoritative; client
  // writes are rules-denied). Used while USE_REAL_IAP is false; the server
  // disables it once real IAP goes live.
  async mockPurchase(args: {
    userId: string;
    productId: IAPProductId;
  }): Promise<{ success: true; productId: IAPProductId }> {
    const call = httpsCallable(functions, 'tlMockPurchase');
    await call({ productId: args.productId });
    return { success: true, productId: args.productId };
  },

  // Public purchase entry point — picks real or mock based on the toggle and
  // module availability.
  async requestPurchase(args: {
    userId: string;
    productId: IAPProductId;
  }): Promise<{ success: true; productId: IAPProductId; duplicate?: boolean; viaMock?: boolean }> {
    if (USE_REAL_IAP && realPurchasesService.isAvailable()) {
      try {
        const r = await realPurchasesService.requestPurchase(args.productId);
        return { success: true, productId: args.productId, duplicate: r.duplicate };
      } catch (err) {
        console.warn(
          `[tl] Real IAP failed for ${args.productId}, no mock fallback in production:`,
          err
        );
        throw err;
      }
    }
    const r = await this.mockPurchase(args);
    return { ...r, viaMock: true };
  },

  async restorePurchases(): Promise<{ count: number; errors: string[]; viaMock?: boolean }> {
    if (USE_REAL_IAP && realPurchasesService.isAvailable()) {
      return realPurchasesService.restorePurchases();
    }
    return { count: 0, errors: [], viaMock: true };
  },


  // Set the active cosmetic for a given surface (helmet, garage skin, etc.).
  // Validates that the user owns a pack containing this item. For helmets, also
  // mirrors the URL onto the user's tl_users doc so leaderboards/settlements
  // can render the right helmet for any user without an entitlements lookup.
  async selectCosmetic(args: {
    userId: string;
    surface: CosmeticSurface;
    cosmeticItemId: string;
  }): Promise<void> {
    const ent = await this.getEntitlements(args.userId);
    const pack = cosmeticPacks
      .filter((p) => ent.ownedCosmeticPacks.includes(p.id))
      .find((p) => p.items.some((i) => i.id === args.cosmeticItemId && i.surface === args.surface));
    if (!pack) {
      throw new Error('You do not own a pack containing that cosmetic');
    }
    // Entitlements are server-authoritative — equip via callable.
    const call = httpsCallable(functions, 'tlSelectCosmetic');
    await call({ surface: args.surface, cosmeticItemId: args.cosmeticItemId, packId: pack.id });
    if (args.surface === 'helmet_livery') {
      const url = getHelmetUrl(args.cosmeticItemId);
      if (url) {
        try {
          await updateDoc(userDoc(args.userId), { activeHelmetUrl: url });
        } catch {
          // avatar mirror is cosmetic — ignore
        }
      }
    }
  },


  // Returns all helmets the user currently owns (across all owned packs).
  ownedHelmets(ent: UserEntitlements): { id: string; name: string; url: string }[] {
    const owned: { id: string; name: string; url: string }[] = [];
    for (const pack of cosmeticPacks) {
      if (!ent.ownedCosmeticPacks.includes(pack.id)) continue;
      for (const item of pack.items) {
        if (item.surface === 'helmet_livery' && item.previewURL) {
          owned.push({ id: item.id, name: item.name, url: item.previewURL });
        }
      }
    }
    return owned;
  },

  isCommissionerProActive(ent: UserEntitlements): boolean {
    if (!ent.commissionerProActive) return false;
    if (!ent.commissionerProExpiresAt) return false;
    const expires =
      ent.commissionerProExpiresAt instanceof Date
        ? ent.commissionerProExpiresAt
        : new Date(ent.commissionerProExpiresAt as unknown as string);
    return expires.getTime() > Date.now();
  },
};
