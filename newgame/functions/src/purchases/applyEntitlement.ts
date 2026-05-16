// Server-side entitlement application — mirrors client-side
// purchases.service.ts:applyEntitlement so the server can grant goods after
// a verified IAP purchase. Single source of truth for what each productId does.

import * as admin from 'firebase-admin';

const db = admin.firestore();

// ---- Catalog (kept in sync with src/data/cosmeticsCatalog.ts) ----

const COSMETIC_PACK_BY_PRODUCT: Record<string, string> = {
  'tl.cosmetic.foundation': 'foundation',
  'tl.cosmetic.monaco_gold': 'monaco_gold',
  'tl.cosmetic.vegas_neon': 'vegas_neon',
  'tl.cosmetic.suzuka_blossom': 'suzuka_blossom',
  'tl.cosmetic.imola_crimson': 'imola_crimson',
  'tl.cosmetic.spa_forest': 'spa_forest',
  'tl.cosmetic.brazil_tribute': 'brazil_tribute',
  'tl.cosmetic.midnight_strip': 'midnight_strip',
  'tl.cosmetic.senna_era': 'senna_era',
  'tl.cosmetic.hybrid_era': 'hybrid_era',
  'tl.cosmetic.strategist_premium': 'strategist_premium',
};

const CASH_BUNDLE_AMOUNTS: Record<string, number> = {
  'tl.cash.bundle_small': 50,
  'tl.cash.bundle_medium': 150,
  'tl.cash.bundle_large': 350,
};

const GARAGE_DRIVER_SLOT_CAP = 1;
const GARAGE_CONSTRUCTOR_SLOT_CAP = 1;

export interface ApplyEntitlementResult {
  productId: string;
  applied: boolean;
  reason?: string;
}

export async function applyEntitlement(
  userId: string,
  productId: string,
  expirationDate?: Date
): Promise<ApplyEntitlementResult> {
  const entRef = db.doc(`tl_entitlements/${userId}`);
  const entSnap = await entRef.get();
  if (!entSnap.exists) {
    // Create base entitlements doc — purchase forces an account record
    await entRef.set({
      userId,
      extraDriverSlots: 0,
      extraConstructorSlots: 0,
      ownedCosmeticPacks: ['foundation'],
      activeCosmetics: { helmet_livery: 'track_limits_classic' },
      commissionerProActive: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // ---- Garage expansion ----
  if (productId === 'tl.garage.driver_slot') {
    const current = (entSnap.data()?.extraDriverSlots as number | undefined) ?? 0;
    if (current >= GARAGE_DRIVER_SLOT_CAP) {
      return { productId, applied: false, reason: 'cap_reached' };
    }
    await entRef.update({
      extraDriverSlots: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db.doc(`tl_garages/${userId}`).update({
      rosterDriverSlots: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => undefined); // garage may not exist yet for newer users
    return { productId, applied: true };
  }

  if (productId === 'tl.garage.constructor_slot') {
    const current = (entSnap.data()?.extraConstructorSlots as number | undefined) ?? 0;
    if (current >= GARAGE_CONSTRUCTOR_SLOT_CAP) {
      return { productId, applied: false, reason: 'cap_reached' };
    }
    await entRef.update({
      extraConstructorSlots: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db.doc(`tl_garages/${userId}`).update({
      rosterConstructorSlots: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => undefined);
    return { productId, applied: true };
  }

  // ---- Cash bundle (consumable) ----
  if (CASH_BUNDLE_AMOUNTS[productId] !== undefined) {
    const amount = CASH_BUNDLE_AMOUNTS[productId];
    await db.doc(`tl_garages/${userId}`).update({
      cash: admin.firestore.FieldValue.increment(amount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => undefined);
    // Log as an in-game transaction so the cash leaderboard distinguishes IAP cash later
    await db.collection(`tl_garages/${userId}/transactions`).add({
      userId,
      type: 'reroll',
      delta: amount,
      cashAfter: 0, // server-side increment; client reads recompute from garage
      description: `IAP: bought ${amount} cash bundle`,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { productId, applied: true };
  }

  // ---- Commissioner Pro (subscription) ----
  if (productId === 'tl.commissioner_pro.monthly' || productId === 'tl.commissioner_pro.yearly') {
    // expirationDate comes from the receipt; fallback to a default if missing.
    const tier = productId === 'tl.commissioner_pro.monthly' ? 'monthly' : 'yearly';
    const fallbackExpiry = new Date(
      Date.now() + (tier === 'monthly' ? 31 : 366) * 24 * 60 * 60 * 1000
    );
    await entRef.update({
      commissionerProActive: true,
      commissionerProTier: tier,
      commissionerProExpiresAt: expirationDate ?? fallbackExpiry,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { productId, applied: true };
  }

  // ---- Cosmetic pack ----
  const packId = COSMETIC_PACK_BY_PRODUCT[productId];
  if (packId) {
    await entRef.update({
      ownedCosmeticPacks: admin.firestore.FieldValue.arrayUnion(packId),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { productId, applied: true };
  }

  return { productId, applied: false, reason: 'unknown_product' };
}

// Used by webhook to deactivate a subscription that has expired or been refunded.
export async function deactivateCommissionerPro(userId: string): Promise<void> {
  await db.doc(`tl_entitlements/${userId}`).update({
    commissionerProActive: false,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}
