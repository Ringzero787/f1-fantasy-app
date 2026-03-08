import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';

const db = admin.firestore();

interface CachedDriver {
  id: string;
  name: string;
  shortName: string;
  constructorId: string;
  constructorName: string;
  price: number;
  previousPrice: number;
  fantasyPoints: number;
  tier: string;
  isActive: boolean;
  driverNumber?: number;
}

interface CachedConstructor {
  id: string;
  name: string;
  shortName: string;
  price: number;
  previousPrice: number;
  fantasyPoints: number;
  primaryColor: string;
  isActive: boolean;
}

interface MarketSnapshot {
  drivers: CachedDriver[];
  constructors: CachedConstructor[];
  updatedAt: FirebaseFirestore.FieldValue;
  version: number;
}

/**
 * Rebuild the market cache document.
 * Called on schedule (every 30 min) and after race scoring.
 */
async function rebuildMarketCache(): Promise<void> {
  const [driversSnap, ctorsSnap] = await Promise.all([
    db.collection('drivers').where('isActive', '==', true).get(),
    db.collection('constructors').where('isActive', '==', true).get(),
  ]);

  const drivers: CachedDriver[] = driversSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: data.name || '',
      shortName: data.shortName || '',
      constructorId: data.constructorId || '',
      constructorName: data.constructorName || '',
      price: data.price || 0,
      previousPrice: data.previousPrice || data.price || 0,
      fantasyPoints: data.fantasyPoints || 0,
      tier: data.tier || 'C',
      isActive: true,
      driverNumber: data.driverNumber,
    };
  });

  const constructors: CachedConstructor[] = ctorsSnap.docs.map((c) => {
    const data = c.data();
    return {
      id: c.id,
      name: data.name || '',
      shortName: data.shortName || '',
      price: data.price || 0,
      previousPrice: data.previousPrice || data.price || 0,
      fantasyPoints: data.fantasyPoints || 0,
      primaryColor: data.primaryColor || '#4B5563',
      isActive: true,
    };
  });

  const snapshot: MarketSnapshot = {
    drivers,
    constructors,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    version: Date.now(),
  };

  await db.collection('cache').doc('marketData').set(snapshot);
  console.log(`Market cache rebuilt: ${drivers.length} drivers, ${constructors.length} constructors`);
}

/**
 * Scheduled: refresh market cache every 30 minutes.
 * Keeps data fresh even between races (admin price overrides, etc).
 */
export const refreshMarketCache = onSchedule(
  { schedule: 'every 30 minutes', timeoutSeconds: 60 },
  async () => {
    await rebuildMarketCache();
  }
);

/**
 * Callable: force refresh market cache (used after race scoring).
 */
export const forceRefreshMarketCache = functions.https.onCall(async (_data, context) => {
  if (!context.auth?.token.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }
  await rebuildMarketCache();
  return { success: true };
});

// Export for use by scoring pipeline
export { rebuildMarketCache };
