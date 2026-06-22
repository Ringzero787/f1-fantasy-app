// Picks service — one Firestore doc per (user, race) holds picks across all
// sessions. Picks default to side='with', stake=0.
//
// Architecture: Firestore is the source of truth for READS (onSnapshot via
// subscribe()). WRITES go through the server-authoritative `tlSetPick` callable
// because a stake escrows real cash from the garage — tl_picks is read-only to
// clients (firestore.rules). The picks store layers a small optimistic update
// on top so side toggles still feel instant; the snapshot listener reconciles.

import { doc, getDoc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db, functions, httpsCallable } from '../config/firebase';
import type { PicksDoc, Pick, BenSide, SessionKey } from '../types';

const pickDocId = (userId: string, raceId: string) => `${userId}_${raceId}`;
const pickDoc = (userId: string, raceId: string) =>
  doc(db, 'tl_picks', pickDocId(userId, raceId));

const callSetPick = httpsCallable(functions, 'tlSetPick');

export const picksService = {
  // One-shot read. Live UI should use subscribe() instead so it stays in sync.
  async get(userId: string, raceId: string): Promise<PicksDoc | null> {
    const snap = await getDoc(pickDoc(userId, raceId));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as PicksDoc) : null;
  },

  // Subscribe to a user's picks doc for a race. Fires once immediately with the
  // current state, then on every change.
  subscribe(
    userId: string,
    raceId: string,
    cb: (doc: PicksDoc | null) => void,
  ): Unsubscribe {
    return onSnapshot(pickDoc(userId, raceId), (snap) => {
      if (snap.exists()) {
        cb({ id: snap.id, ...snap.data() } as PicksDoc);
      } else {
        cb(null);
      }
    });
  },

  // Set the side for one entity in one session (cash-free). Server-authoritative.
  async setSide(args: {
    userId: string;
    raceId: string;
    session: SessionKey;
    entityId: string;
    side: BenSide;
  }): Promise<void> {
    await callSetPick({
      raceId: args.raceId,
      session: args.session,
      entityId: args.entityId,
      side: args.side,
    });
  },

  // Set the stake for one entity in one session. The server escrows the stake
  // delta from the garage (and rejects if the bankroll can't cover it).
  async setStake(args: {
    userId: string;
    raceId: string;
    session: SessionKey;
    entityId: string;
    stake: number;
  }): Promise<void> {
    await callSetPick({
      raceId: args.raceId,
      session: args.session,
      entityId: args.entityId,
      stake: Math.max(0, Math.round(args.stake)),
    });
  },

  // Clear a pick entirely — returns the entity to "no selection" (the default).
  // The server removes it from the picks doc and refunds any escrowed stake.
  async clearPick(args: {
    userId: string;
    raceId: string;
    session: SessionKey;
    entityId: string;
  }): Promise<void> {
    await callSetPick({
      raceId: args.raceId,
      session: args.session,
      entityId: args.entityId,
      clear: true,
    });
  },

  // Read a single pick out of a PicksDoc, or null if the player hasn't picked
  // this entity (the default "no selection" state — scores nothing).
  pickFor(picksDoc: PicksDoc | null, session: SessionKey, entityId: string): Pick | null {
    return picksDoc?.picks?.[session]?.[entityId] ?? null;
  },
};
