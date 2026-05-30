// Pole + league-winner bet callables. Cash-only side bets, server-authoritative.
// Odds are derived server-side (pole: driver tier; league: member count) so the
// client cannot supply favourable odds. Settled by tlOnRaceCompleted.

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import {
  POLE_ODDS,
  STAKE_MAX_PCT,
  BET_CANCEL_REFUND_PCT,
  requireAuth,
  fail,
  garageRef,
  normaliseGarage,
  recordTransaction,
  getDriver,
  db,
} from './shared';

const betsRef = (uid: string, raceId: string) => db.doc(`tl_bets/${uid}_${raceId}`);

function assertStake(stake: number, cash: number): void {
  if (!Number.isFinite(stake) || stake <= 0) fail('invalid-argument', 'Stake must be positive.');
  if (stake > cash) fail('failed-precondition', 'Stake exceeds bankroll.');
  const cap = Math.floor(cash * STAKE_MAX_PCT);
  if (stake > cap) fail('failed-precondition', `Stake exceeds 25% cap ($${cap}).`);
}

export const tlPlacePoleBet = functions.https.onCall(
  async (data: { raceId?: string; driverId?: string; stake?: number }, context) => {
    const uid = requireAuth(context);
    if (!data?.raceId || !data?.driverId || typeof data?.stake !== 'number') {
      fail('invalid-argument', 'raceId, driverId, stake required.');
    }
    const stake = Math.round(data.stake!);
    const driver = await getDriver(data.driverId!);
    const odds = POLE_ODDS[driver.tier];
    const payoutIfWin = Math.round(stake * odds);

    return db.runTransaction(async (tx) => {
      const gSnap = await tx.get(garageRef(uid));
      if (!gSnap.exists) fail('not-found', 'Garage not found.');
      const g = normaliseGarage(gSnap.data()!);

      const bSnap = await tx.get(betsRef(uid, data.raceId!));
      const existing = bSnap.exists ? (bSnap.data() as admin.firestore.DocumentData) : null;
      if (existing?.poleBet?.settled) fail('failed-precondition', 'Pole bet already settled.');
      const oldStake = (existing?.poleBet?.stake as number | undefined) ?? 0;

      // Effective cash if we first refund any prior unsettled stake.
      const effectiveCash = g.cash + oldStake;
      assertStake(stake, effectiveCash);
      const newCash = effectiveCash - stake;

      tx.set(
        betsRef(uid, data.raceId!),
        {
          userId: uid,
          raceId: data.raceId,
          poleBet: {
            driverId: driver.id,
            driverName: driver.name,
            driverShort: driver.shortName ?? null,
            driverTier: driver.tier,
            stake,
            odds,
            payoutIfWin,
            placedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          totalStaked: ((existing?.leagueBet?.stake as number | undefined) ?? 0) + stake,
          createdAt: existing?.createdAt ?? admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      tx.update(garageRef(uid), { cash: newCash, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      recordTransaction(tx, uid, {
        type: 'bet',
        delta: -stake,
        cashAfter: newCash,
        entityId: driver.id,
        entityName: driver.name,
        raceId: data.raceId,
        description: `Pole bet · ${driver.name} @ ${odds}x`,
      });
      return { stake, odds, payoutIfWin, cashAfter: newCash };
    });
  },
);

export const tlPlaceLeagueBet = functions.https.onCall(
  async (data: { raceId?: string; leagueId?: string; targetUserId?: string; stake?: number }, context) => {
    const uid = requireAuth(context);
    if (!data?.raceId || !data?.leagueId || !data?.targetUserId || typeof data?.stake !== 'number') {
      fail('invalid-argument', 'raceId, leagueId, targetUserId, stake required.');
    }
    if (data.targetUserId === uid) fail('failed-precondition', 'Cannot bet on yourself.');
    const stake = Math.round(data.stake!);

    // Odds + target name are authoritative from server-read league data.
    const leagueSnap = await db.doc(`tl_leagues/${data.leagueId}`).get();
    if (!leagueSnap.exists) fail('not-found', 'League not found.');
    const league = leagueSnap.data()!;
    const odds = (league.memberCount as number | undefined) ?? 0;
    if (odds <= 0) fail('failed-precondition', 'League has no members to bet on.');

    // Both better and target must be members.
    const [meMember, targetMember] = await Promise.all([
      db.doc(`tl_leagues/${data.leagueId}/members/${uid}`).get(),
      db.doc(`tl_leagues/${data.leagueId}/members/${data.targetUserId}`).get(),
    ]);
    if (!meMember.exists) fail('permission-denied', 'You are not a member of this league.');
    if (!targetMember.exists) fail('failed-precondition', 'Target is not a member of this league.');
    const targetDisplayName = (targetMember.data()?.displayName as string | undefined) ?? 'Player';
    const payoutIfWin = Math.round(stake * odds);

    return db.runTransaction(async (tx) => {
      const gSnap = await tx.get(garageRef(uid));
      if (!gSnap.exists) fail('not-found', 'Garage not found.');
      const g = normaliseGarage(gSnap.data()!);

      const bSnap = await tx.get(betsRef(uid, data.raceId!));
      const existing = bSnap.exists ? (bSnap.data() as admin.firestore.DocumentData) : null;
      if (existing?.leagueBet?.settled) fail('failed-precondition', 'League bet already settled.');
      const oldStake = (existing?.leagueBet?.stake as number | undefined) ?? 0;

      const effectiveCash = g.cash + oldStake;
      assertStake(stake, effectiveCash);
      const newCash = effectiveCash - stake;

      tx.set(
        betsRef(uid, data.raceId!),
        {
          userId: uid,
          raceId: data.raceId,
          leagueBet: {
            targetUserId: data.targetUserId,
            targetDisplayName,
            leagueId: data.leagueId,
            leagueName: (league.name as string | undefined) ?? null,
            stake,
            odds,
            payoutIfWin,
            placedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          totalStaked: ((existing?.poleBet?.stake as number | undefined) ?? 0) + stake,
          createdAt: existing?.createdAt ?? admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      tx.update(garageRef(uid), { cash: newCash, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      recordTransaction(tx, uid, {
        type: 'bet',
        delta: -stake,
        cashAfter: newCash,
        raceId: data.raceId,
        description: `League bet · ${targetDisplayName} @ ${odds}x`,
      });
      return { stake, odds, payoutIfWin, cashAfter: newCash };
    });
  },
);

export const tlCancelBet = functions.https.onCall(
  async (data: { raceId?: string; slot?: 'poleBet' | 'leagueBet' }, context) => {
    const uid = requireAuth(context);
    if (!data?.raceId || (data?.slot !== 'poleBet' && data?.slot !== 'leagueBet')) {
      fail('invalid-argument', 'raceId and slot (poleBet|leagueBet) required.');
    }
    const slot = data.slot!;
    return db.runTransaction(async (tx) => {
      const bSnap = await tx.get(betsRef(uid, data.raceId!));
      if (!bSnap.exists) return { refund: 0, cashAfter: 0 };
      const bets = bSnap.data() as admin.firestore.DocumentData;
      const bet = bets[slot];
      if (!bet || bet.settled) return { refund: 0, cashAfter: 0 };
      const refund = Math.round((bet.stake as number) * BET_CANCEL_REFUND_PCT);

      const gSnap = await tx.get(garageRef(uid));
      if (!gSnap.exists) fail('not-found', 'Garage not found.');
      const g = normaliseGarage(gSnap.data()!);
      const newCash = g.cash + refund;

      const other = slot === 'poleBet' ? bets.leagueBet : bets.poleBet;
      const totalStaked = (other?.stake as number | undefined) ?? 0;
      if (!other) {
        tx.delete(betsRef(uid, data.raceId!));
      } else {
        tx.update(betsRef(uid, data.raceId!), {
          [slot]: admin.firestore.FieldValue.delete(),
          totalStaked,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      tx.update(garageRef(uid), { cash: newCash, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      recordTransaction(tx, uid, {
        type: 'bet_refund',
        delta: refund,
        cashAfter: newCash,
        raceId: data.raceId,
        description: `Cancelled ${slot === 'poleBet' ? 'pole' : 'league'} bet · 80% refund`,
      });
      return { refund, cashAfter: newCash };
    });
  },
);
