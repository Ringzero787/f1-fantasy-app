/**
 * Moonshot settlement (F-107). When a race's classification is final, every call on it
 * is settled from the official finishing position: a hit pays the reward, a miss takes the
 * stake, a void returns the token. Server-authoritative, idempotent, auditable.
 *
 * - The decision is a pure function (`settleDecision`) over the call, the driver's official
 *   result and the configured DNF/DNS/DSQ/cancelled rules, so every rule and type is tested.
 * - Each call is settled in its own transaction keyed by `settlementId`
 *   (season + race + moonshot + version); a call with `settledAt` set is left alone, so the
 *   scoring run may repeat (repair, redelivery) without paying or taking twice.
 * - Points go to `fantasyTeams.moonshotPoints`, a separate server-owned column, never to
 *   `totalPoints`/`lockedPoints`; the season's positive total is capped. Cash goes to
 *   `budget`, never below zero.
 * - The call's original terms (probability, multiplier, stake, prediction, model, lockAt) are
 *   never overwritten; settlement adds its own fields beside them.
 *
 * Runs from the race scoring run after team scoring (Phase 1.5) and, for a cancelled race,
 * from `onRaceCancelled` — `onRaceCompleted` never fires for one.
 */
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { loadMoonshotConfig, type MoonshotConfig, type PredictionType, type StakeCurrency, type VoidRule } from './config';

export const SETTLEMENT_VERSION = 1;

export type SettlementResult = 'HIT' | 'MISSED' | 'VOID';

/** The driver's line in `races/{id}.results.raceResults`; absent when the driver is not in the classification. */
export interface DriverResultLike { position?: number | null; status?: string | null }

export interface CallTerms {
  predictionType: PredictionType;
  predictionTarget?: number | null;
  stakeCurrency: StakeCurrency;
  stakeAmount: number;
  potentialReward: number;
}

export interface Decision {
  result: SettlementResult;
  /** the official finishing position the decision used, or null when there was none */
  officialDriverFinish: number | null;
  /** finished | dnf | dns | dsq | nc | cancelled | missing */
  driverStatus: string;
  /** signed: + reward on a hit, − stake on a miss, 0 on a void (before cap or clamp) */
  adjustmentAmount: number;
}

/** Did the prediction come true at this finishing position? */
export function predictionHit(type: PredictionType, position: number, target?: number | null): boolean {
  switch (type) {
    case 'WIN': return position === 1;
    case 'PODIUM': return position >= 1 && position <= 3;
    case 'TOP_5': return position >= 1 && position <= 5;
    case 'EXACT_FINISH': return target != null && position === target;
    default: return false;
  }
}

const byRule = (rule: VoidRule, call: CallTerms, status: string, position: number | null): Decision =>
  rule === 'VOID'
    ? { result: 'VOID', officialDriverFinish: position, driverStatus: status, adjustmentAmount: 0 }
    : { result: 'MISSED', officialDriverFinish: position, driverStatus: status, adjustmentAmount: -call.stakeAmount };

/**
 * The settlement decision. Cancelled race → `cancelledRule`; driver absent from the classification
 * or `dns` → `dnsRule`; `dsq` → `dsqRule`; `dnf` and `nc` (ran, not classified) → `dnfRule`;
 * a finisher with a position is compared with the prediction.
 */
export function settleDecision(call: CallTerms, driver: DriverResultLike | undefined, cfg: MoonshotConfig, raceCancelled = false): Decision {
  const position = driver && typeof driver.position === 'number' && driver.position >= 1 ? driver.position : null;
  if (raceCancelled) return byRule(cfg.cancelledRule, call, 'cancelled', null);
  if (!driver) return byRule(cfg.dnsRule, call, 'missing', null);
  const status = typeof driver.status === 'string' ? driver.status : 'finished';
  if (status === 'dns') return byRule(cfg.dnsRule, call, status, position);
  if (status === 'dsq') return byRule(cfg.dsqRule, call, status, position);
  if (status === 'dnf' || status === 'nc' || position === null) return byRule(cfg.dnfRule, call, status, position);
  return predictionHit(call.predictionType, position, call.predictionTarget)
    ? { result: 'HIT', officialDriverFinish: position, driverStatus: status, adjustmentAmount: call.potentialReward }
    : { result: 'MISSED', officialDriverFinish: position, driverStatus: status, adjustmentAmount: -call.stakeAmount };
}

