/**
 * How much to trust a projection (F-096).
 *
 * Every recommendation in this portal used to treat a projected point as a projected point. It is
 * not. A driver fighting for P4 and a driver in the midfield can carry the same median and nothing
 * like the same chance of delivering it, and ranking on the median alone is how the Briefing came to
 * offer a swap that cost its reader 34 points of weekend potential.
 *
 * The shape is borrowed from the Track Limits GP model, which splits the grid into variance zones
 * and prices the midfield as a coin flip: "16 drivers fight for 14 finishing positions and chaos
 * dominates pace differences". Its σ values are **not** borrowed — they come from that model's own
 * 2025 backtest on a different system, and importing a number someone else calibrated would be a
 * confidence we have not earned. The weight here is derived from the band this payload already
 * publishes, so it says only what our own data supports.
 */
import type { Driver, Entity } from './types';
import { isCtor } from './types';

export type Zone = 'front' | 'midfield' | 'back';

export interface Confidence {
  zone: Zone;
  /** How the *grid zone* reads to a person. Cosmetic: it never enters the weight. */
  label: string;
  /**
   * How the *range* reads — derived from the band relative to the median, which is the number that
   * actually drives the weight. Kept apart from `label` because they answer different questions and
   * conflating them produced "their range is tight (27 points between floor and ceiling)".
   */
  rangeLabel: string;
  /** The published band in points, `ceil - floor`. */
  spread: number;
  /**
   * What one projected point here is worth beside a point from a tight projection, 0..1. A band as
   * wide as the projection itself halves it; a band of nothing leaves it whole.
   */
  weight: number;
}

/** Above this chance of a top-ten finish, a driver is at the sharp end and predictable. */
export const FRONT_T10 = 75;
/** Below it, they are out of the points often enough that the result is compressed again. */
export const BACK_T10 = 25;

export function zoneOf(t10: number): Zone {
  if (t10 >= FRONT_T10) return 'front';
  if (t10 <= BACK_T10) return 'back';
  return 'midfield';
}

const LABEL: Record<Zone, string> = {
  front: 'tight',
  midfield: 'wide',
  back: 'compressed',
};

/**
 * The band in words, on the same scale the weight uses. A band under a third of the median barely
 * moves the weight; one as wide as the median halves it.
 */
export function rangeLabelOf(spread: number, med: number): string {
  if (med <= 0) return 'unpublished';
  const ratio = spread / med;
  if (ratio <= 0.35) return 'narrow';
  if (ratio <= 0.8) return 'moderate';
  return 'wide';
}

export function confidenceOf(e: Entity): Confidence {
  const d = e as Driver;
  const spread = Math.max(0, (d.ceil ?? 0) - (d.floor ?? 0));
  const med = d.med > 0 ? d.med : 0;
  // 1 / (1 + spread/med): dimensionless, monotone, and it never reaches zero — a wide projection is
  // worth less, not nothing. A constructor has no top-ten chance, so it is read as front: its score
  // is the sum of two drivers and moves less than either.
  const weight = med > 0 ? 1 / (1 + spread / med) : 0;
  const zone = isCtor(e) ? 'front' : zoneOf(d.t10 ?? 0);
  return { zone, label: LABEL[zone], rangeLabel: rangeLabelOf(spread, med), spread, weight: +weight.toFixed(3) };
}

/**
 * A projected gain, discounted by how reliably the incoming pick delivers it. This is what
 * recommendations rank on: the raw delta is what the reader is shown, the edge is what decides
 * which of three swaps is offered first.
 */
export function edgeOf(gain: number, incoming: Entity): number {
  return +(gain * confidenceOf(incoming).weight).toFixed(2);
}
