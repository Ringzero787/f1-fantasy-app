import { describe, expect, it } from 'vitest';
import { OPEN_SEAT, applySwap, bank, percentileOf, purseOf, briefRecs, compareRows, projected, projectedLineup, rateMyTeam, rivalMove, sameLineup, shortName, shortTeamName, spent, swapPool, swapRecs, topPickRec } from './logic';
import type { Constructor, Driver, Lineup, Payload } from './types';

const D = (id: string, price: number, med: number, extra: Partial<Driver> = {}): Driver => ({ id, num: 1, name: id.toUpperCase(), team: 'T', price, med, floor: med - 5, ceil: med + 5, form: [], dnf: 5, own: 10, pm: 0, cons: 50, dprice: 0, fit: [3], win: 0, pod: 0, t10: 0, ptsRise: Math.ceil(price * 0.011), ptsHold: Math.ceil(price * 0.006), pRise: 50, pFall: 50, q: 0, r: 0, val: +((med / price) * 100).toFixed(1), splits: [], mix: { quali: 0, race: 0, sprint: 0, fl: 0 }, ...extra });
const C = (id: string, price: number, med: number): Constructor => ({ id, name: id.toUpperCase(), team: id, price, med, floor: med, ceil: med, val: 1, ctor: true });
const payload = (drivers: Driver[], ctors: Constructor[], budget: number): Payload => ({ example: true, asOf: '', round: { number: 1, name: 'Harbour', firstSession: '', locksIn: '', circuit: '' }, rounds: [], budget, teams: { T: { id: 'T', name: 'T', color: '#fff' } }, drivers, constructors: ctors, news: [], rivals: [], league: { name: 'L', size: 2, myRank: 1 }, weather: [], weatherSource: null, weatherMap: null, circuit: null, pace: [], season: [] });

const p = payload([D('a', 100, 30), D('b', 100, 20, { dnf: 18 }), D('c', 120, 28), D('d', 300, 60), D('e', 90, 10)], [C('x', 200, 40), C('y', 210, 55), C('z', 900, 99)], 500);
const mine: Lineup = { drivers: ['a', 'b'], ctor: 'x', ace: 'b' };

