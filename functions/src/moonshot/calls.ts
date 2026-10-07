/**
 * The Moonshot callables (F-106): quote → confirm → cancel. The client chooses; the
 * server prices, checks and records. Nothing the client sends about probability,
 * multiplier or reward is read.
 *
 * - `moonshotQuote` prices a call from the current model and stores the quote with an
 *   expiry; the player confirms that quote by id.
 * - `moonshotConfirm` re-checks eligibility inside a transaction against the race's live
 *   lock time, spends a token by creating `moonshots/{id}` in CONFIRMED with the frozen
 *   terms, bumps the team's token count and marks the quote used.
 * - `moonshotCancel` voids a CONFIRMED call before lock (the token comes back; the record
 *   stays CANCELLED for the audit trail); after lock it refuses.
 *
 * Lock: the call carries `lockAt`, the race's own lock time at confirmation; F-107's
 * settlement treats a CONFIRMED call whose lockAt has passed as LOCKED. Confirm and cancel
 * read the race again, so a schedule change that moves the lock earlier is honoured.
 *
 * Concurrency: two confirms for one team contend on `moonshotTokens/{teamId}_{season}`,
 * which both transactions write, so one of them retries and sees the other's call.
 */
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { warnIfNoAppCheck } from '../utils/appCheck';
import { effectiveLockTime } from '../utils/lockTime';
import { loadMoonshotConfig, type PredictionType, type StakeCurrency } from './config';
import { predictionProbability, summarise } from './distribution';
import { eligibility, quoteRefusal, OPEN_STATUSES, TOKEN_SPENDING_STATUSES } from './eligibility';
import { resolveModel } from './models';
import { potentialReward, price } from './pricing';

const db = admin.firestore();

const TYPES: PredictionType[] = ['WIN', 'PODIUM', 'TOP_5', 'EXACT_FINISH'];
const str = (v: unknown): string | null => (typeof v === 'string' && v && !v.includes('/') ? v : null);

/** What the team's existing calls this season already commit: tokens, calls on this race, stake still at risk. */
interface Committed { used: number; onRace: number; openStake: number }
function committed(docs: FirebaseFirestore.QueryDocumentSnapshot[], raceId: string, currency: StakeCurrency): Committed {
  let onRace = 0, openStake = 0;
  for (const d of docs) {
    const m = d.data();
    if (m.raceId === raceId) onRace++;
    if ((OPEN_STATUSES as readonly string[]).includes(m.status) && m.stakeCurrency === currency) openStake += m.stakeAmount ?? 0;
  }
  return { used: docs.length, onRace, openStake };
}
const spendingQuery = (teamId: string, season: string) =>
  db.collection('moonshots').where('teamId', '==', teamId).where('seasonId', '==', season).where('status', 'in', [...TOKEN_SPENDING_STATUSES]);

const teamBalance = (team: FirebaseFirestore.DocumentData, currency: StakeCurrency): number =>
  currency === 'POINTS' ? (team.totalPoints ?? 0) + (team.lockedPoints ?? 0) : team.budget ?? 0;
const seasonMismatch = (team: FirebaseFirestore.DocumentData, season: string): boolean =>
  team.seasonId != null && String(team.seasonId) !== season;

async function ownTeam(teamId: string, uid: string) {
  const snap = await db.doc(`fantasyTeams/${teamId}`).get();
  if (!snap.exists || snap.data()?.userId !== uid) throw new functions.https.HttpsError('permission-denied', 'Not your team');
  return snap.data() as FirebaseFirestore.DocumentData;
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
  const round: number | null = Number.isInteger(race.round) ? race.round : null;
  const lock = effectiveLockTime(race);
  const resolved = round === null ? null : await resolveModel(db, season, raceId, round, cfg.carryForwardModel);
  const driver = resolved?.model.drivers[driverId];
  const have = committed((await spendingQuery(teamId, season).get()).docs, raceId, currency);
  const p = driver ? predictionProbability(driver.positions, type, target) : null;
  const priced = p != null ? price(p, cfg.pricing) : undefined;
  const refusal = eligibility({
    cfg, race: { round, lockAtMs: lock ? lock.toMillis() : null }, nowMs: Date.now(), seasonMismatch: seasonMismatch(team, season),
    tokensUsed: have.used, callsOnRace: have.onRace, type, target, positionsCount: resolved?.model.positionsCount,
    currency, stake, balance: teamBalance(team, currency), openStake: have.openStake,
    modelAvailable: !!resolved, driverInModel: !!driver, probability: p, multiplier: priced?.multiplier,
  });
  if (refusal) throw new functions.https.HttpsError(refusal.code, refusal.message);
  if (!resolved || !driver || p == null || !priced) throw new functions.https.HttpsError('failed-precondition', 'No model is available to price this race yet.');

  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + cfg.quoteTtlSeconds * 1000);
  const ownsDriver = Array.isArray(team.drivers) && team.drivers.some((d: { driverId?: string }) => d?.driverId === driverId);
  const quote = {
    uid, teamId, leagueId: team.leagueId ?? null, seasonId: season, raceId, roundNumber: round, driverId,
    predictionType: type, predictionTarget: type === 'EXACT_FINISH' ? target ?? null : null,
    stakeCurrency: currency, stakeAmount: stake,
    modelVersion: resolved.model.modelVersion, modelRaceId: resolved.model.raceId, carriedFrom: resolved.carriedFrom,
    positionsCount: resolved.model.positionsCount,
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
    carriedFrom: resolved.carriedFrom, tokensLeft: cfg.tokensPerTeam - have.used,
    model: { expectedFinish: detail.expected, likelyLo: detail.lo, likelyHi: detail.hi, predicted: driver.predicted },
  };
});

