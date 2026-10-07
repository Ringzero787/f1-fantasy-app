/**
 * Moonshot configuration (F-106). Everything that governs the mechanic lives in
 * `config/app.moonshot` so it can be rebalanced without an app release; the
 * defaults here are the owner's V1 numbers (docs/design/moonshot/SPEC.md §2,
 * §3, §7, §8, §19, §33). Fail-closed: no block, or `enabled: false`, means no
 * Moonshot anywhere.
 */
import * as admin from 'firebase-admin';

export type PredictionType = 'WIN' | 'PODIUM' | 'TOP_5' | 'EXACT_FINISH';
export type StakeCurrency = 'POINTS' | 'CASH';
export type VoidRule = 'LOSS' | 'VOID';

export interface RewardBand { minProbability: number; maxProbability: number; label: string; multiplier: number }

export interface MoonshotConfig {
  enabled: boolean;
  unlockRound: number;
  tokensPerTeam: number;
  maxPerRace: number;
  predictionTypesEnabled: PredictionType[];
  pointsStakeLevels: number[];
  cashStakeLevels: number[];
  pricing: {
    /** `banded`: the document's fixed multipliers per band. `continuous`: (1 − p) / p × (1 − vig), labelled by the same bands. */
    mode: 'banded' | 'continuous';
    bands: RewardBand[];
    vig: number;
    rounding: number;
    minMultiplier: number;
    maxMultiplier: number;
  };
  maxSingleRewardPoints: number;
  maxSeasonMoonshotPointGain: number;
  dnfRule: VoidRule;
  dnsRule: VoidRule;
  dsqRule: VoidRule;
  cancelledRule: VoidRule;
  hideBeforeLock: boolean;
  tutorialEnabled: boolean;
  /** how long a quote may be confirmed for, in seconds */
  quoteTtlSeconds: number;
  /** when a race has no model of its own, the most recent earlier round's model is used */
  carryForwardModel: boolean;
  /** user-facing strings the clients read (SPEC §2, §8, §13, §20); F-108 supplies the defaults it falls back to */
  copy: Record<string, string>;
}

export const DEFAULT_BANDS: RewardBand[] = [
  { minProbability: 0.65, maxProbability: 1, label: 'SAFE', multiplier: 0.5 },
  { minProbability: 0.40, maxProbability: 0.65, label: 'BOLD', multiplier: 1.25 },
  { minProbability: 0.20, maxProbability: 0.40, label: 'LONGSHOT', multiplier: 2.5 },
  { minProbability: 0.08, maxProbability: 0.20, label: 'MOONSHOT', multiplier: 5 },
  { minProbability: 0, maxProbability: 0.08, label: 'EXTREME', multiplier: 8 },
];

export const DEFAULT_CONFIG: MoonshotConfig = {
  enabled: false,
  unlockRound: 13,
  tokensPerTeam: 3,
  maxPerRace: 1,
  predictionTypesEnabled: ['WIN', 'PODIUM', 'TOP_5'],
  pointsStakeLevels: [50, 100, 200],
  cashStakeLevels: [50, 100, 200],
  pricing: { mode: 'banded', bands: DEFAULT_BANDS, vig: 0.08, rounding: 0.25, minMultiplier: 0.25, maxMultiplier: 8 },
  maxSingleRewardPoints: 1000,
  maxSeasonMoonshotPointGain: 1500,
  dnfRule: 'LOSS',
  dnsRule: 'VOID',
  dsqRule: 'LOSS',
  cancelledRule: 'VOID',
  hideBeforeLock: true,
  tutorialEnabled: true,
  quoteTtlSeconds: 600,
  carryForwardModel: true,
  copy: {},
};

/** The words the design keeps out of anything a player reads (SPEC §21, §34); a copy override that uses one is dropped. */
export const FORBIDDEN_TERMS = ['bet', 'bets', 'betting', 'wager', 'wagers', 'wagering', 'odds', 'moneyline', 'parlay', 'parlays', 'sportsbook', 'gambling', 'gamble', 'bookmaker', 'bookmakers', 'bookie', 'payout', 'payouts', 'house'];
export const usesForbiddenTerm = (text: string): boolean => { const words = text.toLowerCase().split(/[^a-z]+/); return FORBIDDEN_TERMS.some((t) => words.includes(t)); };