describe('pit wall lineup logic', () => {
  it('totals the lineup with the Ace doubled, and derives bank and rating', () => {
    expect(projected(p, mine)).toBe(30 + 20 * 2 + 40);
    expect(spent(p, mine)).toBe(400);
    expect(bank(p, mine)).toBe(100);
    expect(rateMyTeam(p, mine)).toBe(Math.round(110 / 3.6));
    expect(sameLineup(mine, { ...mine, drivers: [...mine.drivers] })).toBe(true);
    expect(sameLineup(mine, { ...mine, ace: 'a' })).toBe(false);
  });

  it('recommends only affordable swaps, doubles gains on the Ace slot, best first', () => {
    // d costs 200 more than either driver: outside the 100 bank. c is +20 over a/b.
    // `edge` rides along now: the gain discounted by how reliably the incoming pick delivers it.
    expect(swapRecs(p, mine)).toMatchObject([{ out: 'b', in: 'c', gain: 16, cost: 20 }]);
    expect(swapRecs(payload(p.drivers, p.constructors, 700), mine)[0]).toMatchObject({ out: 'b', in: 'd', gain: 80, cost: 200 });
    expect(swapRecs(p, mine)[0].edge).toBeGreaterThan(0);
    expect(swapRecs(p, mine)[0].edge).toBeLessThanOrEqual(16);   // never flatters a gain
  });

  it('builds the briefing list: swap, Ace move, best-value hold, biggest risk, constructor', () => {
    const recs = briefRecs(p, mine);
    expect(recs.map((r) => r.kind)).toEqual(['SWAP', 'ACE', 'HOLD', 'RISK', 'TEAM']);
    expect(recs[1]).toMatchObject({ title: 'Move ace to A', ace: 'a', good: true });
    expect(recs[3]).toMatchObject({ a: 'b', bad: true, tag: '18% DNF' });
    expect(recs[4]).toMatchObject({ act: 'CTOR:y', tag: '+15 PTS' });
    const held = briefRecs(p, { ...mine, ace: 'a', ctor: 'y' });
    expect(held.find((r) => r.kind === 'ACE')?.tag).toBe('HOLD');
    expect(held.find((r) => r.kind === 'TEAM')?.title).toBe('Keep Y');
  });

  it('marks the better value per comparison row, lower is better for risk and price', () => {
    const rows = Object.fromEntries(compareRows(p, 'b', 'c').map((r) => [r.label, r]));
    expect(rows.Projection.winner).toBe('b'); // c (the right-hand side) projects higher
    expect(rows['DNF risk %'].winner).toBe('b');
    expect(rows.Price).toMatchObject({ a: '$100', b: '$120', winner: 'a' });
    expect(rows['League owned %'].winner).toBeNull();
    // constructors have no fit, price-move, risk or ownership rows
    expect(compareRows(p, 'x', 'y').map((r) => r.label)).toEqual(['Projection', 'Floor', 'Ceiling', 'Range width', 'Pts per $100', 'Price']);
    // Range width is the one row where a smaller number wins: it is how far the projection can
    // swing, not how much it is worth (F-096). Every driver in this fixture has the same ±5 band,
    // so it reads as too close to call — which is the honest answer and worth pinning.
    const even = Object.fromEntries(compareRows(p, 'b', 'c').map((r) => [r.label, r]));
    expect(even['Range width']).toMatchObject({ a: '10', b: '10', winner: null });

    const wide = D('wide', 100, 40, { floor: 10, ceil: 70 });
    const pw = payload([...p.drivers, wide], p.constructors, 100);
    const vs = Object.fromEntries(compareRows(pw, 'b', 'wide').map((r) => [r.label, r]));
    expect(vs['Range width']).toMatchObject({ a: '10', b: '60', winner: 'a' });   // narrower wins
  });

  it('predicts a rival\'s best affordable move and tags it against my lineup', () => {
    const active = rivalMove(p, mine, { name: 'R', rank: 1, gap: 5, lineup: ['e'], bank: 40, activity: 0.9 });
    expect(active).toMatchObject({ gain: 20, likely: 90, tag: 'COPIES YOU' });
    expect(active?.in.id).toBe('a');
    const lazy = rivalMove(p, { ...mine, drivers: ['d'] }, { name: 'R', rank: 1, gap: 5, lineup: ['e'], bank: 40, activity: 0.1 });
    expect(lazy).toMatchObject({ likely: 10, tag: 'LOW RISK' });
    expect(rivalMove(p, mine, { name: 'R', rank: 1, gap: 0, lineup: ['nobody'], bank: 0, activity: 1 })).toBeNull();
  });

  it('lists the swap pool for a slot, applies swaps, and the Ace follows the driver', () => {
    expect(swapPool(p, mine, 'b').map((o) => [o.e.id, o.gain])).toEqual([['c', 16], ['e', -20]]);
    expect(swapPool(p, mine, 'CTOR').map((o) => o.e.id)).toEqual(['y']);
    expect(applySwap(mine, 'b:c')).toEqual({ drivers: ['a', 'c'], ctor: 'x', ace: 'c' });
    expect(applySwap(mine, 'CTOR:y').ctor).toBe('y');
    expect(applySwap(mine, 'garbage')).toBe(mine);
    expect(topPickRec(p, mine, 'b')).toMatchObject({ kind: 'TOP PICK', act: 'b:c', good: true });
    expect(topPickRec(p, { ...mine, drivers: ['a', 'c'], ace: 'c' }, 'c')).toMatchObject({ kind: 'BEST ALTERNATIVE', tag: 'HOLD' });
  });
});

