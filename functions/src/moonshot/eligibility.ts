/**
 * May this call be made? One pure decision for quote and confirm alike (F-106), so
 * the rule is testable and the two paths cannot drift. Returns the refusal, or null.
 */
import type { MoonshotConfig, PredictionType, StakeCurrency } from './config';

export interface Refusal { code: 'failed-precondition' | 'invalid-argument' | 'resource-exhausted' | 'permission-denied'; message: string }

export interface EligibilityInput {
  cfg: MoonshotConfig;
  /** the race's round number and its lock time (ms); null lock means the schedule is not synced */
  race: { round: number; lockAtMs: number | null };
  nowMs: number;
  /** tokens already spent this season (confirmed, locked or settled calls; cancelled and void do not count) */
  tokensUsed: number;
  /** another call already on this race for this team */
  hasCallOnRace: boolean;
  type: PredictionType;
  target?: number;
  currency: StakeCurrency;
  stake: number;
  /** what the team could lose: season points, or bank */
  balance: number;
  /** the driver is in the model for this race */
  driverInModel: boolean;
  /** the model's chance for the call, once known */
  probability?: number | null;
  multiplier?: number;
}

export function eligibility(i: EligibilityInput): Refusal | null {
  const { cfg } = i;
  if (!cfg.enabled) return { code: 'failed-precondition', message: 'Moonshots are not available.' };
  if (i.race.round < cfg.unlockRound) return { code: 'failed-precondition', message: 'Moonshots unlock at midseason.' };
  if (i.race.lockAtMs === null) return { code: 'failed-precondition', message: 'This race has no lock time yet.' };
  if (i.nowMs >= i.race.lockAtMs) return { code: 'failed-precondition', message: 'Selections are locked for this race.' };
  if (!cfg.predictionTypesEnabled.includes(i.type)) return { code: 'invalid-argument', message: 'That prediction is not available.' };
  if (i.type === 'EXACT_FINISH' && (!i.target || !Number.isInteger(i.target) || i.target < 1 || i.target > 22)) return { code: 'invalid-argument', message: 'Choose a finishing position.' };
  if (!i.driverInModel) return { code: 'invalid-argument', message: 'No model for that driver this race.' };
  const levels = i.currency === 'POINTS' ? cfg.pointsStakeLevels : cfg.cashStakeLevels;
  if (!levels.includes(i.stake)) return { code: 'invalid-argument', message: 'Pick one of the offered stakes.' };
  if (i.stake > i.balance) return { code: 'failed-precondition', message: i.currency === 'POINTS' ? 'You do not have that many points to risk.' : 'Your bank does not cover that stake.' };
  if (i.tokensUsed >= cfg.tokensPerTeam) return { code: 'resource-exhausted', message: 'You have used all your Moonshots this season.' };
  if (i.hasCallOnRace) return { code: 'resource-exhausted', message: 'You already have a Moonshot on this race.' };
  if (i.probability != null && i.probability <= 0) return { code: 'invalid-argument', message: 'The model gives that no chance.' };
  if (i.multiplier != null && i.currency === 'POINTS' && Math.round(i.stake * i.multiplier) > cfg.maxSingleRewardPoints) return { code: 'invalid-argument', message: `A single Moonshot can win at most ${cfg.maxSingleRewardPoints} points.` };
  return null;
}

/** Statuses that spend a token. Cancelled before lock and void after settlement give it back. */
export const TOKEN_SPENDING_STATUSES = ['CONFIRMED', 'LOCKED', 'LIVE', 'HIT', 'MISSED', 'SETTLED'] as const;
