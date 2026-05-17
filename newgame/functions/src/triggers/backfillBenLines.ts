// tlBackfillBenLines — one-shot HTTPS endpoint that builds ben_lines docs
// for every completed race. For each session in {qualifying, race, sprint}
// that has results, creates an entity entry per driver + per constructor
// with a placeholder line (10.5 drivers / 21.5 constructors) at default
// 1.91/1.91 odds, and sets `result` + `outcome` from the actuals already on
// the race doc.
//
// Idempotent (merge). Skips sessions where no results exist. Skips entities
// that already have a line in the doc (preserves Ben's own posted lines).
//
// Gated by the same SEED_SECRET as tlSeedRaces. Usage:
//   curl -X POST 'https://us-central1-f1-app-18077.cloudfunctions.net/tlBackfillBenLines?key=YOUR_SECRET'
// (Or the Cloud Run URL for gen-2 functions — firebase deploy prints it.)

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { applyCors } from './_cors';

const db = admin.firestore();
const SEED_SECRET = 'tl-seed-races-2026-shared-secret';

type SessionKey = 'qualifying' | 'race' | 'sprint';
const SESSIONS: SessionKey[] = ['qualifying', 'race', 'sprint'];
const SESSION_RESULTS_KEY: Record<SessionKey, string> = {
  qualifying: 'qualifyingResults',
  race: 'raceResults',
  sprint: 'sprintResults',
};

const DEFAULT_WITH_ODDS = 1.91;
const DEFAULT_AGAINST_ODDS = 1.91;
// Placeholder ranges used only when seeding from actuals for completed races
// where Ben hadn't posted a real range. ±1 around the actual + center.
const DRIVER_PLACEHOLDER_HALF = 1;
const CONSTRUCTOR_PLACEHOLDER_HALF = 3;

interface ResultRow {
  position: number;
  driverId?: string;
  constructorId?: string;
}

function decideOutcomeFromRange(lo: number, hi: number, result: number): 'with' | 'against' {
  return result >= lo && result <= hi ? 'with' : 'against';
}

export const tlBackfillBenLines = functions.https.onRequest(async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.query.key !== SEED_SECRET) {
    res.status(401).send('Unauthorized');
    return;
  }

  const racesSnap = await db.collection('races')
    .where('status', '==', 'completed')
    .get();

  let raceCount = 0;
  let docsWritten = 0;
  let entityWrites = 0;
  const summary: Array<{ raceId: string; sessions: Record<string, number> }> = [];

  for (const raceDoc of racesSnap.docs) {
    const raceId = raceDoc.id;
    const race = raceDoc.data();
    if (!race?.results) continue;
    const raceSummary: Record<string, number> = {};

    for (const session of SESSIONS) {
      const arr: ResultRow[] = race.results[SESSION_RESULTS_KEY[session]] || [];
      if (!arr || arr.length === 0) continue;

      // Build lookups.
      const driverPos: Record<string, number> = {};
      const teamPositions: Record<string, number[]> = {};
      for (const r of arr) {
        if (r.driverId && typeof r.position === 'number') driverPos[r.driverId] = r.position;
        if (r.constructorId && typeof r.position === 'number') {
          if (!teamPositions[r.constructorId]) teamPositions[r.constructorId] = [];
          teamPositions[r.constructorId].push(r.position);
        }
      }

      // Read existing line doc so we don't clobber any of Ben's posted lines.
      const lineRef = db.doc(`ben_lines/${raceId}_${session}`);
      const lineSnap = await lineRef.get();
      const existingEntities: Record<string, Record<string, unknown>> = lineSnap.exists
        ? { ...(lineSnap.data()?.entities || {}) }
        : {};

      let added = 0;
      // Drivers — preserve any existing range, otherwise seed a placeholder
      // centered on the actual finish (±1 position).
      for (const [id, pos] of Object.entries(driverPos)) {
        const existing = existingEntities[id] as Record<string, unknown> | undefined;
        const lo =
          typeof existing?.predictedLo === 'number'
            ? (existing.predictedLo as number)
            : Math.max(1, pos - DRIVER_PLACEHOLDER_HALF);
        const hi =
          typeof existing?.predictedHi === 'number'
            ? (existing.predictedHi as number)
            : pos + DRIVER_PLACEHOLDER_HALF;
        existingEntities[id] = {
          ...(existing || {}),
          entityId: id,
          entityKind: 'driver',
          predictedLo: lo,
          predictedHi: hi,
          line: Math.round((lo + hi) / 2),
          withOdds: typeof existing?.withOdds === 'number' ? existing.withOdds : DEFAULT_WITH_ODDS,
          againstOdds: typeof existing?.againstOdds === 'number' ? existing.againstOdds : DEFAULT_AGAINST_ODDS,
          result: pos,
          outcome: decideOutcomeFromRange(lo, hi, pos),
        };
        added++;
      }
      // Constructors
      for (const [id, positions] of Object.entries(teamPositions)) {
        const sum = positions.reduce((s, p) => s + p, 0);
        const existing = existingEntities[id] as Record<string, unknown> | undefined;
        const lo =
          typeof existing?.predictedLo === 'number'
            ? (existing.predictedLo as number)
            : Math.max(2, sum - CONSTRUCTOR_PLACEHOLDER_HALF);
        const hi =
          typeof existing?.predictedHi === 'number'
            ? (existing.predictedHi as number)
            : sum + CONSTRUCTOR_PLACEHOLDER_HALF;
        existingEntities[id] = {
          ...(existing || {}),
          entityId: id,
          entityKind: 'constructor',
          predictedLo: lo,
          predictedHi: hi,
          line: Math.round((lo + hi) / 2),
          withOdds: typeof existing?.withOdds === 'number' ? existing.withOdds : DEFAULT_WITH_ODDS,
          againstOdds: typeof existing?.againstOdds === 'number' ? existing.againstOdds : DEFAULT_AGAINST_ODDS,
          result: sum,
          outcome: decideOutcomeFromRange(lo, hi, sum),
        };
        added++;
      }

      await lineRef.set({
        raceId,
        session,
        entities: existingEntities,
        posted: true,
        sourceFile: 'backfill_actuals',
        postedAt: admin.firestore.FieldValue.serverTimestamp(),
        settledAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      docsWritten++;
      entityWrites += added;
      raceSummary[session] = added;
    }
    if (Object.keys(raceSummary).length > 0) {
      raceCount++;
      summary.push({ raceId, sessions: raceSummary });
    }
  }

  res.status(200).json({
    races: raceCount,
    docsWritten,
    entityWrites,
    summary,
  });
});
