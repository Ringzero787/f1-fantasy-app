// Picks service — one Firestore doc per (user, race) holds picks across all
// sessions. Picks default to side='with', stake=0.
//
// Architecture: Firestore IS the source of truth for picks. Reads go through
// `subscribe()` (onSnapshot — Firestore's built-in latency compensation makes
// local writes appear instantly in the snapshot listener with
// metadata.hasPendingWrites=true). Writes go through `setSide` / `setStake`
// using setDoc(..., {merge:true}) — creates the doc if missing, deep-merges
// the new pick if it exists. No transactions, no manual optimistic state,
// no race between optimistic + network response.

import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { PicksDoc, Pick, BenSide, SessionKey } from '../types';

const pickDocId = (userId: string, raceId: string) => `${userId}_${raceId}`;
const pickDoc = (userId: string, raceId: string) =>
  doc(db, 'tl_picks', pickDocId(userId, raceId));

export const picksService = {
  // One-shot read. Mostly used by the demo / settle scripts. Live UI should
  // use subscribe() instead so it stays in sync.
  async get(userId: string, raceId: string): Promise<PicksDoc | null> {
    const snap = await getDoc(pickDoc(userId, raceId));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as PicksDoc) : null;
  },

  // Subscribe to a user's picks doc for a race. The callback fires once
  // immediately with current state, then on every change (including the
  // user's own writes — Firestore SDK emits the pending state instantly
  // before the server confirms).
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

  // Set the side for one entity in one session. Creates the doc if missing,
  // deep-merges otherwise so other picks + the stake are preserved.
  async setSide(args: {
    userId: string;
    raceId: string;
    session: SessionKey;
    entityId: string;
    side: BenSide;
  }): Promise<void> {
    await setDoc(
      pickDoc(args.userId, args.raceId),
      {
        userId: args.userId,
        raceId: args.raceId,
        picks: { [args.session]: { [args.entityId]: { side: args.side } } },
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  },

  // Set the stake for one entity in one session. Same merge semantics.
  async setStake(args: {
    userId: string;
    raceId: string;
    session: SessionKey;
    entityId: string;
    stake: number;
  }): Promise<void> {
    await setDoc(
      pickDoc(args.userId, args.raceId),
      {
        userId: args.userId,
        raceId: args.raceId,
        picks: {
          [args.session]: {
            [args.entityId]: { stake: Math.max(0, Math.round(args.stake)) },
          },
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  },

  // Helper: read a single pick out of a PicksDoc (returns the default
  // WITH/$0 if not yet stored).
  pickFor(picksDoc: PicksDoc | null, session: SessionKey, entityId: string): Pick {
    const stored = picksDoc?.picks?.[session]?.[entityId];
    return stored ?? { side: 'with', stake: 0 };
  },
};
