import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';

export interface CachedDriver {
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

export interface CachedConstructor {
  id: string;
  name: string;
  shortName: string;
  price: number;
  previousPrice: number;
  fantasyPoints: number;
  primaryColor: string;
  isActive: boolean;
}

export interface MarketSnapshot {
  drivers: CachedDriver[];
  constructors: CachedConstructor[];
  updatedAt: any;
  version: number;
}

/**
 * Fetch the cached market snapshot (single doc read instead of 20+ individual reads).
 * Falls back to null if cache doesn't exist yet.
 */
export async function getMarketSnapshot(): Promise<MarketSnapshot | null> {
  try {
    const snap = await getDoc(doc(db, 'cache', 'marketData'));
    if (!snap.exists()) return null;
    return snap.data() as MarketSnapshot;
  } catch (e) {
    console.warn('Failed to read market cache:', e);
    return null;
  }
}

/**
 * Subscribe to real-time market cache updates.
 * Returns unsubscribe function.
 */
export function subscribeToMarketCache(
  callback: (data: MarketSnapshot) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    doc(db, 'cache', 'marketData'),
    (snap) => {
      if (snap.exists()) {
        callback(snap.data() as MarketSnapshot);
      }
    },
    (error) => {
      console.warn('Market cache subscription error:', error);
      onError?.(error);
    },
  );
}
