/**
 * Moonshot in the portal (F-109) — the pure parts, mirrored from the app's
 * src/simple/grid/moonshot.ts the way data/team.ts mirrors the app's rules (the portal is its own
 * package and imports nothing from the app). Every number shown comes from the server: the menu
 * prices the predictions, the quote prices the stake, the model document carries the distribution.
 */

export type PredictionType = 'WIN' | 'PODIUM' | 'TOP_5' | 'EXACT_FINISH';
export type StakeCurrency = 'POINTS' | 'CASH';
export type MoonshotStatus = 'CONFIRMED' | 'LOCKED' | 'LIVE' | 'HIT' | 'MISSED' | 'VOID' | 'SETTLED' | 'CANCELLED';

export interface MoonshotCall {
  id: string;
  teamId: string;
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

export interface BoardCall extends MoonshotCall { userId: string; displayName: string | null; teamName: string | null }

export interface MenuPrediction { type: PredictionType; probability: number; band: string; multiplier: number }

export interface MoonshotMenu {
  availability: 'off' | 'locked' | 'open';
  unlockRound: number;
  tokensPerTeam: number;
  tokensLeft: number;
  lockAtMs: number | null;
  round: number | null;
  current: MoonshotCall | null;
  ownsDriver: boolean;
  modelAvailable: boolean;
  driverInModel: boolean;
  carriedFrom: string | null;
  predictions: MenuPrediction[];
  exactFinishEnabled: boolean;
  positionsCount: number | null;
  maxMultiplier: number;
  stakes: Record<StakeCurrency, number[]>;
  balances: Record<StakeCurrency, number>;
  model: { expectedFinish: number; likelyLo: number; likelyHi: number; predicted: number } | null;
  copy: Record<string, string>;
}

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
}

/** `moonshotModels/{raceId}`: every driver's finishing-position distribution (index 0 = P1). */
export interface MoonshotModelDoc {
  raceId: string;
  round: number;
  source: string;
  modelVersion: string;
  positionsCount: number;
  drivers: Record<string, { predicted: number; sigma: number; positions: number[] }>;
}

/** The words the design keeps out of anything a player reads (SPEC §21, §34). */
export const FORBIDDEN_TERMS = ['bet', 'bets', 'betting', 'wager', 'wagers', 'wagering', 'odds', 'moneyline', 'parlay', 'parlays', 'sportsbook', 'gambling', 'gamble', 'bookmaker', 'bookmakers', 'bookie', 'payout', 'payouts', 'house'];

export function usesForbiddenTerm(text: string): string | null {
  const words = text.toLowerCase().split(/[^a-z]+/);
  return FORBIDDEN_TERMS.find((t) => words.includes(t)) ?? null;
}

// ── formatting (the portal writes in sentence case where the app shouts) ────

export const predictionLabel = (type: PredictionType, target?: number | null): string =>
  type === 'WIN' ? 'Win' : type === 'PODIUM' ? 'Podium' : type === 'TOP_5' ? 'Top 5' : target ? `Finish P${target}` : 'Exact finish';

export const predictionSentence = (type: PredictionType, driver: string, target?: number | null): string =>
  type === 'WIN' ? `${driver} wins the race` : type === 'PODIUM' ? `${driver} finishes on the podium` : type === 'TOP_5' ? `${driver} finishes in the top five` : `${driver} finishes exactly P${target ?? '?'}`;

