// tlSeedRaces — HTTPS endpoint that writes the 2026 race calendar into
// `races/{raceId}`. Idempotent (merges over existing). Gated by a shared
// secret in the query string so it can be invoked once with curl from the
// operator's machine without standing up a full auth flow.
//
// Source data: src/data/demoData.ts demoRaces — copied into
// triggers/_seedRacesData.json by the operator before deploy.
//
// Usage:
//   curl -X POST 'https://us-central1-f1-app-18077.cloudfunctions.net/tlSeedRaces?key=YOUR_SECRET'

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import racesData from './_seedRacesData.json';

const db = admin.firestore();

// Hardcoded one-shot secret. Rotate or delete the function after seeding.
const SEED_SECRET = 'tl-seed-races-2026-shared-secret';

interface SeedRace {
  id: string;
  seasonId: string;
  round: number;
  name: string;
  officialName: string;
  circuitId?: string;
  circuitName: string;
  country: string;
  city: string;
  timezone?: string;
  hasSprint: boolean;
  status: 'upcoming' | 'in_progress' | 'completed' | 'cancelled';
  schedule: Record<string, string>;
}

function toTimestamps(schedule: Record<string, string>): Record<string, admin.firestore.Timestamp> {
  const out: Record<string, admin.firestore.Timestamp> = {};
  for (const [k, v] of Object.entries(schedule)) {
    if (typeof v === 'string') out[k] = admin.firestore.Timestamp.fromDate(new Date(v));
  }
  return out;
}

export const tlSeedRaces = functions.https.onRequest(async (req, res) => {
  if (req.query.key !== SEED_SECRET) {
    res.status(401).send('Unauthorized');
    return;
  }
  const races = racesData as unknown as SeedRace[];
  const batch = db.batch();
  let count = 0;
  for (const r of races) {
    const { id, schedule, ...rest } = r;
    batch.set(
      db.collection('races').doc(id),
      {
        ...rest,
        schedule: toTimestamps(schedule),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    count++;
  }
  await batch.commit();
  res.status(200).json({ seeded: count });
});