/** A points hit pays up to the season cap on positive Moonshot gain; beyond it the hit is marked capped. */
export function capHit(adjustment: number, pointsWonSoFar: number, cap: number): { paid: number; capped: boolean } {
  if (adjustment <= 0) return { paid: adjustment, capped: false };
  const room = Math.max(0, cap - Math.max(0, pointsWonSoFar));
  return room >= adjustment ? { paid: adjustment, capped: false } : { paid: room, capped: true };
}

/** A cash adjustment never takes the bank below zero; a miss larger than the bank is marked a shortfall. */
export function clampCash(budget: number, adjustment: number): { budget: number; applied: number; shortfall: boolean } {
  const next = budget + adjustment;
  if (next >= 0) return { budget: next, applied: adjustment, shortfall: false };
  return { budget: 0, applied: -budget, shortfall: true };
}

export const settlementIdFor = (seasonId: string, raceId: string, moonshotId: string, version = SETTLEMENT_VERSION): string =>
  `${seasonId}:${raceId}:${moonshotId}:v${version}`;

/** Season statistics kept on the team (SPEC §28); recap awards read these. */
export interface MoonshotStats {
  used: number; hit: number; missed: number; voided: number;
  pointsRisked: number; pointsWon: number; cashRisked: number; cashWon: number;
  biggestHit: { moonshotId: string; adjustmentAmount: number; driverId: string; predictionType: PredictionType; raceId: string } | null;
}
const EMPTY_STATS: MoonshotStats = { used: 0, hit: 0, missed: 0, voided: 0, pointsRisked: 0, pointsWon: 0, cashRisked: 0, cashWon: 0, biggestHit: null };

/** Pure: the team's stats after one settled call. */
export function nextStats(prev: Partial<MoonshotStats> | undefined, call: CallTerms & { id: string; driverId: string; raceId: string }, result: SettlementResult, applied: number): MoonshotStats {
  const s: MoonshotStats = { ...EMPTY_STATS, ...(prev ?? {}) };
  if (result === 'VOID') return { ...s, voided: s.voided + 1 };
  const points = call.stakeCurrency === 'POINTS';
  const out: MoonshotStats = {
    ...s, used: s.used + 1, hit: s.hit + (result === 'HIT' ? 1 : 0), missed: s.missed + (result === 'MISSED' ? 1 : 0),
    pointsRisked: s.pointsRisked + (points ? call.stakeAmount : 0), cashRisked: s.cashRisked + (points ? 0 : call.stakeAmount),
    pointsWon: s.pointsWon + (points && applied > 0 ? applied : 0), cashWon: s.cashWon + (!points && applied > 0 ? applied : 0),
  };
  // the biggest hit is a points record: cash and points are not one scale, and a hit capped to nothing is no record
  if (result === 'HIT' && points && applied > 0 && applied > (s.biggestHit?.adjustmentAmount ?? 0)) {
    out.biggestHit = { moonshotId: call.id, adjustmentAmount: applied, driverId: call.driverId, predictionType: call.predictionType, raceId: call.raceId };
  }
  return out;
}

/** Statuses a settlement run picks up: anything confirmed that has not been settled or cancelled. */
export const SETTLEABLE_STATUSES = ['CONFIRMED', 'LOCKED', 'LIVE'] as const;

type RaceDriverResult = DriverResultLike & { driverId?: string };
interface RaceLike { seasonId?: unknown; round?: unknown; name?: unknown; status?: unknown; results?: { raceResults?: RaceDriverResult[] } }