export const chancePct = (p: number): string => `${Math.round(p * 100)}%`;
export const multiplierLabel = (m: number): string => `${Number.isInteger(m) ? m : m.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}×`;
export const signed = (n: number): string => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString()}`;
export const currencyWord = (c: StakeCurrency): string => (c === 'POINTS' ? 'points' : 'cash');

/** "Hit +500 · Miss −100", always from the server's numbers. */
export const outcomeLine = (stake: number, potentialReward: number): string => `Hit ${signed(potentialReward)} · Miss ${signed(-stake)}`;

/** The three stake levels with the design's labels; a fourth level or more is unlabelled. */
export function stakeOptions(levels: number[]): Array<{ amount: number; label: string }> {
  const labels = ['Cautious', 'Bold', 'All-in'];
  return levels.map((amount, i) => ({ amount, label: levels.length <= 3 && i < labels.length ? labels[i] : '' }));
}

export const quoteFresh = (quote: { expiresAt: number } | null | undefined, nowMs: number): boolean => !!quote && quote.expiresAt > nowMs;
export const sameTerms = (a: Pick<MoonshotQuote, 'multiplier' | 'potentialReward' | 'rewardBand'>, b: Pick<MoonshotQuote, 'multiplier' | 'potentialReward' | 'rewardBand'>): boolean =>
  a.multiplier === b.multiplier && a.potentialReward === b.potentialReward && a.rewardBand === b.rewardBand;

/** Before lock a call can be cancelled; the server is the judge, this only shows the control. */
export const callOpen = (call: MoonshotCall, nowMs: number): boolean => call.status === 'CONFIRMED' && (call.lockAtMs == null || call.lockAtMs > nowMs);

/** "Hadjar — Podium · 200 points at risk · 5× · Hit +1,000 · Miss −200" */
export const callSummary = (call: MoonshotCall, driverName: string): string =>
  `${driverName} — ${predictionLabel(call.predictionType, call.predictionTarget)} · ${call.stakeAmount.toLocaleString()} ${currencyWord(call.stakeCurrency)} at risk · ${multiplierLabel(call.multiplier)} · ${outcomeLine(call.stakeAmount, call.potentialReward)}`;

/** The settled line (SPEC §18). */
export function settledLine(call: MoonshotCall, driverName: string): string {
  const head = call.result === 'HIT' ? 'Moonshot hit' : call.result === 'VOID' ? 'Moonshot void · token returned' : 'Moonshot missed';
  const finish = call.officialDriverFinish ? `finished P${call.officialDriverFinish}` : 'not classified';
  const adj = call.result === 'VOID' || call.adjustmentAmount == null ? '' : ` · ${signed(call.adjustmentAmount)} ${currencyWord(call.stakeCurrency)}`;
  return `${head} · ${driverName} — ${predictionLabel(call.predictionType, call.predictionTarget)} · ${finish}${adj}`;
}

/** "Turn One called Hadjar Podium · 200 pts · 5×" (SPEC §16, the rivals frame). */
export const declarationLine = (call: BoardCall, driverName: string): string =>
  `${call.teamName ?? call.displayName ?? 'A rival'} called ${driverName} ${predictionLabel(call.predictionType, call.predictionTarget)} · ${call.stakeAmount.toLocaleString()} ${call.stakeCurrency === 'POINTS' ? 'pts' : 'cash'} · ${multiplierLabel(call.multiplier)}`;

/** The standings column: "+500" / "−100", or nothing when a member never made a call. */
export const moonshotColumn = (points: number | null | undefined): string | null =>
  typeof points === 'number' && points !== 0 ? signed(points) : null;

/** The distribution as chart bars: each position's share, scaled to the largest, with the predicted finish marked. */
export function distributionBars(d: { predicted: number; positions: number[] } | null | undefined): Array<{ position: number; share: number; height: number; predicted: boolean }> {
  if (!d || !Array.isArray(d.positions) || d.positions.length === 0) return [];
  const max = Math.max(...d.positions, 1e-9);
  const mark = Math.max(1, Math.min(d.positions.length, Math.round(d.predicted)));
  return d.positions.map((share, i) => ({ position: i + 1, share, height: Math.max(2, Math.round((share / max) * 100)), predicted: i + 1 === mark }));
}

/** How a prediction reads off the distribution, for the depth view: the positions it covers. */
export const coveredPositions = (type: PredictionType, target?: number | null): number[] =>
  type === 'WIN' ? [1] : type === 'PODIUM' ? [1, 2, 3] : type === 'TOP_5' ? [1, 2, 3, 4, 5] : target ? [target] : [];

/** Season Moonshot record lines for the Season page (SPEC §28/§30). */
export function statsLines(s: { used: number; hit: number; missed: number; voided: number; pointsRisked: number; pointsWon: number; cashRisked: number; cashWon: number; biggestHit: { adjustmentAmount: number; driverId: string; predictionType: string } | null } | null | undefined, driverName: (id: string) => string): Array<[string, string]> {
  if (!s || s.used === 0) return [];
  const hitRate = s.used ? Math.round((s.hit / s.used) * 100) : 0;
  const out: Array<[string, string]> = [
    ['Moonshots used', String(s.used)],
    ['Hit · missed', `${s.hit} · ${s.missed}${s.voided ? ` · ${s.voided} void` : ''}`],
    ['Hit rate', `${hitRate}%`],
    ['Points risked · won', `${s.pointsRisked.toLocaleString()} · ${s.pointsWon.toLocaleString()}`],
  ];
  if (s.cashRisked) out.push(['Cash risked · won', `$${s.cashRisked.toLocaleString()} · $${s.cashWon.toLocaleString()}`]);
  if (s.biggestHit) out.push(['Biggest hit', `${driverName(s.biggestHit.driverId)} ${predictionLabel(s.biggestHit.predictionType as PredictionType)} · ${signed(s.biggestHit.adjustmentAmount)}`]);
  return out;
}

/** A `moonshots` document (from Firestore or a callable) as the UI reads it. */
export function toCall(id: string, d: Record<string, unknown>): MoonshotCall {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const ms = (v: unknown): number | null => (typeof v === 'number' ? v : v && typeof (v as { toMillis?: unknown }).toMillis === 'function' ? (v as { toMillis: () => number }).toMillis() : v && typeof (v as { _seconds?: unknown })._seconds === 'number' ? (v as { _seconds: number })._seconds * 1000 : null);
  return {
    id, teamId: String(d.teamId ?? ''), raceId: String(d.raceId ?? ''), roundNumber: typeof d.roundNumber === 'number' ? d.roundNumber : null, driverId: String(d.driverId ?? ''),
    predictionType: d.predictionType as PredictionType, predictionTarget: typeof d.predictionTarget === 'number' ? d.predictionTarget : null,
    stakeCurrency: d.stakeCurrency === 'CASH' ? 'CASH' : 'POINTS', stakeAmount: num(d.stakeAmount), modelProbability: num(d.modelProbability), rewardBand: String(d.rewardBand ?? ''),
    multiplier: num(d.multiplier), potentialReward: num(d.potentialReward), ownsDriver: d.ownsDriver === true, status: (d.status as MoonshotStatus) ?? 'CONFIRMED',
    lockAtMs: ms(d.lockAtMs ?? d.lockAt), result: d.result === 'HIT' || d.result === 'MISSED' || d.result === 'VOID' ? d.result : null,
    officialDriverFinish: typeof d.officialDriverFinish === 'number' ? d.officialDriverFinish : null, adjustmentAmount: typeof d.adjustmentAmount === 'number' ? d.adjustmentAmount : null,
  };
}

/** The server's refusals are sentences for the player; transport trouble gets a plain one. */
export function moonshotErrorText(e: unknown): string {
  const err = e as { code?: string; message?: string } | undefined;
  const code = (err?.code ?? '').replace(/^functions\//, '');
  if (code === 'unavailable' || code === 'deadline-exceeded' || code === 'internal') return 'The server is not answering right now. Try again in a moment.';
  if (code === 'unauthenticated') return 'Sign in again to make a Moonshot.';
  return err?.message && !/^internal$/i.test(err.message) ? err.message : 'Something went wrong. Try again.';
}