/** Defaults overlaid with whatever the document carries; unknown keys are ignored, bad types fall back. */
export function mergeConfig(raw: unknown): MoonshotConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (k: string, d: number) => (typeof r[k] === 'number' && Number.isFinite(r[k] as number) ? (r[k] as number) : d);
  const bool = (k: string, d: boolean) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : d);
  const rule = (k: string, d: VoidRule): VoidRule => (r[k] === 'LOSS' || r[k] === 'VOID' ? (r[k] as VoidRule) : d);
  const nums = (k: string, d: number[]) => (Array.isArray(r[k]) && (r[k] as unknown[]).every((x) => typeof x === 'number') ? (r[k] as number[]) : d);
  const types = Array.isArray(r.predictionTypesEnabled)
    ? (r.predictionTypesEnabled as unknown[]).filter((t): t is PredictionType => t === 'WIN' || t === 'PODIUM' || t === 'TOP_5' || t === 'EXACT_FINISH')
    : DEFAULT_CONFIG.predictionTypesEnabled;
  const p = (r.pricing && typeof r.pricing === 'object' ? r.pricing : {}) as Record<string, unknown>;
  const bands = Array.isArray(p.bands) && (p.bands as unknown[]).length > 0
    ? (p.bands as RewardBand[]).filter((b) => b && typeof b.minProbability === 'number' && typeof b.maxProbability === 'number' && typeof b.multiplier === 'number' && typeof b.label === 'string')
    : DEFAULT_BANDS;
  return {
    enabled: bool('enabled', false),
    unlockRound: num('unlockRound', DEFAULT_CONFIG.unlockRound),
    tokensPerTeam: num('tokensPerTeam', DEFAULT_CONFIG.tokensPerTeam),
    maxPerRace: num('maxPerRace', DEFAULT_CONFIG.maxPerRace),
    predictionTypesEnabled: types,
    pointsStakeLevels: nums('pointsStakeLevels', DEFAULT_CONFIG.pointsStakeLevels),
    cashStakeLevels: nums('cashStakeLevels', DEFAULT_CONFIG.cashStakeLevels),
    pricing: {
      mode: p.mode === 'continuous' ? 'continuous' : 'banded',
      bands: bands.length ? bands : DEFAULT_BANDS,
      vig: typeof p.vig === 'number' ? (p.vig as number) : DEFAULT_CONFIG.pricing.vig,
      rounding: typeof p.rounding === 'number' && (p.rounding as number) > 0 ? (p.rounding as number) : DEFAULT_CONFIG.pricing.rounding,
      minMultiplier: typeof p.minMultiplier === 'number' ? (p.minMultiplier as number) : DEFAULT_CONFIG.pricing.minMultiplier,
      maxMultiplier: typeof p.maxMultiplier === 'number' ? (p.maxMultiplier as number) : DEFAULT_CONFIG.pricing.maxMultiplier,
    },
    maxSingleRewardPoints: num('maxSingleRewardPoints', DEFAULT_CONFIG.maxSingleRewardPoints),
    maxSeasonMoonshotPointGain: num('maxSeasonMoonshotPointGain', DEFAULT_CONFIG.maxSeasonMoonshotPointGain),
    dnfRule: rule('dnfRule', 'LOSS'),
    dnsRule: rule('dnsRule', 'VOID'),
    dsqRule: rule('dsqRule', 'LOSS'),
    cancelledRule: rule('cancelledRule', 'VOID'),
    hideBeforeLock: bool('hideBeforeLock', true),
    tutorialEnabled: bool('tutorialEnabled', true),
    quoteTtlSeconds: num('quoteTtlSeconds', DEFAULT_CONFIG.quoteTtlSeconds),
    carryForwardModel: bool('carryForwardModel', true),
    copy: r.copy && typeof r.copy === 'object' ? Object.fromEntries(Object.entries(r.copy as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string' && !usesForbiddenTerm(e[1]))) : {},
  };
}

/** The live configuration: `config/app.moonshot` merged over the defaults. Missing document → disabled. */
export async function loadMoonshotConfig(db: admin.firestore.Firestore = admin.firestore()): Promise<MoonshotConfig> {
  const snap = await db.doc('config/app').get();
  return mergeConfig(snap.exists ? snap.data()?.moonshot : undefined);
}
