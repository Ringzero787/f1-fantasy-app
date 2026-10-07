/**
 * Moonshot in the app (F-108) — the pure parts: the client's view of `config/app.moonshot`,
 * availability by round, the copy table (server-overridable, checked against the words the
 * design forbids), and the formatting the sheet, the team card and the live card share.
 * Every number shown comes from the server (menu, quote, call); nothing here prices anything.
 */

export type PredictionType = 'WIN' | 'PODIUM' | 'TOP_5' | 'EXACT_FINISH';
export type StakeCurrency = 'POINTS' | 'CASH';
export type MoonshotStatus = 'CONFIRMED' | 'LOCKED' | 'LIVE' | 'HIT' | 'MISSED' | 'VOID' | 'SETTLED' | 'CANCELLED';

/** The client's read of `config/app.moonshot`; mirrors functions/src/moonshot/config.ts, fail-closed. */
export interface MoonshotClientConfig {
  enabled: boolean;
  unlockRound: number;
  tokensPerTeam: number;
  predictionTypesEnabled: PredictionType[];
  pointsStakeLevels: number[];
  cashStakeLevels: number[];
  hideBeforeLock: boolean;
  tutorialEnabled: boolean;
  copy: Record<string, string>;
}

const TYPES: PredictionType[] = ['WIN', 'PODIUM', 'TOP_5', 'EXACT_FINISH'];

