/**
 * Per-user views, computed in the browser from a page payload and the user's lineup
 * (ARCHITECTURE section 5). Ported from the approved prototype: recs, briefRecs, cmp,
 * rivalMove and the Lineup Lab swap pool. Pure, so every rule is unit-tested.
 */
import { isCtor, type Constructor, type Driver, type Entity, type Lineup, type Payload, type Rival } from './types';
import { coverage } from './coverage';

export const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

export function entity(p: Payload, id: string): Entity | undefined {
  return p.drivers.find((d) => d.id === id) ?? p.constructors.find((c) => c.id === id);
}
const must = (p: Payload, id: string): Entity => {
  const e = entity(p, id);
  if (!e) throw new Error(`unknown entity ${id}`);
  return e;
};

/**
 * What a lineup projects, and how much of it is actually known.
 *
 * Two things make a member unknown, and neither may be treated as a zero. A real team can hold
 * someone the payload leaves out — a driver dropped from the active grid, say — and the free look
 * publishes a median of zero for everyone outside the top ten. Adding those up as zeros produces a
 * total that is simply wrong, which is worse than showing nothing, so the count comes back with
 * the points and the caller shows a dash when anything is missing.
 */
export interface LineupProjection { points: number; missing: number; complete: boolean }

export function projectedLineup(p: Payload, l: Lineup): LineupProjection {
  let points = 0, missing = 0;
  for (const id of l.drivers) {
    const e = entity(p, id);
    if (!e || e.med <= 0) { missing += 1; continue; }
    points += e.med * (id === l.ace ? 2 : 1);
  }
  const c = entity(p, l.ctor);
  if (!c || c.med <= 0) missing += 1;
  else points += c.med;
  return { points, missing, complete: missing === 0 };
}

export const projected = (p: Payload, l: Lineup): number => projectedLineup(p, l).points;

/** Prices are published for everyone, but an entity the payload omits still counts as nothing. */
export function spent(p: Payload, l: Lineup): number {
  return l.drivers.reduce((s, id) => s + (entity(p, id)?.price ?? 0), 0) + (entity(p, l.ctor)?.price ?? 0);
}
/**
 * Display names for the real team, whose documents hold full names ("Pierre Gasly", "Aston Martin
 * Aramco Formula One Team"). The payload already carries short ones; these apply the same rules to
 * the team document so a tile sized for a surname is not handed a full name.
 */
/** The surname as shown; a generational suffix is not a name ("Carlos Sainz Jr." is Sainz). */
export const shortName = (name: string): string => {
  const words = name.trim().split(/\s+/).filter((w) => !/^(jr|sr|ii|iii|iv)\.?$/i.test(w));
  return words[words.length - 1] ?? name;
};

/**
 * Short constructor names, by id, matching `src/simple/grid/entityNames.ts` in the app so a team
 * reads the same in both. The sponsor-stripping fallback below is only for an id we do not know:
 * it cannot be trusted on its own, because "Racing Bulls" comes out of it as "Bulls".
 */
const TEAM_NAMES: Record<string, string> = {
  mclaren: 'McLaren', ferrari: 'Ferrari', mercedes: 'Mercedes', red_bull: 'Red Bull',
  williams: 'Williams', haas: 'Haas', aston_martin: 'Aston Martin', alpine: 'Alpine',
  rb: 'RB', racing_bulls: 'RB', audi: 'Audi', cadillac: 'Cadillac',
};

export function shortTeamName(name: string, id?: string): string {
  if (id && TEAM_NAMES[id]) return TEAM_NAMES[id];
  const stripped = name.replace(/\b(F1|Formula\s*(?:1|One)|Team|Scuderia|Petronas|Oracle|Aramco|MoneyGram|BWT|AMG|Motorsport)\b/gi, ' ').replace(/[-]/g, ' ').replace(/\s+/g, ' ').trim();
  // "Racing" only ever goes from the end: "Oracle Red Bull Racing" is Red Bull, and "Racing Bulls"
  // is not "Bulls".
  const words = stripped.replace(/\s+Racing$/i, '').trim();
  return words || name;
}

export const bank = (p: Payload, l: Lineup): number => p.budget - spent(p, l);
export const rateMyTeam = (p: Payload, l: Lineup): number => Math.min(99, Math.round(projected(p, l) / 3.6));
export const sameLineup = (a: Lineup, b: Lineup): boolean => a.ctor === b.ctor && a.ace === b.ace && a.drivers.join('|') === b.drivers.join('|');

export interface SwapRec { out: string; in: string; gain: number; cost: number }

/** The three best affordable driver swaps; an Ace slot counts double. */
export function swapRecs(p: Payload, l: Lineup): SwapRec[] {
  const room = bank(p, l);
  const out: SwapRec[] = [];
  for (const o of l.drivers) {
    const od = entity(p, o);
    if (!od) continue;
    for (const n of p.drivers) {
      if (l.drivers.includes(n.id) || n.price - od.price > room) continue;
      const gain = (n.med - od.med) * (o === l.ace ? 2 : 1);
      if (gain > 2) out.push({ out: o, in: n.id, gain, cost: n.price - od.price });
    }
  }
  return out.sort((a, b) => b.gain - a.gain).slice(0, 3);
}

