// tlBuyCosmeticPack — buy a cosmetic pack with GARAGE CASH (the in-game
// currency won at settlements and, once real IAP ships, topped up via cash
// bundles). This replaces the free mock grant for cosmetics: packs are a cash
// sink priced at parity with the future real-money path (a $2.99-tier pack
// costs what a ~$2.99 cash bundle buys).
//
// Atomic: debit + grant + ledger entry happen in one transaction, so a raced
// double-tap can't double-charge and a mid-flight failure can't charge without
// granting.

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Server-side price table — the client catalog mirrors these for display, but
// this is the authority. Keyed by pack id (not productId: game-cash purchases
// are not IAP SKUs).
export const PACK_PRICES_GAME_CASH: Record<string, { price: number; name: string }> = {
  monaco_gold: { price: 75, name: 'Monaco Gold' },
  vegas_neon: { price: 75, name: 'Vegas Neon' },
  suzuka_blossom: { price: 75, name: 'Suzuka Blossom' },
  imola_crimson: { price: 75, name: 'Imola Crimson' },
  spa_forest: { price: 75, name: 'Spa Forest' },
  brazil_tribute: { price: 75, name: 'Brazil Tribute' },
  midnight_strip: { price: 75, name: 'Midnight Strip' },
  senna_era: { price: 150, name: 'Senna Era' },
  hybrid_era: { price: 150, name: 'Hybrid Era' },
  strategist_premium: { price: 350, name: 'Strategist Premium' },
};

export const tlBuyCosmeticPack = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Sign in first');
    const packId = String(data?.packId ?? '');
    const entry = PACK_PRICES_GAME_CASH[packId];
    if (!entry) {
      throw new functions.https.HttpsError('invalid-argument', 'Unknown pack');
    }

    const garageRef = db.doc(`tl_garages/${uid}`);
    const entRef = db.doc(`tl_entitlements/${uid}`);
    const txLogRef = db.collection(`tl_garages/${uid}/transactions`).doc();
    const purchaseRef = db.collection('tl_purchases').doc();

    const cashAfter = await db.runTransaction(async (tx) => {
      const [garageSnap, entSnap] = await Promise.all([tx.get(garageRef), tx.get(entRef)]);
      if (!garageSnap.exists) {
        throw new functions.https.HttpsError('failed-precondition', 'No garage yet — finish onboarding first');
      }
      const owned: string[] = entSnap.get('ownedCosmeticPacks') ?? ['foundation'];
      if (owned.includes(packId)) {
        throw new functions.https.HttpsError('already-exists', 'You already own this pack');
      }
      const cash = (garageSnap.get('cash') as number | undefined) ?? 0;
      if (cash < entry.price) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          `Not enough cash. ${entry.name} costs $${entry.price}, you have $${cash}.`
        );
      }
      const newCash = Math.round((cash - entry.price) * 100) / 100;
      tx.update(garageRef, {
        cash: newCash,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      if (entSnap.exists) {
        tx.update(entRef, {
          ownedCosmeticPacks: admin.firestore.FieldValue.arrayUnion(packId),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        tx.set(entRef, {
          userId: uid,
          extraDriverSlots: 0,
          extraConstructorSlots: 0,
          ownedCosmeticPacks: ['foundation', packId],
          activeCosmetics: { helmet_livery: 'track_limits_classic' },
          commissionerProActive: false,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      tx.set(txLogRef, {
        userId: uid,
        type: 'purchase',
        delta: -entry.price,
        cashAfter: newCash,
        description: `Bought ${entry.name} pack`,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.set(purchaseRef, {
        userId: uid,
        packId,
        price: entry.price,
        source: 'game_cash',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return newCash;
    });

    return { ok: true, packId, cashAfter };
  });
