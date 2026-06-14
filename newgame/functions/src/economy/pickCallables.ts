// Pick callable — sets a player's side and/or stake for one entity in one
// session of a race, ESCROWING the stake from the garage at placement time.
//
// Why server-side: stakes are real cash. Debiting at placement (and refunding
// on decrease) means a player can never stake more than their bankroll, and
// settlement can never drive cash negative (the stake is already gone — see
// settleWeekend, which credits gross winnings on a win and nothing on a loss
// for escrowed picks). tl_picks is read-only to clients (firestore.rules); all
// writes come through here.
//
// Each pick entity is stored as { side, stake, escrowed }. `escrowed` marks
// that the stake's cash was debited; settlement uses it to grade pre-escrow
// legacy picks with the old (debit-at-settlement) math and new picks with the
// escrow math, so the rollout can't be gamed.

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { requireAuth, fail, garageRef, normaliseGarage, recordTransaction, assertSessionOpen, db } from './shared';

type SessionKey = 'qualifying' | 'race' | 'sprint';
const SESSIONS: SessionKey[] = ['qualifying', 'race', 'sprint'];

interface PickEntity {
  side: 'with' | 'against';
  stake: number;
  escrowed?: boolean;
}

// Sum of cash currently escrowed across all sessions/entities of a picks doc.
function sumEscrowed(picks: Record<string, Record<string, PickEntity>> | undefined): number {
  let total = 0;
  for (const session of Object.values(picks ?? {})) {
    for (const ent of Object.values(session ?? {})) {
      if (ent?.escrowed) total += ent.stake ?? 0;
    }
  }
  return total;
}

export const tlSetPick = functions.https.onCall(
  async (
    data: { raceId?: string; session?: SessionKey; entityId?: string; side?: 'with' | 'against'; stake?: number },
    context
  ) => {
    const uid = requireAuth(context);
    const { raceId, session, entityId } = data;
    if (!raceId || !entityId || !session || !SESSIONS.includes(session)) {
      fail('invalid-argument', 'raceId, session, entityId required.');
    }
    if (data.side != null && data.side !== 'with' && data.side !== 'against') {
      fail('invalid-argument', 'side must be "with" or "against".');
    }
    const stakeProvided = data.stake != null;
    if (stakeProvided && (!Number.isFinite(data.stake) || (data.stake as number) < 0)) {
      fail('invalid-argument', 'stake must be a non-negative number.');
    }

    // Server-side lock: a pick can't be set/changed once its session has begun.
    await assertSessionOpen(raceId!, session!);

    const pickRef = db.doc(`tl_picks/${uid}_${raceId}`);

    return db.runTransaction(async (tx) => {
      const pickSnap = await tx.get(pickRef);
      const cur = pickSnap.exists ? (pickSnap.data() as admin.firestore.DocumentData) : null;
      const allPicks = (cur?.picks as Record<string, Record<string, PickEntity>> | undefined) ?? {};
      const curEntity: PickEntity = allPicks[session!]?.[entityId!] ?? { side: 'with', stake: 0, escrowed: false };

      const newSide = data.side ?? curEntity.side ?? 'with';
      const newStake = stakeProvided ? Math.round(data.stake as number) : curEntity.stake ?? 0;
      // Only previously-escrowed cash counts as already debited; legacy stakes
      // (escrowed !== true) were never taken, so their baseline is 0.
      const oldEscrowedAmt = curEntity.escrowed ? curEntity.stake ?? 0 : 0;
      const delta = stakeProvided ? newStake - oldEscrowedAmt : 0;

      // Read garage before any write if cash will move.
      let cashAfter: number | null = null;
      if (delta !== 0) {
        const gSnap = await tx.get(garageRef(uid));
        if (!gSnap.exists) fail('not-found', 'Garage not found.');
        const garage = normaliseGarage(gSnap.data()!);
        if (delta > 0 && garage.cash < delta) {
          fail('failed-precondition', `Not enough cash. Need $${delta} more, have $${garage.cash}.`);
        }
        cashAfter = garage.cash - delta;
      }

      const newEntity: PickEntity = {
        side: newSide,
        stake: newStake,
        escrowed: stakeProvided ? newStake > 0 : curEntity.escrowed ?? false,
      };

      // Merge the new entity into the full picks map to recompute totalStaked.
      const mergedPicks: Record<string, Record<string, PickEntity>> = { ...allPicks };
      mergedPicks[session!] = { ...(mergedPicks[session!] ?? {}), [entityId!]: newEntity };
      const totalStaked = sumEscrowed(mergedPicks);

      tx.set(
        pickRef,
        {
          userId: uid,
          raceId,
          picks: { [session!]: { [entityId!]: newEntity } },
          totalStaked,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      if (delta !== 0) {
        tx.set(
          garageRef(uid),
          {
            cash: admin.firestore.FieldValue.increment(-delta),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        recordTransaction(tx, uid, {
          type: delta > 0 ? 'bet' : 'bet_refund',
          delta: -delta,
          cashAfter: cashAfter as number,
          entityId,
          raceId,
          description: delta > 0 ? `Stake ${entityId} (${session})` : `Stake refund ${entityId} (${session})`,
        });
      }

      return { side: newSide, stake: newStake, cashAfter };
    });
  }
);
