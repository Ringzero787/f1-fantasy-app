/**
 * The Moonshot callables (F-106): quote → confirm → cancel. The client chooses; the
 * server prices, checks and records. Nothing the client sends about probability,
 * multiplier or reward is read.
 *
 * - `moonshotQuote` prices a call from the current model and stores the quote with an
 *   expiry; the player confirms that quote by id.
 * - `moonshotConfirm` re-checks eligibility inside a transaction, spends a token by
 *   creating `moonshots/{id}` in CONFIRMED with the frozen terms, and marks the quote used.
 * - `moonshotCancel` deletes the call before lock (the token comes back); after lock it refuses.
 *
 * Lock: the call carries `lockAt`, the race's own lock time; F-107's settlement treats a
 * CONFIRMED call whose lockAt has passed as LOCKED.
 */
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { warnIfNoAppCheck } from '../utils/appCheck';
import { effectiveLockTime } from '../utils/lockTime';
import { loadMoonshotConfig, type PredictionType, type StakeCurrency } from './config';
import { predictionProbability, summarise } from './distribution';
import { eligibility, TOKEN_SPENDING_STATUSES } from './eligibility';
import { resolveModel } from './models';
import { potentialReward, price } from './pricing';

const db = admin.firestore();

const TYPES: PredictionType[] = ['WIN', 'PODIUM', 'TOP_5', 'EXACT_FINISH'];
const str = (v: unknown): string | null => (typeof v === 'string' && v && !v.includes('/') ? v : null);

async function ownTeam(teamId: string, uid: string) {
  const snap = await db.doc(`fantasyTeams/${teamId}`).get();
  if (!snap.exists || snap.data()?.userId !== uid) throw new functions.https.HttpsError('permission-denied', 'Not your team');
  return snap.data() as FirebaseFirestore.DocumentData;
}

async function tokensUsed(teamId: string, season: string): Promise<{ used: number; races: Set<string> }> {
  const snap = await db.collection('moonshots').where('teamId', '==', teamId).where('seasonId', '==', season).where('status', 'in', [...TOKEN_SPENDING_STATUSES]).get();
  return { used: snap.size, races: new Set(snap.docs.map((d) => d.data().raceId as string)) };
}

export const moonshotQuote = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  warnIfNoAppCheck(context, 'moonshotQuote');
  const uid = context.auth.uid;
  const teamId = str(data?.teamId), raceId = str(data?.raceId), driverId = str(data?.driverId);
  const type = TYPES.includes(data?.predictionType) ? (data.predictionType as PredictionType) : null;
  const currency: StakeCurrency | null = data?.stakeCurrency === 'POINTS' || data?.stakeCurrency === 'CASH' ? data.stakeCurrency : null;
  const stake = typeof data?.stakeAmount === 'number' ? data.stakeAmount : NaN;
  const target = typeof data?.predictionTarget === 'number' ? data.predictionTarget : undefined;
  if (!teamId || !raceId || !driverId || !type || !currency || !Number.isFinite(stake)) throw new functions.https.HttpsError('invalid-argument', 'teamId, raceId, driverId, predictionType, stakeCurrency and stakeAmount are required');

  const cfg = await loadMoonshotConfig(db);
  const [team, raceSnap] = await Promise.all([ownTeam(teamId, uid), db.doc(`races/${raceId}`).get()]);
  if (!raceSnap.exists) throw new functions.https.HttpsError('not-found', 'Race not found');
  const race = raceSnap.data()!;
  const season = String(race.seasonId ?? '2026');
  const lock = effectiveLockTime(race);
  const resolved = await resolveModel(db, season, raceId, race.round, cfg.carryForwardModel);
  const driver = resolved?.model.drivers[driverId];
  const tokens = await tokensUsed(teamId, season);
  const balance = currency === 'POINTS' ? (team.totalPoints ?? 0) + (team.lockedPoints ?? 0) : team.budget ?? 0;
  const p = driver ? predictionProbability(driver.positions, type, target) : null;
  const priced = p != null ? price(p, cfg.pricing) : undefined;
  const refusal = eligibility({ cfg, race: { round: race.round, lockAtMs: lock ? lock.toMillis() : null }, nowMs: Date.now(), tokensUsed: tokens.used, hasCallOnRace: tokens.races.has(raceId), type, target, currency, stake, balance, driverInModel: !!driver, probability: p, multiplier: priced?.multiplier });
  if (refusal) throw new functions.https.HttpsError(refusal.code, refusal.message);
  if (!resolved || !driver || p == null || !priced) throw new functions.https.HttpsError('failed-precondition', 'No model is available to price this race yet.');

  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + cfg.quoteTtlSeconds * 1000);
  const ownsDriver = Array.isArray(team.drivers) && team.drivers.some((d: { driverId?: string }) => d?.driverId === driverId);
  const quote = {
    uid, teamId, leagueId: team.leagueId ?? null, seasonId: season, raceId, roundNumber: race.round, driverId,
    predictionType: type, predictionTarget: type === 'EXACT_FINISH' ? target ?? null : null,
    stakeCurrency: currency, stakeAmount: stake,
    modelVersion: resolved.model.modelVersion, modelRaceId: resolved.model.raceId, carriedFrom: resolved.carriedFrom,
    probabilitySnapshotId: `${resolved.model.raceId}:${resolved.model.modelVersion}`,
    modelProbability: Math.round(p * 10000) / 10000, rewardBand: priced.band, multiplier: priced.multiplier,
    potentialReward: potentialReward(stake, priced.multiplier), ownsDriver,
    lockAt: lock, expiresAt, used: false, createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const ref = await db.collection('moonshotQuotes').add(quote);
  const detail = summarise(driver.positions);
  return {
    quoteId: ref.id, modelProbability: quote.modelProbability, rewardBand: quote.rewardBand, multiplier: quote.multiplier,
    stakeAmount: stake, potentialReward: quote.potentialReward, expiresAt: expiresAt.toMillis(), ownsDriver,
    carriedFrom: resolved.carriedFrom, tokensLeft: cfg.tokensPerTeam - tokens.used,
    model: { expectedFinish: detail.expected, likelyLo: detail.lo, likelyHi: detail.hi, predicted: driver.predicted },
  };
});

