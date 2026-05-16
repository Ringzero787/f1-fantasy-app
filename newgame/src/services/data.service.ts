import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
  limit,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Driver, Constructor, Race } from '../types';

// Synthesized race used when prod data is missing — lets the lineup UI render
// end-to-end without depending on Undercut's schedule ingestion being current.
function getMockUpcomingRace(): Race {
  const now = new Date();
  const quali = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const race = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  return {
    id: 'tl_test_race',
    seasonId: '2026',
    round: 0,
    name: 'Test Track Grand Prix',
    officialName: 'Track Limits Demo Round',
    circuitName: 'Demo Circuit',
    country: 'Demo',
    city: '—',
    schedule: {
      fp1: now,
      qualifying: quali,
      race,
    },
    hasSprint: false,
    status: 'upcoming',
  };
}

// Reads the shared drivers/constructors/races collections that Undercut populates.
// Track Limits never writes to these — only reads.

export const dataService = {
  async getActiveDrivers(): Promise<Driver[]> {
    const q = query(
      collection(db, 'drivers'),
      where('isActive', '==', true),
      orderBy('price', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Driver[];
  },

  async getActiveConstructors(): Promise<Constructor[]> {
    const q = query(
      collection(db, 'constructors'),
      where('isActive', '==', true),
      orderBy('price', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Constructor[];
  },

  async getDriversByIds(ids: string[]): Promise<Driver[]> {
    if (ids.length === 0) return [];
    // Firestore "in" allows up to 30 ids; for now we expect <= 6.
    const q = query(collection(db, 'drivers'), where('__name__', 'in', ids));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Driver[];
  },

  async getConstructorsByIds(ids: string[]): Promise<Constructor[]> {
    if (ids.length === 0) return [];
    const q = query(collection(db, 'constructors'), where('__name__', 'in', ids));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Constructor[];
  },

  async getDriver(id: string): Promise<Driver | null> {
    const d = await getDoc(doc(db, 'drivers', id));
    return d.exists() ? ({ id: d.id, ...d.data() } as Driver) : null;
  },

  async getUpcomingRace(): Promise<Race | null> {
    try {
      const q = query(
        collection(db, 'races'),
        where('status', '==', 'upcoming'),
        orderBy('schedule.race', 'asc'),
        limit(1)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const d = snap.docs[0];
        return { id: d.id, ...d.data() } as Race;
      }
    } catch (err) {
      console.warn('[tl] getUpcomingRace prod query failed, falling back to mock:', err);
    }
    // Layout fallback so the lineup screen renders even when prod data is missing
    // or unreachable. Quali starts in 24h, race in 48h — both unlocked.
    return getMockUpcomingRace();
  },

  async getCompletedRaces(seasonId: string): Promise<Race[]> {
    const q = query(
      collection(db, 'races'),
      where('seasonId', '==', seasonId),
      where('status', '==', 'completed'),
      orderBy('round', 'asc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Race[];
  },
};