export type RecKind = 'SWAP' | 'ACE' | 'HOLD' | 'RISK' | 'TEAM' | 'TOP PICK' | 'BEST ALTERNATIVE';
export interface Rec {
  kind: RecKind; a: string; b: string; title: string; tag: string; why: string;
  good?: boolean; bad?: boolean;
  /** "OUT:IN" or "CTOR:IN": carry this swap into the Lineup Lab */
  act?: string;
  /** set the Ace on this driver */
  ace?: string;
}

function nearest(p: Payload, l: Lineup, d: Driver, keep: (x: Driver) => boolean = () => true): Driver | undefined {
  return p.drivers.filter((x) => !l.drivers.includes(x.id) && keep(x)).sort((a, b) => Math.abs(a.price - d.price) - Math.abs(b.price - d.price))[0];
}

/** The Briefing's recommendation list: swaps first, then Ace, best-value hold, biggest risk, constructor. */
export function briefRecs(p: Payload, l: Lineup): Rec[] {
  const out: Rec[] = [];
  // A real team can hold someone the payload leaves out, and there is nothing to say about them.
  // Recommending around the rest is still useful, so they are skipped rather than thrown on.
  const mine = l.drivers.map((id) => entity(p, id)).filter((e): e is Driver => !!e && !isCtor(e));
  const room = bank(p, l);
  for (const x of swapRecs(p, l)) {
    const n = must(p, x.in), o = must(p, x.out);
    out.push({ kind: 'SWAP', a: x.out, b: x.in, title: `${o.name} → ${n.name}`, tag: `+${x.gain.toFixed(0)} PTS`, good: true, act: `${x.out}:${x.in}`,
      why: `${n.name} projects ${n.med - o.med} points higher for ${x.cost >= 0 ? `${money(x.cost)} more` : `${money(-x.cost)} less`}, inside your ${money(room)} bank.` });
  }
  const best = [...mine].sort((a, b) => b.med - a.med);
  const ace = entity(p, l.ace) ?? null;
  if (ace && best.length > 0 && best[0].id !== ace.id) {
    out.push({ kind: 'ACE', a: ace.id, b: best[0].id, title: `Move ace to ${best[0].name}`, tag: `+${best[0].med - ace.med} PTS`, good: true, ace: best[0].id,
      why: `The ace doubles points. ${best[0].name} has the highest projection in your lineup.` });
  } else if (ace && best.length > 1) {
    out.push({ kind: 'ACE', a: ace.id, b: best[1].id, title: `Keep ace on ${ace.name}`, tag: 'HOLD',
      why: `${ace.name} out-projects your next best driver by ${ace.med - best[1].med} points, doubled.` });
  }
  const v = [...mine].sort((a, b) => b.val - a.val)[0];
  const va = v && nearest(p, l, v);
  if (v && va) out.push({ kind: 'HOLD', a: v.id, b: va.id, title: `Hold ${v.name}`, tag: 'HOLD',
    why: `Best value in your lineup. The closest alternative at this price (${va.name}) returns ${va.val} points per $100 against ${v.val}.` });
  const r = [...mine].sort((a, b) => b.dnf - a.dnf)[0];
  const ra = r && (nearest(p, l, r, (x) => x.dnf < r.dnf && x.price - r.price <= room) ?? nearest(p, l, r));
  if (r && ra) out.push({ kind: 'RISK', a: r.id, b: ra.id, title: `Watch ${r.name}`, tag: `${r.dnf}% DNF`, bad: true, act: `${r.id}:${ra.id}`,
    why: `Highest retirement risk in your lineup. ${ra.name} is the nearest-priced option with a safer floor.` });
  const c = entity(p, l.ctor) as Constructor | undefined;
  if (!c) return out;
  const cb = p.constructors.filter((x) => x.id !== c.id && x.price - c.price <= room).sort((a, b) => b.med - a.med)[0];
  if (cb && cb.med > c.med) out.push({ kind: 'TEAM', a: c.id, b: cb.id, title: `${c.name} → ${cb.name}`, tag: `+${cb.med - c.med} PTS`, good: true, act: `CTOR:${cb.id}`, why: `${cb.name} projects higher and fits your bank.` });
  else if (cb) out.push({ kind: 'TEAM', a: c.id, b: cb.id, title: `Keep ${c.name}`, tag: 'HOLD', why: `No affordable constructor projects above ${c.name} (${c.med}). Best alternative: ${cb.name} at ${cb.med}.` });
  return out;
}

export interface CmpRow { label: string; a: string; b: string; winner: 'a' | 'b' | null }

