/**
 * What Pit Wall would pick, for the in-app picker (F-077).
 *
 * The picker already decides what a team may take: `blocked` carries the budget, the squad size,
 * the lockouts and the lock. This only ranks what is left, so a recommendation can never suggest a
 * move the team cannot make.
 *
 * Pure, and deliberately small: the portal does the reasoning, the app marks one row.
 */
import type { Projection } from './projections';

export interface Candidate {
  id: string;
  price: number;
  /** already in the pending lineup */
  selected: boolean;
  /** the picker will not accept this row */
  blocked: boolean;
}

export interface Pick {
  id: string;
  /** projected points for the coming round */
  med: number;
  /** points per $100, to a single decimal */
  value: number;
}

/** Points per $100 of price, the same measure the portal's value column uses. */
export const valueOf = (med: number, price: number): number => (price > 0 ? Math.round((med / price) * 1000) / 10 : 0);

interface Ranked extends Pick { price: number }

function rank(candidates: Candidate[], byId: Record<string, Projection>): Ranked[] {
  const out: Ranked[] = [];
  for (const c of candidates) {
    if (c.selected || c.blocked) continue;
    const p = byId[c.id];
    if (!p || p.med <= 0) continue;
    out.push({ id: c.id, med: p.med, value: valueOf(p.med, c.price), price: c.price });
  }
  return out;
}

/**
 * The highest projection the team can actually take. Ties go to the cheaper option, then to the id,
 * so the mark does not move between renders.
 */
export function bestPick(candidates: Candidate[], byId: Record<string, Projection>): Pick | null {
  const ranked = rank(candidates, byId);
  if (ranked.length === 0) return null;
  ranked.sort((a, b) => b.med - a.med || a.price - b.price || a.id.localeCompare(b.id));
  const { id, med, value } = ranked[0];
  return { id, med, value };
}

/**
 * The best points per $100 available, when that is a different row from the best projection.
 * Returns null when the two agree, so the picker never shows two marks on one row or a second
 * mark that adds nothing.
 */
export function bestValuePick(candidates: Candidate[], byId: Record<string, Projection>): Pick | null {
  const ranked = rank(candidates, byId);
  if (ranked.length === 0) return null;
  const best = bestPick(candidates, byId);
  ranked.sort((a, b) => b.value - a.value || a.price - b.price || a.id.localeCompare(b.id));
  const { id, med, value } = ranked[0];
  return best && best.id === id ? null : { id, med, value };
}

/**
 * The mark per row id: at most one row carries `pick` and at most one other carries `value`.
 * Kept here rather than in the screen so the rule is testable and the picker stays a view.
 */
export function marksFor(candidates: Candidate[], byId: Record<string, Projection>): Record<string, 'pick' | 'value'> {
  const out: Record<string, 'pick' | 'value'> = {};
  const pick = bestPick(candidates, byId);
  if (pick) out[pick.id] = 'pick';
  const value = bestValuePick(candidates, byId);
  if (value && !out[value.id]) out[value.id] = 'value';
  return out;
}