describe('a lineup the payload does not fully carry', () => {
  // A real team can hold someone the payload leaves out, and a free-look document publishes a
  // median of zero for everyone outside the top ten. Neither may be added up as a real zero.
  const known = [D('a', 300, 50), D('b', 200, 30)];
  const ctor = C('T', 400, 60);
  const p = payload(known, [ctor], 1000);

  it('reports what it cannot know instead of returning a smaller number', () => {
    const complete = projectedLineup(p, { drivers: ['a', 'b'], ctor: 'T', ace: 'a' });
    expect(complete).toEqual({ points: 50 * 2 + 30 + 60, missing: 0, open: 3, complete: true });

    const withUnknown = projectedLineup(p, { drivers: ['a', 'ghost'], ctor: 'T', ace: 'a' });
    expect(withUnknown.missing).toBe(1);
    expect(withUnknown.complete).toBe(false);

    const stripped = projectedLineup(payload([D('a', 300, 50), D('b', 200, 0)], [ctor], 1000), { drivers: ['a', 'b'], ctor: 'T', ace: 'a' });
    expect(stripped.missing).toBe(1);
    expect(stripped.complete).toBe(false);
  });

  it('an open slot is not a missing projection: the total of what is held stands, and the slot is counted', () => {
    // two drivers and no constructor: the total is the two, the four open slots are said
    const q = projectedLineup(p, { drivers: ['a', 'b'], ctor: '', ace: 'a' });
    expect(q).toEqual({ points: 50 * 2 + 30, missing: 0, open: 4, complete: true });
    // an empty string in the driver list is an open slot too, not a ghost
    expect(projectedLineup(p, { drivers: ['a', ''], ctor: 'T', ace: 'a' }).open).toBe(4);
  });

  it('still recommends around the picks it does know, rather than throwing', () => {
    const l = { drivers: ['a', 'ghost'], ctor: 'T', ace: 'a' };
    expect(() => briefRecs(p, l)).not.toThrow();
    expect(() => spent(p, l)).not.toThrow();
    expect(() => swapPool(p, l, 'ghost')).not.toThrow();
    expect(swapPool(p, l, 'ghost')).toEqual([]);
  });

  it('says nothing at all when even the constructor is missing', () => {
    expect(briefRecs(p, { drivers: ['a'], ctor: 'gone', ace: 'a' }).every((r) => r.kind !== 'TEAM')).toBe(true);
  });
});

describe('display names for the real team', () => {
  it('shortens a full driver name to the surname and strips sponsor words from a team', () => {
    expect(shortName('Pierre Gasly')).toBe('Gasly');
    expect(shortName('Carlos Sainz Jr.')).toBe('Sainz');
    expect(shortName('Gasly')).toBe('Gasly');
    expect(shortTeamName('Aston Martin Aramco Formula One Team')).toBe('Aston Martin');
    expect(shortTeamName('Mercedes-AMG Petronas F1 Team')).toBe('Mercedes');
    // the id wins where we know it: stripping sponsor words alone turns this one into "Bulls"
    expect(shortTeamName('Racing Bulls', 'racing_bulls')).toBe('RB');
    // and the fallback alone no longer mangles it, because Racing only goes from the end
    expect(shortTeamName('Racing Bulls')).toBe('Racing Bulls');
    expect(shortTeamName('Oracle Red Bull Racing')).toBe('Red Bull');
    expect(shortTeamName('Visa Cash App Racing Bulls', 'racing_bulls')).toBe('RB');
    expect(shortTeamName('Aston Martin Aramco F1 Team', 'aston_martin')).toBe('Aston Martin');
  });
});

