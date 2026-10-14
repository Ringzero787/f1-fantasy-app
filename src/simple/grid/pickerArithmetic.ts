/**
 * Picker arithmetic (F-122): value, leftover budget, pairing hints. Pure. Never writes a roster.
 *
 * The R16 audit found 37 of 40 teams on cheapest-first auto-fill. Two moments cause it: a new
 * player facing twenty drivers and one budget, and a returning player with empty seats after a
 * sale. Both are division the app was making the person do in their head.
 *
 * Hints sit on rows the picker already allows. They never reorder the list and they never move
 * a pick — tapping the row is still the only way a seat fills.
 */
export function valueOf(pts: number, price: number): number | null {
  if (!(price > 0) || !Number.isFinite(pts)) return null;
  return pts / price;
}

export function formatValue(v: number | null): string {
  if (v == null) return '–';
  return v.toFixed(2);
}

export function leftoverCopy(budgetAfter: number, missingSlots: number): string | null {
  if (missingSlots <= 0) return null;
  const slots = missingSlots === 1 ? '1 SLOT' : `${missingSlots} SLOTS`;
  return `LEAVES $${Math.round(budgetAfter)} FOR ${slots}`;
}

/** Sum of the cheapest `slots` prices. Null when there are not enough entries. */
export function cheapestCompletion(prices: number[], slots: number): number | null {
  if (slots <= 0) return 0;
  if (prices.length < slots) return null;
  const sorted = [...prices].sort((a, b) => a - b);
  return sorted.slice(0, slots).reduce((s, p) => s + p, 0);
}

export function leftoverLine(budgetAfter: number, missingSlots: number, cheapestFill: number | null): string | null {
  const left = leftoverCopy(budgetAfter, missingSlots);
  if (!left) return null;
  if (cheapestFill == null) return left;
  return `${left} · CHEAPEST FILL $${Math.round(cheapestFill)}`;
}

export function leftoverTight(budgetAfter: number, cheapestFill: number | null): boolean {
  return cheapestFill != null && cheapestFill > budgetAfter;
}

export type HintKind = 'leaves' | 'teammate' | 'cheap_scores';
export interface RowHint {
  id: string;
  kind: HintKind;
  label: string;
}

export interface HintRow {
  id: string;
  constructorId: string;
  pts: number;
  price: number;
  selected: boolean;
  blocked: boolean;
}

/**
 * At most three badges, only after the first pick, only on unselected unblocked rows, gone
 * once the list is full. Order is stable (teammate, leftover, cheap+scores) so a sort change
 * does not shuffle which rows carry a reason.
 */
export function pairingHints(rows: HintRow[], budgetAfter: number, missingSlots: number): RowHint[] {
  if (missingSlots <= 0) return [];
  const selected = rows.filter((r) => r.selected);
  if (selected.length === 0) return [];
  const open = rows.filter((r) => !r.selected && !r.blocked);
  if (open.length === 0) return [];

  const out: RowHint[] = [];
  const taken = new Set<string>();
  const push = (h: RowHint | null) => {
    if (!h || taken.has(h.id)) return;
    taken.add(h.id);
    out.push(h);
  };

  const selectedCars = new Set(selected.map((r) => r.constructorId));
  const teammate = open.find((r) => selectedCars.has(r.constructorId));
  if (teammate) push({ id: teammate.id, kind: 'teammate', label: 'TEAMMATE — SAME CAR' });

  const restAfter = missingSlots - 1;
  const stillFits = open.filter((r) => {
    const others = open.filter((x) => x.id !== r.id).map((x) => x.price);
    const fill = cheapestCompletion(others, restAfter);
    if (fill == null) return restAfter === 0 && r.price <= budgetAfter;
    return r.price + fill <= budgetAfter;
  });
  const leftoverPick = stillFits.slice().sort((a, b) => b.price - a.price)[0];
  if (leftoverPick) {
    const left = Math.round(budgetAfter - leftoverPick.price);
    const slots = restAfter <= 0 ? null : leftoverCopy(left, restAfter);
    push({
      id: leftoverPick.id,
      kind: 'leaves',
      label: slots ?? `LEAVES $${left}`,
    });
  }

  const byPrice = open.slice().sort((a, b) => a.price - b.price);
  const cheapBand = byPrice.slice(0, Math.max(1, Math.ceil(byPrice.length / 3)));
  const scored = cheapBand
    .map((r) => ({ r, v: valueOf(r.pts, r.price) }))
    .filter((x): x is { r: HintRow; v: number } => x.v != null)
    .sort((a, b) => b.v - a.v)[0];
  if (scored) push({ id: scored.r.id, kind: 'cheap_scores', label: 'CHEAP + SCORES' });

  return out.slice(0, 3);
}
