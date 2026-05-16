import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Lineup, LineupSlot, Race } from '../types';

const lineupId = (userId: string, raceId: string) => `${userId}_${raceId}`;
const lineupDoc = (userId: string, raceId: string) =>
  doc(db, 'tl_lineups', lineupId(userId, raceId));

export const STARTS_DRIVERS = 2;
export const STARTS_CONSTRUCTORS = 1;

// Convert a Firestore-stored timestamp / Date into a Date instance regardless of which form arrives.
const toDate = (v: unknown): Date | undefined => {
  if (!v) return undefined;
  if (v instanceof Date) return v;
  if (typeof v === 'object' && v && 'toDate' in v && typeof (v as { toDate: () => Date }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate();
  }
  if (typeof v === 'string' || typeof v === 'number') return new Date(v);
  return undefined;
};

export const lineupService = {
  async getLineup(userId: string, raceId: string): Promise<Lineup | null> {
    const snap = await getDoc(lineupDoc(userId, raceId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Lineup;
  },

  async upsertLineup(
    userId: string,
    raceId: string,
    scope: 'qualifying' | 'race',
    slot: { startedDriverIds: string[]; startedConstructorId: string | null }
  ): Promise<Lineup> {
    const id = lineupId(userId, raceId);
    const existing = await this.getLineup(userId, raceId);

    const empty: LineupSlot = { startedDriverIds: [], startedConstructorId: null };
    const next: Lineup = {
      id,
      userId,
      raceId,
      qualifying: existing?.qualifying ?? empty,
      race: existing?.race ?? empty,
      createdAt: existing?.createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    next[scope] = { ...next[scope], ...slot };

    await setDoc(
      lineupDoc(userId, raceId),
      {
        userId,
        raceId,
        qualifying: next.qualifying,
        race: next.race,
        createdAt: existing ? existing.createdAt : serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return next;
  },

  // Lineup is locked once the relevant session has started.
  isScopeLocked(race: Race, scope: 'qualifying' | 'race', now: Date = new Date()): boolean {
    const sessionStart = scope === 'qualifying' ? toDate(race.schedule.qualifying) : toDate(race.schedule.race);
    if (!sessionStart) return false;
    return now.getTime() >= sessionStart.getTime();
  },

  // Validates a slot for a given scope. Returns an error string if invalid, null otherwise.
  validateSlot(
    scope: 'qualifying' | 'race',
    slot: { startedDriverIds: string[]; startedConstructorId: string | null }
  ): string | null {
    if (slot.startedDriverIds.length !== STARTS_DRIVERS) {
      return `${scope === 'qualifying' ? 'Qualifying' : 'Race'} lineup needs ${STARTS_DRIVERS} drivers (have ${slot.startedDriverIds.length})`;
    }
    if (!slot.startedConstructorId) {
      return `${scope === 'qualifying' ? 'Qualifying' : 'Race'} lineup needs ${STARTS_CONSTRUCTORS} constructor`;
    }
    return null;
  },
};
