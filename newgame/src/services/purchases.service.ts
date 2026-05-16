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
import { db } from '../config/firebase';
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
    const snap = await getDoc(entitlementsDoc(userId));
    if (!snap.exists()) {
      // First read — create entitlements with Foundation pack owned + default helmet active.
      const fresh: UserEntitlements = {
        userId,
        extraDriverSlots: 0,
        extraConstructorSlots: 0,
        ownedCosmeticPacks: ['foundation'],
        activeCosmetics: { helmet_livery: DEFAULT_HELMET_ITEM_ID },
        commissionerProActive: false,
        updatedAt: new Date(),
      };
      await setDoc(entitlementsDoc(userId), {
        ...fresh,
        updatedAt: serverTimestamp(),
      });
      // Mirror the helmet URL onto the user's tl_users doc so other UIs (leaderboards,
      // settlements) can render avatars without round-tripping to entitlements.
      try {
        await updateDoc(userDoc(userId), { activeHelmetUrl: DEFAULT_HELMET_URL });
      } catch {
        // user doc may not exist yet during very-first signup — auth.service handles it
      }
      return fresh;
    }
    const ent = { userId, ...snap.data() } as UserEntitlements;
    // Backfill missing helmet selection for existing users created before cosmetics shipped.
    if (!ent.activeCosmetics?.helmet_livery) {
      ent.activeCosmetics = { ...ent.activeCosmetics, helmet_livery: DEFAULT_HELMET_ITEM_ID };
      await updateDoc(entitlementsDoc(userId), {
        'activeCosmetics.helmet_livery': DEFAULT_HELMET_ITEM_ID,
        updatedAt: serverTimestamp(),
      });
      try {
        await updateDoc(userDoc(userId), { activeHelmetUrl: DEFAULT_HELMET_URL });
      } catch {
        // ignore
      }
    }
    return ent;
  },

  // Mock purchase — applies entitlements client-side without billing. Used
  // when USE_REAL_IAP is false (dev / emulator) and as a graceful fallback
  // when real IAP is unavailable (e.g. SKU not yet registered).
  async mockPurchase(args: {
    userId: string;
    productId: IAPProductId;
  }): Promise<{ success: true; productId: IAPProductId }> {
    await this.applyEntitlement(args.userId, args.productId);
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

  // Apply an entitlement after a verified purchase. This is what tl_validatePurchase
  // Cloud Function will call server-side; mirrored here for the mock flow.
  async applyEntitlement(userId: string, productId: IAPProductId): Promise<void> {
    // Garage expansion
    if (productId === 'tl.garage.driver_slot') {
      const ent = await this.getEntitlements(userId);
      if (ent.extraDriverSlots >= monetizationConfig.GARAGE_DRIVER_SLOT_CAP) {
        throw new Error('Driver slot cap reached');
      }
      await updateDoc(entitlementsDoc(userId), {
        extraDriverSlots: increment(1),
        updatedAt: serverTimestamp(),
      });
      // Bump active-roster slot capacity. Owned collection is unlimited; IAP
      // expands how many drivers you can deploy per race weekend.
      const garageRef = doc(db, 'tl_garages', userId);
      await updateDoc(garageRef, {
        rosterDriverSlots: increment(1),
        updatedAt: serverTimestamp(),
      });
      return;
    }

    if (productId === 'tl.garage.constructor_slot') {
      const ent = await this.getEntitlements(userId);
      if (ent.extraConstructorSlots >= monetizationConfig.GARAGE_CONSTRUCTOR_SLOT_CAP) {
        throw new Error('Constructor slot cap reached');
      }
      await updateDoc(entitlementsDoc(userId), {
        extraConstructorSlots: increment(1),
        updatedAt: serverTimestamp(),
      });
      const garageRef = doc(db, 'tl_garages', userId);
      await updateDoc(garageRef, {
        rosterConstructorSlots: increment(1),
        updatedAt: serverTimestamp(),
      });
      return;
    }

    // Cash bundles
    const cashProduct = consumableProducts.find((c) => c.productId === productId);
    if (cashProduct) {
      // Credit cash to garage. Records as a transaction so the cash leaderboard
      // can distinguish IAP-bought cash from earned cash later if we want.
      const garageRef = doc(db, 'tl_garages', userId);
      const garageSnap = await getDoc(garageRef);
      const currentCash = (garageSnap.data()?.cash as number | undefined) ?? 0;
      await updateDoc(garageRef, {
        cash: increment(cashProduct.cashAmount),
        updatedAt: serverTimestamp(),
      });
      await garageService.recordTransaction(userId, {
        type: 'reroll',
        delta: cashProduct.cashAmount,
        cashAfter: currentCash + cashProduct.cashAmount,
        description: `Bought ${cashProduct.cashAmount} cash bundle`,
      });
      return;
    }

    // Subscriptions
    if (productId === 'tl.commissioner_pro.monthly') {
      const expires = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
      await updateDoc(entitlementsDoc(userId), {
        commissionerProActive: true,
        commissionerProTier: 'monthly',
        commissionerProExpiresAt: expires,
        updatedAt: serverTimestamp(),
      });
      return;
    }

    if (productId === 'tl.commissioner_pro.yearly') {
      const expires = new Date(Date.now() + 366 * 24 * 60 * 60 * 1000);
      await updateDoc(entitlementsDoc(userId), {
        commissionerProActive: true,
        commissionerProTier: 'yearly',
        commissionerProExpiresAt: expires,
        updatedAt: serverTimestamp(),
      });
      return;
    }

    // Cosmetic packs — productId starts with 'tl.cosmetic.'
    const pack = cosmeticPacks.find((p) => p.productId === productId);
    if (pack) {
      await updateDoc(entitlementsDoc(userId), {
        ownedCosmeticPacks: arrayUnion(pack.id),
        updatedAt: serverTimestamp(),
      });
      return;
    }

    throw new Error(`Unknown productId: ${productId}`);
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
    const ownsItem = cosmeticPacks
      .filter((p) => ent.ownedCosmeticPacks.includes(p.id))
      .flatMap((p) => p.items)
      .some((i) => i.id === args.cosmeticItemId && i.surface === args.surface);
    if (!ownsItem) {
      throw new Error('You do not own a pack containing that cosmetic');
    }
    await updateDoc(entitlementsDoc(args.userId), {
      [`activeCosmetics.${args.surface}`]: args.cosmeticItemId,
      updatedAt: serverTimestamp(),
    });
    if (args.surface === 'helmet_livery') {
      const url = getHelmetUrl(args.cosmeticItemId);
      if (url) {
        try {
          await updateDoc(userDoc(args.userId), { activeHelmetUrl: url });
        } catch {
          // ignore — user doc may not exist briefly during first launch
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