describe('open seats', () => {
  // a, b held with x; c (120), d (300), e (90) available; bank = 500 - 100 - 100 - 200 = 100
  it('offers what fits the bank for an empty driver seat and fills it on swap', () => {
    const pool = swapPool(p, mine, OPEN_SEAT);
    expect(pool.map((o) => o.e.id)).toEqual(['e']);              // c and d cost more than the $100 bank
    expect(pool[0].gain).toBe(10);                                 // the pick's own projection: nothing is sold
    const filled = applySwap(mine, `${OPEN_SEAT}:e`);
    expect(filled.drivers).toEqual(['a', 'b', 'e']);
    expect(applySwap(filled, `${OPEN_SEAT}:e`).drivers).toEqual(['a', 'b', 'e']);   // never twice
  });
  it('offers constructors for an empty constructor seat', () => {
    const none: Lineup = { drivers: ['a', 'b'], ctor: '', ace: 'a' };
    expect(swapPool(p, none, 'CTOR').map((o) => o.e.id)).toEqual(['y', 'x']);      // z at 900 does not fit; y projects more
    expect(applySwap(none, 'CTOR:y').ctor).toBe('y');
  });
  it('a full lineup takes nobody more', () => {
    const full: Lineup = { drivers: ['a', 'b', 'c', 'd', 'e'], ctor: 'x', ace: 'a' };
    expect(applySwap(full, `${OPEN_SEAT}:a`).drivers).toHaveLength(5);
  });
});

describe('percentileOf', () => {
  it('ranks among the field, either way up, and says 50 when there is no field', () => {
    expect(percentileOf(10, [10, 5, 2, 1])).toBe(100);
    expect(percentileOf(1, [10, 5, 2, 1])).toBe(0);
    expect(percentileOf(2.5, [10, 5, 2.5, 1], true)).toBe(67);   // avg finish: two of three others are worse
    expect(percentileOf(3, [3])).toBe(50);
  });
});

describe('the purse: a real bank, and drivers the game will not sell back', () => {
  // The payload-derived bank is deliberately tiny here (budget 500, lineup a+b+x = 400 → 100),
  // while the real team's bank is 433: the case that broke the owner's board on 2026-09-28.
  const real = { room: 433, unavailable: new Set<string>() };

  it('offers what the real bank can buy, not what the payload budget implies', () => {
    expect(swapPool(p, mine, 'a').map((o) => o.e.id)).toEqual(['c', 'e']);              // ≤ 100 over a's price
    expect(swapPool(p, mine, 'a', real).map((o) => o.e.id)).toEqual(['d', 'c', 'e']);   // d at 300 now fits
    expect(swapRecs(p, mine, real).some((x) => x.in === 'd')).toBe(true);
    expect(swapRecs(p, mine).some((x) => x.in === 'd')).toBe(false);
  });

  it('never suggests buying back a held driver, not even as the alternative on a risk warning', () => {
    // b is the risky pick (dnf 18); the nearest alternative by price is c, which is held back
    const locked = { room: 433, unavailable: new Set(['c', 'd']) };
    const risk = briefRecs(p, mine, locked).find((r) => r.kind === 'RISK');
    expect(risk).toBeDefined();
    expect(locked.unavailable.has(risk!.b)).toBe(false);
    expect(briefRecs(p, mine, locked).every((r) => !locked.unavailable.has(r.b))).toBe(true);
  });

  it('never offers a driver the game is holding back, however affordable', () => {
    const locked = { room: 433, unavailable: new Set(['d']) };
    expect(swapPool(p, mine, 'a', locked).map((o) => o.e.id)).toEqual(['c', 'e']);
    expect(swapRecs(p, mine, locked).some((x) => x.in === 'd')).toBe(false);
    expect(briefRecs(p, mine, locked).some((r) => r.b === 'd')).toBe(false);
    expect(topPickRec(p, mine, 'a', locked)?.b).not.toBe('d');
  });

  it('falls back to the payload budget when there is no real team', () => {
    expect(purseOf(p, mine)).toEqual({ room: bank(p, mine), unavailable: new Set() });
  });
});