/** Side-by-side rows; the better value per row is marked. dir 1 = higher is better, -1 = lower, 0 = neutral. */
export function compareRows(p: Payload, aId: string, bId: string): CmpRow[] {
  const a = must(p, aId), b = must(p, bId);
  const metric: Array<[string, (e: Entity) => number | null, 1 | -1 | 0, boolean?]> = [
    ['Projection', (e) => e.med, 1], ['Floor', (e) => e.floor, 1], ['Ceiling', (e) => e.ceil, 1], ['Pts per $100', (e) => e.val, 1],
    ['Next price', (e) => (isCtor(e) ? null : e.dprice), 1],
    ['DNF risk %', (e) => (isCtor(e) ? null : e.dnf), -1], ['Price', (e) => e.price, -1, true],
  ];
  // A row nobody has published would compare two identical placeholders and mark neither, which
  // reads as "too close to call" rather than "not measured". Leave it out instead.
  const has = coverage(p);
  if (has.fit) metric.splice(4, 0, [`${p.round.name} fit /5`, (e) => (isCtor(e) ? null : e.fit[0] ?? null), 1]);
  if (has.ownership) metric.push(['League owned %', (e) => (isCtor(e) ? null : e.own), 0]);
  const rows: CmpRow[] = [];
  for (const [label, get, dir, isMoney] of metric) {
    const va = get(a), vb = get(b);
    if (va === null && vb === null) continue;
    const show = (v: number | null) => (v === null ? '—' : isMoney ? money(v) : String(v));
    const winner = dir !== 0 && va !== null && vb !== null && va !== vb ? ((va - vb) * dir > 0 ? 'a' : 'b') : null;
    rows.push({ label, a: show(va), b: show(vb), winner });
  }
  return rows;
}

export interface RivalMove { name: string; rank: number; gap: number; bank: number; activity: number; out: Driver; in: Driver; gain: number; likely: number; tag: 'COPIES YOU' | 'THREAT' | 'LOW RISK' }

/** Best affordable swap per rival; likelihood scales with how often that manager edits their lineup. */
export function rivalMove(p: Payload, mine: Lineup, r: Rival): RivalMove | null {
  let best: { out: Driver; in: Driver; gain: number } | null = null;
  for (const o of r.lineup) {
    const od = entity(p, o) as Driver | undefined;
    if (!od) continue;
    for (const n of p.drivers) {
      if (r.lineup.includes(n.id) || n.price - od.price > r.bank) continue;
      const gain = n.med - od.med;
      if (!best || gain > best.gain) best = { out: od, in: n, gain };
    }
  }
  if (!best) return null;
  const likely = Math.round(r.activity * Math.min(1, Math.max(0, best.gain) / 8) * 100);
  return { name: r.name, rank: r.rank, gap: r.gap, bank: r.bank, activity: r.activity, ...best, likely,
    tag: mine.drivers.includes(best.in.id) ? 'COPIES YOU' : likely >= 40 ? 'THREAT' : 'LOW RISK' };
}

export interface PoolOption { e: Entity; gain: number }

/** Lineup Lab: every affordable replacement for one slot ("CTOR" or a driver id), best first. */
export function swapPool(p: Payload, l: Lineup, slot: string, limit = 8): PoolOption[] {
  const isC = slot === 'CTOR';
  const cur = entity(p, isC ? l.ctor : slot);
  if (!cur) return [];
  const room = bank(p, l);
  const list: Entity[] = isC ? p.constructors : p.drivers;
  return list
    .filter((x) => x.id !== cur.id && !l.drivers.includes(x.id) && x.price - cur.price <= room)
    .map((x) => ({ e: x, gain: (x.med - cur.med) * (slot === l.ace ? 2 : 1) }))
    .sort((a, b) => b.gain - a.gain)
    .slice(0, limit);
}

/** Apply "OUT:IN" or "CTOR:IN"; the Ace follows a swapped driver. */
export function applySwap(l: Lineup, act: string): Lineup {
  const [o, n] = act.split(':');
  if (!o || !n) return l;
  if (o === 'CTOR') return { ...l, ctor: n };
  return { drivers: l.drivers.map((x) => (x === o ? n : x)), ctor: l.ctor, ace: l.ace === o ? n : l.ace };
}

/** The Lineup Lab's "top pick" card for a slot, as a recommendation. */
export function topPickRec(p: Payload, l: Lineup, slot: string): Rec | null {
  const top = swapPool(p, l, slot)[0];
  if (!top) return null;
  const cur = entity(p, slot === 'CTOR' ? l.ctor : slot);
  if (!cur) return null;
  const room = bank(p, l);
  const dearer = top.e.price >= cur.price;
  return top.gain > 0
    ? { kind: 'TOP PICK', a: cur.id, b: top.e.id, title: `${cur.name} → ${top.e.name}`, tag: `+${top.gain.toFixed(0)} PTS`, good: true, act: `${slot}:${top.e.id}`,
        why: `${top.e.name} is the top pick to replace ${cur.name}: ${top.gain.toFixed(0)} more projected points${slot === l.ace ? ' (ace doubled)' : ''} for ${dearer ? `${money(top.e.price - cur.price)} more` : `${money(cur.price - top.e.price)} less`}, leaving ${money(room - (top.e.price - cur.price))} in the bank.` }
    : { kind: 'BEST ALTERNATIVE', a: cur.id, b: top.e.id, title: `Keep ${cur.name}`, tag: 'HOLD',
        why: `Nothing affordable projects above ${cur.name}. ${top.e.name} is the closest, ${Math.abs(top.gain).toFixed(0)} points lower.` };
}
