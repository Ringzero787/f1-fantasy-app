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
const DRIVER_PLACEHOLDER_LINE = 10.5;
const CONSTRUCTOR_PLACEHOLDER_LINE = 21.5;

interface ResultRow {
  position: number;
  driverId?: string;
  constructorId?: string;
}

function decideOutcome(line: number, result: number): 'with' | 'against' | 'push' {
  const isInteger = line % 1 === 0;
  if (isInteger && result === line) return 'push';
  return result <= line ? 'with' : 'against';
}

export const tlBackfillBenLines = functions.https.onRequest(async (req, res) => {
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
      // Drivers
      for (const [id, pos] of Object.entries(driverPos)) {
        const existing = existingEntities[id];
        const line = typeof existing?.line === 'number' ? (existing.line as number) : DRIVER_PLACEHOLDER_LINE;
        existingEntities[id] = {
          ...(existing || {}),
          entityId: id,
          entityKind: 'driver',
          line,
          withOdds: typeof existing?.withOdds === 'number' ? existing.withOdds : DEFAULT_WITH_ODDS,
          againstOdds: typeof existing?.againstOdds === 'number' ? existing.againstOdds : DEFAULT_AGAINST_ODDS,
          result: pos,
          outcome: decideOutcome(line, pos),
        };
        added++;
      }
      // Constructors
      for (const [id, positions] of Object.entries(teamPositions)) {
        const sum = positions.reduce((s, p) => s + p, 0);
        const existing = existingEntities[id];
        const line = typeof existing?.line === 'number' ? (existing.line as number) : CONSTRUCTOR_PLACEHOLDER_LINE;
        existingEntities[id] = {
          ...(existing || {}),
          entityId: id,
          entityKind: 'constructor',
          line,
          withOdds: typeof existing?.withOdds === 'number' ? existing.withOdds : DEFAULT_WITH_ODDS,
          againstOdds: typeof existing?.againstOdds === 'number' ? existing.againstOdds : DEFAULT_AGAINST_ODDS,
          result: sum,
          outcome: decideOutcome(line, sum),
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