/** The fields of a call the client reads (the shape of the app's MoonshotCall); server bookkeeping stays behind. */
function pickCall(id: string, m: FirebaseFirestore.DocumentData) {
  return {
    id, teamId: m.teamId, raceId: m.raceId, roundNumber: m.roundNumber ?? null, driverId: m.driverId,
    predictionType: m.predictionType, predictionTarget: m.predictionTarget ?? null, stakeCurrency: m.stakeCurrency, stakeAmount: m.stakeAmount,
    modelProbability: m.modelProbability, rewardBand: m.rewardBand, multiplier: m.multiplier, potentialReward: m.potentialReward, ownsDriver: m.ownsDriver === true,
    status: m.status, lockAtMs: m.lockAt && typeof m.lockAt.toMillis === 'function' ? m.lockAt.toMillis() : null,
    result: m.result ?? null, officialDriverFinish: m.officialDriverFinish ?? null, adjustmentAmount: m.adjustmentAmount ?? null,
  };
}

/**
 * Everything the Moonshot sheet needs to open on one driver in one round-trip (F-108): whether the
 * feature is open this round, tokens left, the call already made on this race (if any), every
 * enabled prediction priced for the driver, the stake levels and balances, and the model summary.
 * Nothing is stored; the quote that is confirmed comes from `moonshotQuote` at the stake step.
 */
export const moonshotMenu = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  warnIfNoAppCheck(context, 'moonshotMenu');
  const uid = context.auth.uid;
  const teamId = str(data?.teamId), raceId = str(data?.raceId), driverId = str(data?.driverId);
  if (!teamId || !raceId || !driverId) throw new functions.https.HttpsError('invalid-argument', 'teamId, raceId and driverId are required');
  const cfg = await loadMoonshotConfig(db);
  const [team, raceSnap] = await Promise.all([ownTeam(teamId, uid), db.doc(`races/${raceId}`).get()]);
  if (!raceSnap.exists) throw new functions.https.HttpsError('not-found', 'Race not found');
  const race = raceSnap.data()!;
  const season = String(race.seasonId ?? '2026');
  const round: number | null = Number.isInteger(race.round) ? race.round : null;
  const lock = effectiveLockTime(race);
  const availability = !cfg.enabled ? 'off' : round === null || round < cfg.unlockRound ? 'locked' : 'open';
  const spent = (await spendingQuery(teamId, season).get()).docs;
  const current = spent.find((d) => d.data().raceId === raceId);
  const resolved = availability === 'open' && round !== null ? await resolveModel(db, season, raceId, round, cfg.carryForwardModel) : null;
  const driver = resolved?.model.drivers[driverId];
  const predictions = driver
    ? cfg.predictionTypesEnabled.filter((t) => t !== 'EXACT_FINISH').map((type) => {
        const p = predictionProbability(driver.positions, type) ?? 0;
        const priced = price(p, cfg.pricing);
        return { type, probability: Math.round(p * 10000) / 10000, band: priced.band, multiplier: priced.multiplier };
      })
    : [];
  const detail = driver ? summarise(driver.positions) : null;
  return {
    availability, unlockRound: cfg.unlockRound, tokensPerTeam: cfg.tokensPerTeam, tokensLeft: Math.max(0, cfg.tokensPerTeam - spent.length),
    lockAtMs: lock ? lock.toMillis() : null, round,
    current: current ? pickCall(current.id, current.data()) : null,
    ownsDriver: Array.isArray(team.drivers) && team.drivers.some((d: { driverId?: string }) => d?.driverId === driverId),
    modelAvailable: !!resolved, driverInModel: !!driver, carriedFrom: resolved?.carriedFrom ?? null,
    predictions, exactFinishEnabled: cfg.predictionTypesEnabled.includes('EXACT_FINISH'), positionsCount: resolved?.model.positionsCount ?? null, maxMultiplier: cfg.pricing.maxMultiplier,
    stakes: { POINTS: cfg.pointsStakeLevels, CASH: cfg.cashStakeLevels },
    balances: { POINTS: teamBalance(team, 'POINTS'), CASH: teamBalance(team, 'CASH') },
    model: detail && driver ? { expectedFinish: detail.expected, likelyLo: detail.lo, likelyHi: detail.hi, predicted: driver.predicted } : null,
    copy: cfg.copy, tutorialEnabled: cfg.tutorialEnabled,
  };
});