describe('what the pass buys in the swap list', () => {
  // a is in the lineup at 100/30; c (120/28), d (300/60), e (90/10) are available with a 433 bank
  const real = { room: 433, unavailable: new Set<string>() };
  it('ranks by what the swap gains for a pass holder, and by projection for everyone else', () => {
    expect(swapPool(p, mine, 'a', real).map((o) => o.e.id)).toEqual(['d', 'c', 'e']);              // best gain first
    expect(swapPool(p, mine, 'a', real, 8, false).map((o) => o.e.id)).toEqual(['d', 'c', 'e']);    // same here: projection agrees
    // a case where the two orders differ: swapping out the ace doubles the gain, which reorders
    const aceOnA: Lineup = { drivers: ['a', 'b'], ctor: 'x', ace: 'a' };
    const curated = swapPool(p, aceOnA, 'a', real).map((o) => o.e.id);
    const plain = swapPool(p, aceOnA, 'a', real, 8, false).map((o) => o.e.id);
    expect(curated[0]).toBe('d');
    expect(plain).toEqual([...plain].sort((x, y) => (p.drivers.find((z) => z.id === y)!.med) - (p.drivers.find((z) => z.id === x)!.med)));
  });
  it('offers the same people either way: the list is free, only the order is not', () => {
    const ids = (curated: boolean) => swapPool(p, mine, 'a', real, 8, curated).map((o) => o.e.id).sort();
    expect(ids(true)).toEqual(ids(false));
  });
});

describe('briefRecs ace cap', () => {
  // Reported from a real Briefing: "Move ace to Hamilton +4 PTS" on a $535 driver, which the save
  // path refuses and scoring would strip anyway (ACE_MAX_PRICE is 200 in team.ts and again in
  // functions/src/scoring/scoringCore.ts). The list was sorting on projection alone, so it reached
  // for the most expensive driver in the lineup — the one most likely to be over the cap.
  const cheapAce = D('cheap', 100, 40);
  const dear = D('dear', 535, 50);
  const midAce = D('mid', 180, 45);

  it('does not recommend an ace nobody is allowed to set', () => {
    // The reported bug exactly: $535 projects highest, so the old list said "move the ace there".
    // What must never appear is a MOVE to an over-cap pick; a HOLD on the eligible one is right.
    const p = payload([cheapAce, dear], [C('x', 100, 20)], 1000);
    const ace = briefRecs(p, { drivers: ['cheap', 'dear'], ctor: 'x', ace: 'cheap' }).find((r) => r.kind === 'ACE');
    expect(ace?.ace).toBeUndefined();
    expect(JSON.stringify(ace)).not.toContain('dear');
  });

  it('still recommends the best ace inside the cap', () => {
    const p = payload([cheapAce, midAce, dear], [C('x', 100, 20)], 1000);
    const recs = briefRecs(p, { drivers: ['cheap', 'mid', 'dear'], ctor: 'x', ace: 'cheap' });
    const ace = recs.find((r) => r.kind === 'ACE');
    expect(ace?.ace).toBe('mid');          // 45 beats 40 and is under 200; 50 is not available
    expect(ace?.tag).toBe('+5 PTS');
  });

  it('says hold, not move, when the ace is already the best one allowed', () => {
    // Not silence: the list still has something to say about the ace, and what it says is that the
    // current one is right. What it must never do is reach past the cap for the bigger projection.
    const p = payload([cheapAce, midAce, dear], [C('x', 100, 20)], 1000);
    const ace = briefRecs(p, { drivers: ['cheap', 'mid', 'dear'], ctor: 'x', ace: 'mid' }).find((r) => r.kind === 'ACE');
    expect(ace?.tag).toBe('HOLD');
    expect(ace?.ace).toBeUndefined();        // no move offered
    expect(JSON.stringify(ace)).not.toContain('dear');
  });

  it('says hold when the only eligible pick already has it, rather than going quiet', () => {
    // The filter created this case: before it, `best` was the whole lineup and there was always a
    // next-best to compare against. One eligible driver who is already the ace must still get a
    // row — silence reads as "no opinion" when the opinion is "there is nowhere else to put it".
    const p = payload([cheapAce, dear], [C('x', 100, 20)], 1000);
    const ace = briefRecs(p, { drivers: ['cheap', 'dear'], ctor: 'x', ace: 'cheap' }).find((r) => r.kind === 'ACE');
    expect(ace?.tag).toBe('HOLD');
    expect(ace?.why).toContain('only pick at $200 or under');
    expect(ace?.ace).toBeUndefined();
  });

  it('is silent when no pick in the lineup is eligible at all', () => {
    const p = payload([dear, D('dearer', 600, 55)], [C('x', 100, 20)], 2000);
    expect(briefRecs(p, { drivers: ['dear', 'dearer'], ctor: 'x', ace: 'dear' }).filter((r) => r.kind === 'ACE')).toEqual([]);
  });

  it('exactly at the cap is allowed — the rule is <=, as the server has it', () => {
    const atCap = D('atcap', 200, 60);
    const p = payload([cheapAce, atCap], [C('x', 100, 20)], 1000);
    expect(briefRecs(p, { drivers: ['cheap', 'atcap'], ctor: 'x', ace: 'cheap' }).find((r) => r.kind === 'ACE')?.ace).toBe('atcap');
  });
});

