/**
 * Turning a published projection into the rows a driver sheet shows (F-084).
 *
 * The portal has a three-tab slide-over for this. The app has a bottom sheet that was already about
 * a driver, so this is what goes in it rather than a second navigation surface — the point is that
 * someone who paid sees the analysis where they already are, not that the app grows a copy of the
 * website.
 *
 * Pure, so the shaping is tested without a React Native runtime, and so the judgements below are in
 * one place rather than spread through a component:
 *
 * - A number the worker did not publish is absent, never zero. A driver with no retirement risk and
 *   a driver the model said nothing about are different things, and only one of them should show a
 *   figure.
 * - Percentages the model gives as whole numbers stay whole numbers. Rounding a 61% chance to "0.6"
 *   reads as a probability of something else entirely.
 * - Nothing here decides what a pass holder is allowed to see; the caller gates on the pass.
 */
import type { Projection, Split } from './projections';

export interface DetailStat {
  label: string;
  value: string;
  /** the quieter line under the value, when there is one worth saying */
  note?: string;
}

/** The spread the simulation actually produced, for a bar rather than a number. */
export interface DetailRange {
  floor: number;
  med: number;
  ceil: number;
  /** where the median sits across the bar, 0 to 1 */
  at: number;
}

export interface DetailFit {
  round: string;
  /** 1 to 5 */
  score: number;
}

export interface DriverDetail {
  range: DetailRange | null;
  /** headline figures: chances and risk */
  chances: DetailStat[];
  /** what the money buys, and what the price is about to do */
  money: DetailStat[];
  fit: DetailFit[];
  splits: Split[];
  /** where the season's points came from, largest first, as whole percentages */
  mix: { label: string; pct: number }[];
}

const pct = (n: number) => `${Math.round(n)}%`;
const pts = (n: number) => `${Math.round(n)}`;

/** A figure the worker published. Zero is a real answer for a count, but not for a probability. */
const given = (n: number) => Number.isFinite(n) && n > 0;

export function driverDetail(p: Projection | null | undefined, rounds: string[] = []): DriverDetail | null {
  if (!p) return null;

  // The bar needs a spread to be a bar. Without floor and ceiling there is only a number, and a
  // range drawn from a median alone would be invented.
  const range: DetailRange | null =
    given(p.ceil) && p.ceil > p.floor
      ? { floor: p.floor, med: p.med, ceil: p.ceil, at: Math.min(1, Math.max(0, (p.med - p.floor) / (p.ceil - p.floor))) }
      : null;

  const chances: DetailStat[] = [];
  if (given(p.win)) chances.push({ label: 'WIN', value: pct(p.win) });
  if (given(p.pod)) chances.push({ label: 'PODIUM', value: pct(p.pod) });
  if (given(p.t10)) chances.push({ label: 'TOP TEN', value: pct(p.t10) });
  if (given(p.dnf)) chances.push({ label: 'RETIREMENT', value: pct(p.dnf) });

  const money: DetailStat[] = [];
  if (given(p.val)) money.push({ label: 'PER $100', value: pts(p.val), note: 'PROJECTED POINTS' });
  if (given(p.ptsRise)) {
    money.push({
      label: 'TO RISE',
      value: `${pts(p.ptsRise)} PTS`,
      // The chance is what makes the threshold mean anything: 46 points to rise is a different
      // proposition at 61% than at 9%.
      note: given(p.pRise) ? `${pct(p.pRise)} CHANCE` : undefined,
    });
  }
  if (p.dprice !== 0 && Number.isFinite(p.dprice)) {
    money.push({ label: 'NEXT PRICE', value: `${p.dprice > 0 ? '▲' : '▼'} $${Math.abs(p.dprice).toFixed(1)}`, note: 'PREDICTED' });
  }
  if (given(p.own)) money.push({ label: 'OWNED BY', value: pct(p.own), note: 'OF LEAGUES' });

  const fit: DetailFit[] = p.fit
    .map((score, i) => ({ round: rounds[i] ?? '', score }))
    .filter((f) => f.round && f.score > 0);

  const mixTotal = p.mix ? p.mix.race + p.mix.quali + p.mix.sprint + p.mix.fl : 0;
  const mix = p.mix && mixTotal > 0
    ? ([
        { label: 'RACE', pct: (p.mix.race / mixTotal) * 100 },
        { label: 'QUALI', pct: (p.mix.quali / mixTotal) * 100 },
        { label: 'SPRINT', pct: (p.mix.sprint / mixTotal) * 100 },
        { label: 'FASTEST LAP', pct: (p.mix.fl / mixTotal) * 100 },
      ]
        .filter((m) => m.pct > 0)
        .map((m) => ({ ...m, pct: Math.round(m.pct) }))
        .sort((a, b) => b.pct - a.pct))
    : [];

  return { range, chances, money, fit, splits: p.splits, mix };
}

/** Whether there is enough here to be worth a section at all. */
export const hasDetail = (d: DriverDetail | null): boolean =>
  !!d && (!!d.range || d.chances.length > 0 || d.money.length > 0 || d.fit.length > 0 || d.splits.length > 0 || d.mix.length > 0);
