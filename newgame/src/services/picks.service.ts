// Picks service — read and write player picks for a race.
// One Firestore doc per (user, race) holds picks across all sessions.
// Picks default to side='with', stake=0. UI flips side and adjusts stake; the
// settlement Cloud Function reads this doc and grades it against ben_lines.

import { doc, getDoc, setDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { PicksDoc, Pick, BenSide, SessionKey } from '../types';

const pickDocId = (userId: string, raceId: string) => `${userId}_${raceId}`;
const pickDoc = (userId: string, raceId: string) => doc(db, 'tl_picks', pickDocId(userId, raceId));

function sumStakes(picks: PicksDoc['picks']): number {
  let total = 0;
  for (const session of Object.values(picks)) {
    if (!session) continue;
    for (const p of Object.values(session)) {
      total += p?.stake ?? 0;
    }
  }
  return Math.round(total * 100) / 100;
}

export const picksService = {
  async get(userId: string, raceId: string): Promise<PicksDoc | null> {
    const snap = await getDoc(pickDoc(userId, raceId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as PicksDoc;
  },

  // Idempotent: returns an existing doc or creates a fresh one with empty picks.
  async getOrCreate(userId: string, raceId: string): Promise<PicksDoc> {
    const existing = await this.get(userId, raceId);
    if (existing) return existing;
    const doc: Omit<PicksDoc, 'id'> = {
      userId,
      raceId,
      picks: {},
      totalStaked: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await setDoc(pickDoc(userId, raceId), {
      ...doc,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id: pickDocId(userId, raceId), ...doc };
  },

  // Set/replace one pick. The session and entityId form the address within the
  // picks map. Used by the toggle (side flip) and stake stepper.
  async setPick(args: {
    userId: string;
    raceId: string;
    session: SessionKey;
    entityId: string;
    pick: Pick;
  }): Promise<PicksDoc> {
    const { userId, raceId, session, entityId, pick } = args;
    return runTransaction(db, async (tx) => {
      const ref = pickDoc(userId, raceId);
      const snap = await tx.get(ref);
      const existing = snap.exists() ? (snap.data() as Omit<PicksDoc, 'id'>) : null;
      const picks: PicksDoc['picks'] = existing?.picks ?? {};
      const sessionMap = { ...(picks[session] ?? {}) };
      sessionMap[entityId] = pick;
      const nextPicks: PicksDoc['picks'] = { ...picks, [session]: sessionMap };
      const totalStaked = sumStakes(nextPicks);

      const next: Omit<PicksDoc, 'id'> = {
        userId,
        raceId,
        picks: nextPicks,
        totalStaked,
        createdAt: existing?.createdAt ?? new Date(),
        updatedAt: new Date(),
      };

      tx.set(
        ref,
        {
          ...next,
          createdAt: existing ? existing.createdAt : serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: false }
      );

      return { id: pickDocId(userId, raceId), ...next };
    });
  },

  async setSide(args: { userId: string; raceId: string; session: SessionKey; entityId: string; side: BenSide }) {
    const current = await this.get(args.userId, args.raceId);
    const existing = current?.picks?.[args.session]?.[args.entityId];
    return this.setPick({
      ...args,
      pick: { side: args.side, stake: existing?.stake ?? 0 },
    });
  },

  async setStake(args: { userId: string; raceId: string; session: SessionKey; entityId: string; stake: number }) {
    const current = await this.get(args.userId, args.raceId);
    const existing = current?.picks?.[args.session]?.[args.entityId];
    return this.setPick({
      ...args,
      pick: { side: existing?.side ?? 'with', stake: Math.max(0, Math.round(args.stake)) },
    });
  },

  // Helper: read a single pick (returns the default WITH/$0 if not yet stored).
  pickFor(picksDoc: PicksDoc | null, session: SessionKey, entityId: string): Pick {
    const stored = picksDoc?.picks?.[session]?.[entityId];
    return stored ?? { side: 'with', stake: 0 };
  },
};