describe('ranking by edge rather than raw gain', () => {
  // The reported failure: two swaps taken from this list moved a lineup out of the sharp end into
  // the midfield and cost 34 points of weekend potential, because the list compared medians.
  const steady = D('steady', 120, 46, { floor: 42, ceil: 50, t10: 90 });
  const erratic = D('erratic', 120, 50, { floor: 20, ceil: 80, t10: 45 });
  const held = D('held', 120, 40, { floor: 36, ceil: 44, t10: 85 });

  it('prefers the smaller, surer gain over the bigger one with a band twice as wide', () => {
    const p = payload([held, steady, erratic], [C('x', 100, 20)], 1000);
    const recs = swapRecs(p, { drivers: ['held'], ctor: 'x', ace: '' });
    expect(recs[0].in).toBe('steady');          // +6 tight beats +10 wide
    expect(recs[0].gain).toBeLessThan(recs[1].gain);
  });

  it('still reports the raw gain, because that is what the reader is being offered', () => {
    const p = payload([held, steady, erratic], [C('x', 100, 20)], 1000);
    const top = swapRecs(p, { drivers: ['held'], ctor: 'x', ace: '' })[0];
    expect(top.gain).toBe(6);
    expect(top.edge).toBeLessThan(top.gain);
  });
});

describe('the RISK card does not hand over a downgrade', () => {
  const risky = D('risky', 200, 50, { dnf: 30, floor: 40, ceil: 60, t10: 80 });
  const saferButWorse = D('safer', 200, 30, { dnf: 10, floor: 25, ceil: 35, t10: 60 });
  const saferAndBetter = D('better', 200, 55, { dnf: 10, floor: 50, ceil: 60, t10: 85 });

  it('states the cost and withholds the one-click when the swap loses points', () => {
    const p = payload([risky, saferButWorse], [C('x', 100, 20)], 1000);
    const risk = briefRecs(p, { drivers: ['risky'], ctor: 'x', ace: '' }).find((r) => r.kind === 'RISK');
    expect(risk?.act).toBeUndefined();                       // no one-click downgrade
    expect(risk?.why).toContain('20 points lower');
    expect(risk?.why).toContain('will not make for you');
  });

  it('offers it when the safer pick costs nothing', () => {
    const p = payload([risky, saferAndBetter], [C('x', 100, 20)], 1000);
    const risk = briefRecs(p, { drivers: ['risky'], ctor: 'x', ace: '' }).find((r) => r.kind === 'RISK');
    expect(risk?.act).toBe('risky:better');
    expect(risk?.why).toContain('5 points higher');
  });

  it('no longer claims a safer floor it never checked', () => {
    const p = payload([risky, saferButWorse], [C('x', 100, 20)], 1000);
    const risk = briefRecs(p, { drivers: ['risky'], ctor: 'x', ace: '' }).find((r) => r.kind === 'RISK');
    expect(risk?.why).not.toContain('safer floor');
  });
});
