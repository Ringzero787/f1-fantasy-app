import { describe, expect, it } from 'vitest';
import { rebaseLineup, sameLineup, swapRecs } from './logic';
import { CONTRACT_LENGTH, planSave, teamLineup, withTeams, type MarketPrices, type RealTeam } from './team';
import type { Driver, Lineup, Payload } from './types';

/**
 * Owner report: selling an expensive driver in the app left the portal's recommendations on the
 * first load. The portal's team now follows the server; these pin the pure halves of that.
 */
const RD = (driverId: string, currentPrice: number) => ({ driverId, name: driverId.toUpperCase(), shortName: driverId.slice(0, 3).toUpperCase(), constructorId: 'car', purchasePrice: currentPrice, currentPrice, contractLength: 3, racesHeld: 3 });
const team = (drivers: ReturnType<typeof RD>[], budget: number, id = 't1'): RealTeam => ({ id, name: 'T', leagueId: null, budget, isLocked: false, aceFreezeFrom: null, aceLockTime: null, aceLockUntil: null, aceQualiKey: null, aceSprintKey: null, scoredRaces: [], aceDriverId: null, totalPoints: 0, lockedPoints: 0, driverLockouts: {}, drivers, constructor: null });
const market: MarketPrices = { drivers: { kimi: { price: 400, name: 'KIMI' }, a: { price: 100, name: 'A' }, b: { price: 100, name: 'B' }, star: { price: 420, name: 'STAR' }, mid: { price: 120, name: 'MID' } }, constructors: {} };

const D = (id: string, price: number, med: number): Driver => ({ id, num: 1, name: id.toUpperCase(), team: 'T', price, med, floor: med - 5, ceil: med + 5, form: [], dnf: 5, own: 10, pm: 0, cons: 50, dprice: 0, fit: [3], win: 0, pod: 0, t10: 0, ptsRise: 1, ptsHold: 1, pRise: 50, pFall: 50, q: 0, r: 0, val: 1, splits: [], mix: { quali: 0, race: 0, sprint: 0, fl: 0 } });
const payload: Payload = { example: true, asOf: '', round: { number: 1, name: 'R', firstSession: '', locksIn: '', circuit: '' }, rounds: [], budget: 1000, teams: { T: { id: 'T', name: 'T', color: '#fff' } }, drivers: [D('kimi', 400, 50), D('a', 100, 10), D('b', 100, 12), D('star', 420, 70), D('mid', 120, 20)], constructors: [], news: [], rivals: [], league: { name: 'L', size: 2, myRank: 1 }, weather: [], weatherSource: null, weatherMap: null, circuit: null, pace: [], season: [] } as unknown as Payload;

const roomOf = (t: RealTeam, l: Lineup = teamLineup(t)) => planSave(t, l, market, CONTRACT_LENGTH, 0).bankAfter;

describe('the portal team follows the server', () => {
  it('re-ranks the recommendations against the bank a sale in the app leaves', () => {
    const before = team([RD('kimi', 400), RD('a', 100), RD('b', 100)], 20);
    const recsBefore = swapRecs(payload, teamLineup(before), { room: roomOf(before), unavailable: new Set() });
    expect(recsBefore.some((r) => r.in === 'star' && r.out !== 'kimi')).toBe(false);   // 420 for a 100 is out of reach on 20

    // Antonelli-style sale in the app: the expensive driver goes, the bank goes up by his price.
    const cur = { team: before, teams: [before], market, completedRaces: 0 };
    const after = team([RD('a', 100), RD('b', 100)], 420);
    const next = withTeams(cur, [after], 't1');
    expect(next?.team.budget).toBe(420);
    const recsAfter = swapRecs(payload, teamLineup(next!.team), { room: roomOf(next!.team), unavailable: new Set() });
    expect(recsAfter[0]).toMatchObject({ in: 'star' });
    expect(recsAfter[0].out).not.toBe('kimi');
  });

  it('keeps the same object when nothing changed, so a listener echo does not churn the pages', () => {
    const t = team([RD('a', 100)], 50);
    const cur = { team: t, teams: [t], market, completedRaces: 0 };
    expect(withTeams(cur, [team([RD('a', 100)], 50)], 't1')).toBe(cur);
    expect(withTeams(cur, [team([RD('a', 100)], 60)], 't1')).not.toBe(cur);
  });

  it('keeps the chosen team, falls back to the first when it is gone, and empties with no teams', () => {
    const t1 = team([], 1), t2 = team([], 2, 't2');
    const cur = { team: t2, teams: [t1, t2], market, completedRaces: 0 };
    expect(withTeams(cur, [t1, { ...t2, budget: 9 }], 't2')?.team).toMatchObject({ id: 't2', budget: 9 });
    expect(withTeams(cur, [t1], 't2')?.team.id).toBe('t1');
    expect(withTeams(cur, [], 't2')).toBeNull();
  });
});

describe('a pending plan when the roster moves underneath it', () => {
  const base: Lineup = { drivers: ['kimi', 'a', 'b'], ctor: 'x', ace: 'a' };

  it('takes the server lineup when nothing was pending', () => {
    const theirs = { ...base, drivers: ['a', 'b'] };
    expect(rebaseLineup(base, base, theirs)).toEqual(theirs);
  });

  it('replays the reader’s swap on top of what the app did, without undoing the app’s sale', () => {
    const mine: Lineup = { ...base, drivers: ['kimi', 'mid', 'b'], ace: 'mid' };   // a → mid, ace moved with it
    const theirs: Lineup = { ...base, drivers: ['a', 'b'] };                           // app sold kimi
    expect(rebaseLineup(base, mine, theirs)).toEqual({ drivers: ['mid', 'b'], ctor: 'x', ace: 'mid' });
  });

  it('becomes clean when the app made the same change the plan had', () => {
    const mine: Lineup = { ...base, drivers: ['star', 'a', 'b'] };
    const theirs: Lineup = { ...base, drivers: ['a', 'b', 'star'] };
    expect(sameLineup(rebaseLineup(base, mine, theirs), theirs)).toBe(true);
  });

  it('seats a pick whose outgoing driver the app already sold, and never past five', () => {
    const mine: Lineup = { ...base, drivers: ['star', 'a', 'b'] };                   // kimi → star
    expect(rebaseLineup(base, mine, { ...base, drivers: ['a', 'b'] }).drivers).toEqual(['a', 'b', 'star']);
    const full: Lineup = { ...base, drivers: ['a', 'b', 'p', 'q', 'r'] };             // app sold kimi and filled every seat
    expect(rebaseLineup(base, mine, full).drivers).toEqual(['a', 'b', 'p', 'q', 'r']);
  });

  it('drops an ace that is no longer held, keeping the server’s when it still is', () => {
    const mine: Lineup = { ...base, ace: 'kimi' };
    expect(rebaseLineup(base, mine, { ...base, drivers: ['a', 'b'] }).ace).toBe('a');
  });
});
