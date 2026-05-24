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

// Firestore Timestamp / Date / millis-number → millis. Race.schedule.race can
// arrive as any of these depending on whether the doc was just written client-
// side (Date) or read back (Timestamp).
function toMillis(v: unknown): number {
  if (!v) return Infinity;
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime();
  const maybeTs = v as { toMillis?: () => number; seconds?: number };
  if (typeof maybeTs.toMillis === 'function') return maybeTs.toMillis();
  if (typeof maybeTs.seconds === 'number') return maybeTs.seconds * 1000;
  return Infinity;
}

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
    // The "current" race is the earliest race that hasn't completed yet. This
    // INCLUDES 'in_progress' — once a race weekend starts, the shared lock cron
    // (Undercut) flips the race doc to 'in_progress', and the player is still
    // making picks for its remaining sessions until each one locks. Filtering on
    // 'upcoming' only would skip the live weekend and jump to the next race
    // (and so hide its Sprint scope entirely).
    const ACTIVE: Race['status'][] = ['upcoming', 'in_progress'];

    // Preferred path: status filter + orderBy schedule.race. Needs a composite
    // index (status, schedule.race) — without it Firestore throws
    // FAILED_PRECONDITION and we'd fall through to the no-orderBy path.
    try {
      const q = query(
        collection(db, 'races'),
        where('status', 'in', ACTIVE),
        orderBy('schedule.race', 'asc'),
        limit(1)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const d = snap.docs[0];
        return { id: d.id, ...d.data() } as Race;
      }
    } catch (err) {
      console.warn('[tl] getUpcomingRace indexed query failed, trying no-orderBy fallback:', err);
    }
    // Fallback A: status filter with no orderBy (no index required), sort
    // client-side. Works even while the composite index is still building.
    try {
      const q2 = query(collection(db, 'races'), where('status', 'in', ACTIVE));
      const snap2 = await getDocs(q2);
      if (!snap2.empty) {
        const races = snap2.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Race, 'id'>) }));
        races.sort((a, b) => {
          const ta = a.schedule?.race ? toMillis(a.schedule.race) : Infinity;
          const tb = b.schedule?.race ? toMillis(b.schedule.race) : Infinity;
          return ta - tb;
        });
        return races[0] as Race;
      }
    } catch (err) {
      console.warn('[tl] getUpcomingRace fallback A also failed, using mock:', err);
    }
    // Fallback B: synthesized mock so the lineup screen still renders rather
    // than crash. Caller can detect this by the synthetic id.
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
