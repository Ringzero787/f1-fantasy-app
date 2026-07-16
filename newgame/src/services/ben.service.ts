// Ben service — reads Ben's posted lines for each (race, session).
// Lines themselves are written by Ben's backend / admin tool (or eventually
// a Cloud Function fed by the model); the client only consumes them.

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { withOfflineFallback } from '../utils/offlineCache';
import type { BenSessionDoc, SessionKey, BenLine } from '../types';

const lineDocId = (raceId: string, session: SessionKey) => `${raceId}_${session}`;
const lineDoc = (raceId: string, session: SessionKey) => doc(db, 'ben_lines', lineDocId(raceId, session));

export const benService = {
  async getLinesForSession(raceId: string, session: SessionKey): Promise<BenSessionDoc | null> {
    return withOfflineFallback(`benLines:${lineDocId(raceId, session)}`, async () => {
      const snap = await getDoc(lineDoc(raceId, session));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as BenSessionDoc;
    });
  },

  // Convenience: pull all three sessions in parallel. Sprint may be absent on
  // non-sprint weekends — null is fine for the caller.
  async getAllForRace(raceId: string): Promise<{
    qualifying: BenSessionDoc | null;
    race: BenSessionDoc | null;
    sprint: BenSessionDoc | null;
  }> {
    const [qualifying, race, sprint] = await Promise.all([
      this.getLinesForSession(raceId, 'qualifying'),
      this.getLinesForSession(raceId, 'race'),
      this.getLinesForSession(raceId, 'sprint'),
    ]);
    return { qualifying, race, sprint };
  },

  // Helper for the UI: pull the line for a single entity out of a session doc.
  lineFor(sessionDoc: BenSessionDoc | null, entityId: string): BenLine | null {
    if (!sessionDoc) return null;
    return sessionDoc.entities?.[entityId] ?? null;
  },
};