/**
 * The league's Moonshots on a race (F-108, SPEC §16/§17): what members may see of each other —
 * locked calls (lockAt passed) and settled ones, never a cancelled one and never a call still open
 * to change. The same rule the Firestore rules apply, decided here on the server clock so a
 * client whose clock is ahead cannot peek, and so the client needs no list query on `moonshots`.
 */
export const moonshotLeagueBoard = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  warnIfNoAppCheck(context, 'moonshotLeagueBoard');
  const uid = context.auth.uid;
  const leagueId = str(data?.leagueId), raceId = str(data?.raceId);
  if (!leagueId || !raceId) throw new functions.https.HttpsError('invalid-argument', 'leagueId and raceId are required');
  const [me, members, raceSnap] = await Promise.all([db.doc(`leagues/${leagueId}/members/${uid}`).get(), db.collection(`leagues/${leagueId}/members`).get(), db.doc(`races/${raceId}`).get()]);
  if (!me.exists) throw new functions.https.HttpsError('permission-denied', 'Not a member of this league');
  const names = new Map(members.docs.map((d) => [d.id, { displayName: d.data().displayName ?? null, teamName: d.data().teamName ?? null }]));
  const snap = await db.collection('moonshots').where('leagueId', '==', leagueId).where('raceId', '==', raceId).get();
  const now = Date.now();
  // a call is public once BOTH its stamped lock and the race's live lock have passed: cancel honours the live
  // lock, so a declaration must not appear while its owner can still withdraw it (a lock moved later)
  const liveLock = raceSnap.exists ? effectiveLockTime(raceSnap.data()!) : null;
  const liveLockMs = liveLock ? liveLock.toMillis() : 0;
  const calls = snap.docs
    .map((d) => ({ id: d.id, m: d.data() }))
    .filter(({ m }) => m.status !== 'CANCELLED' && m.lockAt && typeof m.lockAt.toMillis === 'function' && Math.max(m.lockAt.toMillis(), liveLockMs) <= now)
    .map(({ id, m }) => ({ ...pickCall(id, m), userId: m.userId, ...(names.get(m.userId) ?? { displayName: null, teamName: null }) }))
    .sort((a, b) => (b.potentialReward ?? 0) - (a.potentialReward ?? 0));
  return { raceId, calls, lockedCount: calls.length };
});