export function parseMoonshotConfig(raw: unknown): MoonshotClientConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (k: string, d: number) => (typeof r[k] === 'number' && Number.isFinite(r[k] as number) ? (r[k] as number) : d);
  const bool = (k: string, d: boolean) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : d);
  const nums = (k: string, d: number[]) => (Array.isArray(r[k]) && (r[k] as unknown[]).every((x) => typeof x === 'number') ? (r[k] as number[]) : d);
  const types: PredictionType[] = Array.isArray(r.predictionTypesEnabled) ? (r.predictionTypesEnabled as unknown[]).filter((t): t is PredictionType => TYPES.includes(t as PredictionType)) : ['WIN', 'PODIUM', 'TOP_5'];
  const copy = r.copy && typeof r.copy === 'object' ? Object.fromEntries(Object.entries(r.copy as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string')) : {};
  return {
    enabled: bool('enabled', false),
    unlockRound: num('unlockRound', 13),
    tokensPerTeam: num('tokensPerTeam', 3),
    predictionTypesEnabled: types,
    pointsStakeLevels: nums('pointsStakeLevels', [50, 100, 200]),
    cashStakeLevels: nums('cashStakeLevels', [50, 100, 200]),
    hideBeforeLock: bool('hideBeforeLock', true),
    tutorialEnabled: bool('tutorialEnabled', true),
    copy,
  };
}

export type Availability = 'off' | 'locked' | 'open';

/** Nothing renders when the feature is off; before the unlock round only the teaser row shows. */
export function moonshotAvailability(cfg: MoonshotClientConfig, round: number | null | undefined): Availability {
  if (!cfg.enabled) return 'off';
  if (round == null || round < cfg.unlockRound) return 'locked';
  return 'open';
}

/** One call, as `moonshots/{id}` reaches the client (dates as ms). */
export interface MoonshotCall {
  id: string;
  raceId: string;
  roundNumber: number | null;
  driverId: string;
  predictionType: PredictionType;
  predictionTarget: number | null;
  stakeCurrency: StakeCurrency;
  stakeAmount: number;
  modelProbability: number;
  rewardBand: string;
  multiplier: number;
  potentialReward: number;
  ownsDriver: boolean;
  status: MoonshotStatus;
  lockAtMs: number | null;
  result: 'HIT' | 'MISSED' | 'VOID' | null;
  officialDriverFinish: number | null;
  adjustmentAmount: number | null;
}

/** What the server prices for one driver, per prediction type, before a stake is chosen. */
export interface MenuPrediction { type: PredictionType; probability: number; band: string; multiplier: number }

export interface MoonshotQuote {
  quoteId: string;
  modelProbability: number;
  rewardBand: string;
  multiplier: number;
  stakeAmount: number;
  potentialReward: number;
  expiresAt: number;
  ownsDriver: boolean;
  carriedFrom: string | null;
  tokensLeft: number;
  model: { expectedFinish: number; likelyLo: number; likelyHi: number; predicted: number };
}

// ── copy ────────────────────────────────────────────────────────────────────
// The design's words only. `config/app.moonshot.copy` overrides any key; these are the defaults.

export const MOONSHOT_COPY = {
  lockedTitle: 'MOONSHOTS UNLOCK AT MIDSEASON',
  lockedBody: 'From round {round}: call one driver’s result, risk points or cash, and a hit pays a multiplier.',
  tabTitle: 'MOONSHOT',
  callTitle: 'CALL A MOONSHOT',
  tokensLeft: 'YOU HAVE {n} MOONSHOT{s}',
  tokensNone: 'NO MOONSHOTS LEFT THIS SEASON',
  alreadyCalled: 'YOUR MOONSHOT THIS RACE',
  currencyTitle: 'WHAT ARE YOU RISKING?',
  currencyPoints: 'CHAMPIONSHIP POINTS',
  currencyPointsSub: 'Move up the standings.',
  currencyCash: 'CASH',
  currencyCashSub: 'Build a stronger roster.',
  predictionTitle: 'PICK YOUR CHALLENGE',
  predictionSub: 'Harder predictions earn bigger rewards.',
  stakeTitle: 'CHOOSE YOUR RISK',
  stakeCautious: 'CAUTIOUS',
  stakeBold: 'BOLD',
  stakeAllIn: 'ALL-IN',
  confirmTitle: 'CONFIRM MOONSHOT',
  confirmLockNote: 'This Moonshot locks when race selections lock.',
  confirmButton: 'CONFIRM MOONSHOT',
  callButton: 'CALL IT',
  cancelButton: 'CANCEL',
  doubleDownTitle: 'DOUBLE DOWN',
  doubleDownBody: '{driver} is already on your roster. Think the result is coming? A poor race already hurts your score.',
  modelChance: 'MODEL CHANCE',
  whyMultiplier: 'WHY THIS MULTIPLIER?',
  carriedFrom: 'MODEL CARRIED FROM {race}',
  hit: 'HIT',
  miss: 'MISS',
  atRisk: 'AT RISK',
  reward: 'REWARD',
  locksAt: 'LOCKS WITH SELECTIONS',
  lockedCall: 'LOCKED · NO CHANGES THIS WEEKEND',
  change: 'CHANGE',
  cancelCall: 'CANCEL MOONSHOT',
  cancelled: 'MOONSHOT CANCELLED · TOKEN RETURNED',
  yourMoonshot: 'YOUR MOONSHOT',
  stateIn: 'IN',
  stateOut: 'OUT',
  stateClose: 'ONE POSITION AWAY',
  statePending: 'PENDING',
  resultHit: 'MOONSHOT HIT',
  resultMissed: 'MOONSHOT MISSED',
  resultVoid: 'MOONSHOT VOID · TOKEN RETURNED',
  tutorial1Title: 'MOONSHOTS ARE HERE',
  tutorial1Body: 'Tap any driver to call your shot.',
  tutorial2Title: 'PICK YOUR CHALLENGE',
  tutorial2Body: 'Harder predictions earn bigger rewards.',
  tutorial3Title: 'CHOOSE YOUR RISK',
  tutorial3Body: 'Risk Championship Points to climb the standings or Cash to strengthen your roster.',
  tutorial4Title: 'YOU GET {n}.',
  tutorial4Body: 'Choose wisely.',
  tutorialStart: 'START MOONSHOTTING',
} as const;

export type CopyKey = keyof typeof MOONSHOT_COPY;

/** The words the design rules out of anything a player reads (SPEC §21, §34). */
export const FORBIDDEN_TERMS = ['bet', 'bets', 'betting', 'wager', 'odds', 'moneyline', 'parlay', 'sportsbook', 'gambling', 'gamble', 'bookmaker', 'payout'];

/** A copy string with its placeholders filled; a server override wins when present. */
export function copyText(cfg: Pick<MoonshotClientConfig, 'copy'> | null | undefined, key: CopyKey, vars: Record<string, string | number> = {}): string {
  const base = cfg?.copy?.[key] ?? MOONSHOT_COPY[key];
  return base.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** Does a string use any forbidden word (whole words, any case)? */
export function usesForbiddenTerm(text: string): string | null {
  const words = text.toLowerCase().split(/[^a-z]+/);
  return FORBIDDEN_TERMS.find((t) => words.includes(t)) ?? null;
}

// ── formatting ──────────────────────────────────────────────────────────────

export const predictionLabel = (type: PredictionType, target?: number | null): string =>
  type === 'WIN' ? 'WIN' : type === 'PODIUM' ? 'PODIUM' : type === 'TOP_5' ? 'TOP 5' : target ? `FINISH P${target}` : 'EXACT FINISH';

/** "Hadjar finishes on the podium" — the sentence under a prediction choice. */
export const predictionSentence = (type: PredictionType, driver: string, target?: number | null): string =>
  type === 'WIN' ? `${driver} wins the race` : type === 'PODIUM' ? `${driver} finishes on the podium` : type === 'TOP_5' ? `${driver} finishes in the top five` : `${driver} finishes exactly P${target ?? '?'}`;

export const chancePct = (p: number): string => `${Math.round(p * 100)}%`;
export const multiplierLabel = (m: number): string => `${Number.isInteger(m) ? m : m.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}×`;
export const signed = (n: number): string => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString()}`;

/** The three stake levels with the design's labels; a fourth level or more is unlabelled. */
export function stakeOptions(levels: number[], cfg?: Pick<MoonshotClientConfig, 'copy'> | null): Array<{ amount: number; label: string }> {
  const labels: CopyKey[] = ['stakeCautious', 'stakeBold', 'stakeAllIn'];
  return levels.map((amount, i) => ({ amount, label: i < labels.length && levels.length <= 3 ? copyText(cfg, labels[i]) : '' }));
}

/** "HIT +500 · MISS −100", always from the server's numbers. */
export const outcomeLine = (stake: number, potentialReward: number, cfg?: Pick<MoonshotClientConfig, 'copy'> | null): string =>
  `${copyText(cfg, 'hit')} ${signed(potentialReward)} · ${copyText(cfg, 'miss')} ${signed(-stake)}`;

export const currencyWord = (c: StakeCurrency): string => (c === 'POINTS' ? 'POINTS' : 'CASH');

/** A quote may be confirmed only while the server says it is fresh. */
export const quoteFresh = (quote: { expiresAt: number } | null | undefined, nowMs: number): boolean => !!quote && quote.expiresAt > nowMs;

/** Before lock a call can be changed or cancelled; the server is the judge, this only hides the controls. */
export const callOpen = (call: MoonshotCall, nowMs: number): boolean => call.status === 'CONFIRMED' && (call.lockAtMs == null || call.lockAtMs > nowMs);

export type LiveState = 'IN' | 'OUT' | 'CLOSE' | 'PENDING';

/** Race-day state from the driver's current position (SPEC §17): IN when the prediction currently holds, CLOSE one place outside it. */
export function liveState(call: Pick<MoonshotCall, 'predictionType' | 'predictionTarget'>, position: number | null | undefined): LiveState {
  if (position == null || position < 1) return 'PENDING';
  const limit = call.predictionType === 'WIN' ? 1 : call.predictionType === 'PODIUM' ? 3 : call.predictionType === 'TOP_5' ? 5 : call.predictionTarget ?? 0;
  if (call.predictionType === 'EXACT_FINISH') return position === limit ? 'IN' : Math.abs(position - limit) === 1 ? 'CLOSE' : 'OUT';
  if (position <= limit) return 'IN';
  return position === limit + 1 ? 'CLOSE' : 'OUT';
}

/** "HADJAR — PODIUM · 200 POINTS AT RISK · 5× · HIT +1,000 · MISS −200" */
export function callSummary(call: MoonshotCall, driverName: string, cfg?: Pick<MoonshotClientConfig, 'copy'> | null): string {
  return `${driverName.toUpperCase()} — ${predictionLabel(call.predictionType, call.predictionTarget)} · ${call.stakeAmount.toLocaleString()} ${currencyWord(call.stakeCurrency)} ${copyText(cfg, 'atRisk')} · ${multiplierLabel(call.multiplier)} · ${outcomeLine(call.stakeAmount, call.potentialReward, cfg)}`;
}

/** The settled line (SPEC §18): result, what was called, where the driver finished, the adjustment. */
export function settledLine(call: MoonshotCall, driverName: string, cfg?: Pick<MoonshotClientConfig, 'copy'> | null): string {
  const head = call.result === 'HIT' ? copyText(cfg, 'resultHit') : call.result === 'VOID' ? copyText(cfg, 'resultVoid') : copyText(cfg, 'resultMissed');
  const finish = call.officialDriverFinish ? `Finished P${call.officialDriverFinish}` : 'Not classified';
  const adj = call.result === 'VOID' || call.adjustmentAmount == null ? '' : ` · ${currencyWord(call.stakeCurrency)} ${signed(call.adjustmentAmount)}`;
  return `${head} · ${driverName.toUpperCase()} — ${predictionLabel(call.predictionType, call.predictionTarget)} · ${finish}${adj}`;
}

/** The standings column: "+500" / "−100", or nothing when a member never made a call. */
export const moonshotColumn = (points: number | null | undefined): string | null =>
  typeof points === 'number' && points !== 0 ? signed(points) : null;