/** Pure: is this call still waiting to be settled? Settled, cancelled and void calls are never touched again. */
export const isSettleable = (m: { status?: unknown; settledAt?: unknown }): boolean =>
  !m.settledAt && typeof m.status === 'string' && (SETTLEABLE_STATUSES as readonly string[]).includes(m.status);

/**
 * Settle every open call on a race. Safe to repeat: a call already carrying `settledAt` is skipped
 * inside its own transaction. Returns counts for the scoring log.
 */
export async function settleMoonshotsForRace(db: admin.firestore.Firestore, raceId: string, race: RaceLike, opts: { cancelled?: boolean } = {}): Promise<{ settled: number; skipped: number; failed: number }> {
  const open = await db.collection('moonshots').where('raceId', '==', raceId).where('status', 'in', [...SETTLEABLE_STATUSES]).get();
  if (open.empty) return { settled: 0, skipped: 0, failed: 0 };
  const cfg = await loadMoonshotConfig(db);   // the rules apply to existing calls even when the mechanic is switched off
  const results: RaceDriverResult[] = race.results?.raceResults ?? [];
  const byDriver = new Map(results.filter((r) => typeof r.driverId === 'string').map((r) => [r.driverId as string, r]));
  const roundNumber = typeof race.round === 'number' ? race.round : null;
  let settled = 0, skipped = 0, failed = 0;
  for (const doc of open.docs) {
    try {
      const done = await db.runTransaction(async (tx) => {
        const ref = doc.ref;
        const snap = await tx.get(ref);
        if (!snap.exists) return false;
        const m = snap.data()!;
        if (!isSettleable(m)) return false;
        const teamRef = db.doc(`fantasyTeams/${m.teamId}`);
        const teamSnap = await tx.get(teamRef);
        const now = admin.firestore.FieldValue.serverTimestamp();
        const settlementId = settlementIdFor(String(m.seasonId), raceId, snap.id);
        if (!teamSnap.exists) {
          // the team is gone (account deleted): record the void on the call and touch nothing else,
          // or a merge-set here would resurrect a stub team document
          tx.update(ref, { status: 'VOID', result: 'VOID', officialDriverFinish: null, officialDriverStatus: 'team-missing', adjustmentAmount: 0, adjustmentRequested: 0, capped: false, shortfall: false, settlementId, settlementVersion: SETTLEMENT_VERSION, settledAt: now, lockedAt: m.lockedAt ?? m.lockAt ?? null, updatedAt: now });
          return true;
        }
        const team = teamSnap.data()!;
        const call: CallTerms & { id: string; driverId: string; raceId: string } = {
          id: snap.id, driverId: m.driverId, raceId, predictionType: m.predictionType, predictionTarget: m.predictionTarget,
          stakeCurrency: m.stakeCurrency, stakeAmount: m.stakeAmount ?? 0, potentialReward: m.potentialReward ?? 0,
        };
        const decision = settleDecision(call, byDriver.get(m.driverId), cfg, !!opts.cancelled);
        const prevStats: Partial<MoonshotStats> | undefined = team.moonshotStats;
        const teamUpdate: Record<string, unknown> = { updatedAt: now };
        let applied = decision.adjustmentAmount, capped = false, shortfall = false;
        if (decision.result !== 'VOID') {
          if (call.stakeCurrency === 'POINTS') {
            ({ paid: applied, capped } = capHit(decision.adjustmentAmount, prevStats?.pointsWon ?? 0, cfg.maxSeasonMoonshotPointGain));
            teamUpdate.moonshotPoints = (typeof team.moonshotPoints === 'number' ? team.moonshotPoints : 0) + applied;
          } else {
            const bank = typeof team.budget === 'number' ? team.budget : 0;
            ({ budget: teamUpdate.budget, applied, shortfall } = clampCash(bank, decision.adjustmentAmount));
          }
        }
        teamUpdate.moonshotStats = nextStats(prevStats, call, decision.result, applied);
        tx.set(teamRef, teamUpdate, { merge: true });

        tx.update(ref, {
          status: decision.result, result: decision.result, officialDriverFinish: decision.officialDriverFinish, officialDriverStatus: decision.driverStatus,
          adjustmentAmount: applied, adjustmentRequested: decision.adjustmentAmount, capped, shortfall,
          settlementId, settlementVersion: SETTLEMENT_VERSION, settledAt: now, lockedAt: m.lockedAt ?? m.lockAt ?? null, updatedAt: now,
        });
        // the weekend record beside the scoring phases (not inside them: snapshotWeekendPoints sums phases),
        // keyed by call so a second call on the race (maxPerRace > 1) does not overwrite the first;
        // a cancelled race has no weekend, so no snapshot is created for it
        if (!opts.cancelled) tx.set(teamRef.collection('raceSnapshots').doc(raceId), {
          teamId: m.teamId, userId: m.userId, leagueId: m.leagueId ?? null, raceId,
          moonshots: { [snap.id]: { moonshotId: snap.id, result: decision.result, stakeCurrency: m.stakeCurrency, stakeAmount: call.stakeAmount, adjustmentAmount: applied, driverId: m.driverId, predictionType: m.predictionType, predictionTarget: m.predictionTarget ?? null, officialDriverFinish: decision.officialDriverFinish, multiplier: m.multiplier ?? null } },
        }, { merge: true });
        // a void returns the token
        if (decision.result === 'VOID') {
          tx.set(db.doc(`moonshotTokens/${m.teamId}_${m.seasonId}`), { teamId: m.teamId, userId: m.userId, seasonId: m.seasonId, used: admin.firestore.FieldValue.increment(-1), updatedAt: now }, { merge: true });
        }
        // the league's season history (SPEC §29); deterministic id so a repeat cannot post twice
        if (typeof m.leagueId === 'string' && m.leagueId && !m.leagueId.includes('/')) {
          tx.set(db.doc(`leagues/${m.leagueId}/activity/${snap.id}_settled`), {
            type: `MOONSHOT_${decision.result}`, moonshotId: snap.id, userId: m.userId, teamId: m.teamId, raceId, roundNumber, raceName: typeof race.name === 'string' ? race.name : null,
            driverId: m.driverId, predictionType: m.predictionType, predictionTarget: m.predictionTarget ?? null, officialDriverFinish: decision.officialDriverFinish, officialDriverStatus: decision.driverStatus,
            stakeCurrency: m.stakeCurrency, stakeAmount: call.stakeAmount, multiplier: m.multiplier ?? null, modelProbability: m.modelProbability ?? null, adjustmentAmount: applied, capped, shortfall,
            createdAt: now,
          });
        }
        return true;
      });
      if (done) settled++; else skipped++;
    } catch (err) {
      failed++;
      console.error(`[moonshot] settlement of ${doc.id} on ${raceId} failed:`, err);
    }
  }
  console.log(`[moonshot] ${raceId}: settled ${settled}, skipped ${skipped}, failed ${failed}${opts.cancelled ? ' (race cancelled)' : ''}`);
  return { settled, skipped, failed };
}

/**
 * A cancelled race never reaches onRaceCompleted; its calls settle by `cancelledRule` here.
 * A race that already carries a classification is not treated as cancelled — its calls settle on
 * the result, so a mistaken status flip cannot void (or take) stakes on a race that ran. Un-cancelling
 * a race after its calls were voided is a manual op: settledAt keeps them settled.
 */
export const onRaceCancelled = functions.runWith({ timeoutSeconds: 300 }).firestore.document('races/{raceId}').onUpdate(async (change, context) => {
  const before = change.before.data(), after = change.after.data();
  if (before.status === 'cancelled' || after.status !== 'cancelled') return null;
  if (Array.isArray(after.results?.raceResults) && after.results.raceResults.length > 0) {
    console.warn(`[moonshot] ${context.params.raceId} marked cancelled but carries a classification; not voiding its calls`);
    return null;
  }
  await settleMoonshotsForRace(admin.firestore(), context.params.raceId, after, { cancelled: true });
  return null;
});
