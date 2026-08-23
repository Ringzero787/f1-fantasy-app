// Mock-purchase + cosmetic-select callables.
//
// The economy lockdown set tl_entitlements to `allow write: if false`, which
// silently broke the client-side mock purchase flow (USE_REAL_IAP=false) AND
// equipping cosmetics — both wrote entitlements directly. These callables move
// those writes server-side, matching the rest of the economy.
//
// tlMockPurchase grants goods WITHOUT billing. That is intentional while real
// IAP SKUs aren't registered — the store is effectively free until then. Flip
// MOCK_PURCHASES_ENABLED to false the moment real IAP goes live so this can't
// be used to bypass billing.

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { applyEntitlement } from './applyEntitlement';

const db = admin.firestore();

const MOCK_PURCHASES_ENABLED = true;

export const tlMockPurchase = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Sign in first');
    if (!MOCK_PURCHASES_ENABLED) {
      throw new functions.https.HttpsError('failed-precondition', 'Mock purchases are disabled — use the store billing flow');
    }
    const productId = String(data?.productId ?? '');
    // Mock purchases are limited to hard-capped product classes. Cash bundles
    // and subscriptions are excluded (no weekly-cap check server-side — a free
    // mock cash bundle would be an unlimited money printer), and cosmetic
    // packs are excluded since 0.1.41: they are bought with garage cash via
    // tlBuyCosmeticPack, never granted free.
    const MOCKABLE = /^tl\.garage\./;
    if (!MOCKABLE.test(productId)) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        /^tl\.cosmetic\./.test(productId)
          ? 'Cosmetic packs are bought with garage cash — update the app to the latest version'
          : 'This product is not available until real purchases go live'
      );
    }

    const result = await applyEntitlement(uid, productId);
    if (!result.applied) {
      throw new functions.https.HttpsError('failed-precondition', result.reason ?? 'Could not apply purchase');
    }

    await db.collection('tl_purchases').add({
      userId: uid,
      productId,
      source: 'mock',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { ok: true, productId };
  });

// Equip an owned cosmetic. Ownership check: the pack the client says the item
// belongs to must be in ownedCosmeticPacks. (Item→pack integrity is enforced
// by the client catalog; equipping a mismatched id just renders the default.)
export const tlSelectCosmetic = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Sign in first');
    const surface = String(data?.surface ?? '');
    const cosmeticItemId = String(data?.cosmeticItemId ?? '');
    const packId = String(data?.packId ?? '');
    if (!surface || !cosmeticItemId || !packId) {
      throw new functions.https.HttpsError('invalid-argument', 'surface, cosmeticItemId, packId required');
    }

    const entRef = db.doc(`tl_entitlements/${uid}`);
    const ent = await entRef.get();
    const owned: string[] = ent.get('ownedCosmeticPacks') ?? ['foundation'];
    if (!owned.includes(packId)) {
      throw new functions.https.HttpsError('permission-denied', 'You do not own that pack');
    }

    if (!ent.exists) {
      await entRef.set({
        userId: uid,
        extraDriverSlots: 0,
        extraConstructorSlots: 0,
        ownedCosmeticPacks: ['foundation'],
        activeCosmetics: { [surface]: cosmeticItemId },
        commissionerProActive: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      await entRef.update({
        [`activeCosmetics.${surface}`]: cosmeticItemId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    return { ok: true };
  });