export const moonshotConfirm = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  warnIfNoAppCheck(context, 'moonshotConfirm');
  const uid = context.auth.uid;
  const quoteId = str(data?.quoteId);
  if (!quoteId) throw new functions.https.HttpsError('invalid-argument', 'quoteId is required');
  const cfg = await loadMoonshotConfig(db);
  if (!cfg.enabled) throw new functions.https.HttpsError('failed-precondition', 'Moonshots are not available.');

  const moonshotId = await db.runTransaction(async (tx) => {
    const qRef = db.doc(`moonshotQuotes/${quoteId}`);
    const q = await tx.get(qRef);
    if (!q.exists || q.data()?.uid !== uid) throw new functions.https.HttpsError('not-found', 'Quote not found');
    const quote = q.data()!;
    if (quote.used) throw new functions.https.HttpsError('failed-precondition', 'That quote was already confirmed');
    if (quote.expiresAt.toMillis() < Date.now()) throw new functions.https.HttpsError('failed-precondition', 'That quote has expired. Ask for a new one.');
    const lockAtMs: number | null = quote.lockAt ? quote.lockAt.toMillis() : null;
    // tokens and the one-per-race rule are re-checked inside the transaction so two confirms cannot both pass
    const spent = await tx.get(db.collection('moonshots').where('teamId', '==', quote.teamId).where('seasonId', '==', quote.seasonId).where('status', 'in', [...TOKEN_SPENDING_STATUSES]));
    const team = await tx.get(db.doc(`fantasyTeams/${quote.teamId}`));
    if (!team.exists || team.data()?.userId !== uid) throw new functions.https.HttpsError('permission-denied', 'Not your team');
    const t = team.data()!;
    const balance = quote.stakeCurrency === 'POINTS' ? (t.totalPoints ?? 0) + (t.lockedPoints ?? 0) : t.budget ?? 0;
    const refusal = eligibility({ cfg, race: { round: quote.roundNumber, lockAtMs }, nowMs: Date.now(), tokensUsed: spent.size, hasCallOnRace: spent.docs.some((d) => d.data().raceId === quote.raceId), type: quote.predictionType, target: quote.predictionTarget ?? undefined, currency: quote.stakeCurrency, stake: quote.stakeAmount, balance, driverInModel: true, probability: quote.modelProbability, multiplier: quote.multiplier });
    if (refusal) throw new functions.https.HttpsError(refusal.code, refusal.message);
    const ref = db.collection('moonshots').doc();
    const now = admin.firestore.FieldValue.serverTimestamp();
    tx.set(ref, {
      id: ref.id, seasonId: quote.seasonId, leagueId: quote.leagueId, teamId: quote.teamId, userId: uid,
      raceId: quote.raceId, roundNumber: quote.roundNumber, driverId: quote.driverId,
      predictionType: quote.predictionType, predictionTarget: quote.predictionTarget,
      stakeCurrency: quote.stakeCurrency, stakeAmount: quote.stakeAmount,
      modelVersion: quote.modelVersion, modelRaceId: quote.modelRaceId, carriedFrom: quote.carriedFrom,
      modelProbability: quote.modelProbability, probabilitySnapshotId: quote.probabilitySnapshotId,
      rewardBand: quote.rewardBand, multiplier: quote.multiplier, potentialReward: quote.potentialReward, ownsDriver: quote.ownsDriver ?? false,
      quoteId, status: 'CONFIRMED', lockAt: quote.lockAt, createdAt: now, updatedAt: now,
      lockedAt: null, settledAt: null, officialDriverFinish: null, result: null, adjustmentAmount: null, settlementVersion: null, settlementId: null,
    });
    tx.update(qRef, { used: true, moonshotId: ref.id });
    return ref.id;
  });
  return { moonshotId };
});

export const moonshotCancel = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  warnIfNoAppCheck(context, 'moonshotCancel');
  const uid = context.auth.uid;
  const moonshotId = str(data?.moonshotId);
  if (!moonshotId) throw new functions.https.HttpsError('invalid-argument', 'moonshotId is required');
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`moonshots/${moonshotId}`);
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.userId !== uid) throw new functions.https.HttpsError('not-found', 'Moonshot not found');
    const m = snap.data()!;
    if (m.status !== 'CONFIRMED') throw new functions.https.HttpsError('failed-precondition', 'This Moonshot can no longer be changed.');
    if (m.lockAt && m.lockAt.toMillis() <= Date.now()) throw new functions.https.HttpsError('failed-precondition', 'Selections are locked for this race.');
    // cancelled before lock: the token comes back, and the record stays for the audit trail
    tx.update(ref, { status: 'CANCELLED', updatedAt: admin.firestore.FieldValue.serverTimestamp(), cancelledAt: admin.firestore.FieldValue.serverTimestamp() });
  });
  return { cancelled: true };
});