export const moonshotConfirm = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  warnIfNoAppCheck(context, 'moonshotConfirm');
  const uid = context.auth.uid;
  const quoteId = str(data?.quoteId);
  if (!quoteId) throw new functions.https.HttpsError('invalid-argument', 'quoteId is required');
  const cfg = await loadMoonshotConfig(db);
  if (!cfg.enabled) throw new functions.https.HttpsError('failed-precondition', 'Moonshots are not available.');

  const result = await db.runTransaction(async (tx) => {
    const qRef = db.doc(`moonshotQuotes/${quoteId}`);
    const q = await tx.get(qRef);
    if (!q.exists || q.data()?.uid !== uid) throw new functions.https.HttpsError('not-found', 'Quote not found');
    const quote = q.data()!;
    const now = Date.now();
    const stale = quoteRefusal({ used: quote.used, expiresAtMs: quote.expiresAt.toMillis() }, now);
    if (stale) throw new functions.https.HttpsError(stale.code, stale.message);
    // the live race, not the quote's copy: a schedule change that moves the lock earlier is honoured
    const [raceSnap, team, spent] = await Promise.all([
      tx.get(db.doc(`races/${quote.raceId}`)),
      tx.get(db.doc(`fantasyTeams/${quote.teamId}`)),
      tx.get(spendingQuery(quote.teamId, quote.seasonId)),
    ]);
    if (!team.exists || team.data()?.userId !== uid) throw new functions.https.HttpsError('permission-denied', 'Not your team');
    if (!raceSnap.exists) throw new functions.https.HttpsError('not-found', 'Race not found');
    const race = raceSnap.data()!;
    const lock = effectiveLockTime(race);
    const t = team.data()!;
    const have = committed(spent.docs, quote.raceId, quote.stakeCurrency);
    const refusal = eligibility({
      cfg, race: { round: Number.isInteger(race.round) ? race.round : null, lockAtMs: lock ? lock.toMillis() : null }, nowMs: now,
      seasonMismatch: seasonMismatch(t, quote.seasonId), tokensUsed: have.used, callsOnRace: have.onRace,
      type: quote.predictionType, target: quote.predictionTarget ?? undefined, positionsCount: quote.positionsCount,
      currency: quote.stakeCurrency, stake: quote.stakeAmount, balance: teamBalance(t, quote.stakeCurrency), openStake: have.openStake,
      modelAvailable: true, driverInModel: true, probability: quote.modelProbability, multiplier: quote.multiplier,
    });
    if (refusal) throw new functions.https.HttpsError(refusal.code, refusal.message);
    const ref = db.collection('moonshots').doc();
    const stamp = admin.firestore.FieldValue.serverTimestamp();
    tx.set(ref, {
      id: ref.id, seasonId: quote.seasonId, leagueId: quote.leagueId, teamId: quote.teamId, userId: uid,
      raceId: quote.raceId, roundNumber: quote.roundNumber, driverId: quote.driverId,
      predictionType: quote.predictionType, predictionTarget: quote.predictionTarget,
      stakeCurrency: quote.stakeCurrency, stakeAmount: quote.stakeAmount,
      modelVersion: quote.modelVersion, modelRaceId: quote.modelRaceId, carriedFrom: quote.carriedFrom,
      modelProbability: quote.modelProbability, probabilitySnapshotId: quote.probabilitySnapshotId,
      rewardBand: quote.rewardBand, multiplier: quote.multiplier, potentialReward: quote.potentialReward, ownsDriver: quote.ownsDriver ?? false,
      quoteId, status: 'CONFIRMED', lockAt: lock, createdAt: stamp, updatedAt: stamp,
      lockedAt: null, settledAt: null, officialDriverFinish: null, result: null, adjustmentAmount: null, settlementVersion: null, settlementId: null,
    });
    // one document both racing confirms must write, so they cannot both pass
    tx.set(db.doc(`moonshotTokens/${quote.teamId}_${quote.seasonId}`), { teamId: quote.teamId, userId: uid, seasonId: quote.seasonId, used: have.used + 1, updatedAt: stamp });
    tx.update(qRef, { used: true, moonshotId: ref.id });
    return { moonshotId: ref.id, tokensLeft: cfg.tokensPerTeam - have.used - 1 };
  });
  console.log('moonshot_confirmed', JSON.stringify({ uid, quoteId, moonshotId: result.moonshotId }));
  return result;
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
    // the earlier of the call's lock and the race's live lock wins
    const raceSnap = await tx.get(db.doc(`races/${m.raceId}`));
    const live = raceSnap.exists ? effectiveLockTime(raceSnap.data()!) : null;
    const lockMs = Math.min(m.lockAt ? m.lockAt.toMillis() : Infinity, live ? live.toMillis() : Infinity);
    if (lockMs <= Date.now()) throw new functions.https.HttpsError('failed-precondition', 'Selections are locked for this race.');
    // cancelled before lock: the token comes back, and the record stays for the audit trail
    const stamp = admin.firestore.FieldValue.serverTimestamp();
    tx.update(ref, { status: 'CANCELLED', updatedAt: stamp, cancelledAt: stamp });
    tx.set(db.doc(`moonshotTokens/${m.teamId}_${m.seasonId}`), { teamId: m.teamId, userId: uid, seasonId: m.seasonId, used: admin.firestore.FieldValue.increment(-1), updatedAt: stamp }, { merge: true });
  });
  console.log('moonshot_cancelled', JSON.stringify({ uid, moonshotId }));
  return { cancelled: true };
});
