/**
 * Hindsight (F-073): what the lineup actually scored each round against the best lineup that the
 * same money could have bought. Both halves are the app's own records — the roster snapshot
 * scoring wrote for the weekend (F-029), everyone's points for that race, and the prices that
 * weekend — so this is a fact about the past, not a projection.
 *
 * "Best possible" is bounded by what the reader had on the table: the best five drivers and one
 * constructor whose weekend prices sum to no more than the snapshot roster's, with the ace on the
 * best-scoring pick under the ace cap. An unbounded best would be a lineup nobody could afford.
 *
 * Pure. 22 drivers choose 5 is 26k combinations, times eleven constructors: fine in a browser.
 */
import { ACE_MAX_PRICE } from './team';

export interface SnapshotRoster { drivers: Array<{ driverId: string; currentPrice: number }>; constructor: { constructorId: string; currentPrice: number } | null; aceDriverId: string | null }
export interface Snapshot { raceId: string; round: number; roster: SnapshotRoster; /** points per phase as scored, summed by the caller */ points: number }
export interface Scored { id: string; ctor: boolean; points: number; price: number }
export interface Best { points: number; drivers: string[]; ctor: string; ace: string | null }
export interface HindsightRow { raceId: string; round: number; actual: number; best: number; /** 0..100 */ share: number; bestLineup: Best; spend: number }

/** the app's ace cap, one constant */
export const ACE_CAP = ACE_MAX_PRICE;
const SLOTS = 5;

/** The best lineup the spend could buy for that weekend, with hindsight. */
export function bestLineup(scored: Scored[], spend: number, aceCap = ACE_CAP): Best | null {
  const drivers = scored.filter((x) => !x.ctor).sort((a, b) => b.points - a.points);
  const ctors = scored.filter((x) => x.ctor);
  if (drivers.length < SLOTS || ctors.length === 0) return null;
  let best: Best | null = null;
  const pick: Scored[] = [];
  const consider = (points: number, price: number) => {
    for (const c of ctors) {
      if (price + c.price > spend) continue;
      const total = points + c.points;
      if (!best || total > best.points) {
        const ace = pick.filter((d) => d.price <= aceCap).sort((a, b) => b.points - a.points)[0] ?? null;
        best = { points: total + (ace ? ace.points : 0), drivers: pick.map((d) => d.id), ctor: c.id, ace: ace ? ace.id : null };
      }
    }
  };
  // depth-first over combinations, pruning on price
  const walk = (from: number, points: number, price: number) => {
    if (pick.length === SLOTS) { consider(points, price); return; }
    for (let i = from; i < drivers.length; i += 1) {
      const d = drivers[i];
      if (price + d.price > spend) continue;
      pick.push(d); walk(i + 1, points + d.points, price + d.price); pick.pop();
    }
  };
  walk(0, 0, 0);
  // the ace bonus was added after the comparison, so one more pass picks the true best among the near-best
  return best ? refine(scored, spend, aceCap, best) : null;
}

/** Second pass: with the ace counted, the best lineup can differ from the best without it. */
function refine(scored: Scored[], spend: number, aceCap: number, seed: Best): Best {
  const drivers = scored.filter((x) => !x.ctor);
  const ctors = scored.filter((x) => x.ctor);
  let best = seed;
  const pick: Scored[] = [];
  const walk = (from: number, points: number, price: number) => {
    if (pick.length === SLOTS) {
      const ace = pick.filter((d) => d.price <= aceCap).sort((a, b) => b.points - a.points)[0] ?? null;
      const withAce = points + (ace ? ace.points : 0);
      for (const c of ctors) {
        if (price + c.price > spend) continue;
        if (withAce + c.points > best.points) best = { points: withAce + c.points, drivers: pick.map((d) => d.id), ctor: c.id, ace: ace ? ace.id : null };
      }
      return;
    }
    for (let i = from; i < drivers.length; i += 1) {
      const d = drivers[i];
      if (price + d.price > spend) continue;
      pick.push(d); walk(i + 1, points + d.points, price + d.price); pick.pop();
    }
  };
  walk(0, 0, 0);
  return best;
}

/** One round of hindsight from the snapshot, that race's scores and that weekend's prices. */
export function hindsightRow(s: Snapshot, scores: Array<{ id: string; ctor: boolean; points: number }>, priceOf: (id: string) => number | undefined): HindsightRow | null {
  const spend = s.roster.drivers.reduce((a, d) => a + d.currentPrice, 0) + (s.roster.constructor?.currentPrice ?? 0);
  const scored: Scored[] = scores.map((x) => ({ ...x, price: priceOf(x.id) ?? Number.POSITIVE_INFINITY })).filter((x) => Number.isFinite(x.price));
  const best = bestLineup(scored, spend);
  if (!best || best.points <= 0) return null;
  const share = Math.max(0, Math.min(100, Math.round((s.points / best.points) * 100)));
  return { raceId: s.raceId, round: s.round, actual: s.points, best: best.points, share, bestLineup: best, spend };
}
