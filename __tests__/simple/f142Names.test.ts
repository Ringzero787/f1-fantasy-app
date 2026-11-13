// F-142: names in the market, the league feed and the league tables.
import { surnameOf } from '../../src/simple/grid/tileState';
import { activityShortLine, boardShortLine } from '../../src/simple/grid/moonshot';
import { calloutNames, headlineOf, sublineOf } from '../../src/simple/grid/roundReport';

describe('surnameOf', () => {
  it('skips a generational suffix', () => {
    expect(surnameOf('Carlos Sainz Jr.')).toBe('Sainz');
    expect(surnameOf('Carlos Sainz Jr')).toBe('Sainz');
    expect(surnameOf('Someone Smith III')).toBe('Smith');
  });
  it('keeps the plain cases', () => {
    expect(surnameOf('Lando Norris')).toBe('Norris');
    expect(surnameOf('Kimi Antonelli')).toBe('Antonelli');
    expect(surnameOf('Zhou')).toBe('Zhou');
    expect(surnameOf('Jr.')).toBe('Jr.');
  });
});

describe('Moonshot feed one-liners', () => {
  it('a called shot: what it pays, and the team', () => {
    expect(boardShortLine({ potentialReward: 1000, stakeCurrency: 'POINTS' }, 'Box Box Boys')).toBe('🚀 MOONSHOT +1,000 POINTS · BOX BOX BOYS');
  });
  it('a settled shot: the points it moved, and the team', () => {
    expect(activityShortLine({ type: 'MOONSHOT_HIT', adjustmentAmount: 1000, stakeCurrency: 'POINTS' }, 'Box Box Boys')).toBe('🔥 MOONSHOT +1,000 POINTS · BOX BOX BOYS');
    expect(activityShortLine({ type: 'MOONSHOT_MISSED', adjustmentAmount: -200, stakeCurrency: 'POINTS' }, 'Grid Rats')).toBe('💥 MOONSHOT −200 POINTS · GRID RATS');
    expect(activityShortLine({ type: 'MOONSHOT_VOID', adjustmentAmount: 0, stakeCurrency: 'CASH' }, 'Grid Rats')).toBe('↩ MOONSHOT VOID · GRID RATS');
  });
  it('never names the player', () => {
    const line = boardShortLine({ potentialReward: 50, stakeCurrency: 'CASH' }, 'Team');
    expect(line).not.toMatch(/CALLED/);
  });
});

describe('team first, player second', () => {
  const p = (name: string, team: string, isMe = false) => ({ userId: name, name, team, isMe });
  it('the headline is the team, the small line the player', () => {
    expect(headlineOf(p('Sam Okafor', 'Box Box Boys'))).toBe('Box Box Boys');
    expect(sublineOf(p('Sam Okafor', 'Box Box Boys'))).toBe('Sam Okafor');
  });
  it('a member with no team name falls back to the player, with no second line', () => {
    expect(headlineOf(p('Sam Okafor', ''))).toBe('Sam Okafor');
    expect(sublineOf(p('Sam Okafor', ''))).toBeNull();
  });
  it('callouts name teams', () => {
    expect(calloutNames({ people: [p('Sam', 'Box Box Boys')], value: 1, includesMe: false })).toBe('BOX BOX BOYS');
    expect(calloutNames({ people: [p('me', 'Mine', true), p('Sam', 'Grid Rats')], value: 1, includesMe: true })).toBe('YOU & GRID RATS');
  });
});

import { rowAvailability } from '../../src/simple/grid/pickerArithmetic';

describe('rowAvailability (F-142 picker blocking)', () => {
  it("the owner's case: a $5 constructor with $18 is selectable, only tight", () => {
    // three drivers picked, two seats open at $5 + $10 → the cheapest finish is $15
    const a = rowAvailability({ kind: 'constructor', price: 5, bank: 18, reserve: 15, selected: false, owned: false });
    expect(a).toEqual({ blocked: false, tight: true, reason: null });
  });
  it('a row that leaves enough is neither blocked nor tight', () => {
    expect(rowAvailability({ kind: 'driver', price: 10, bank: 100, reserve: 20, selected: false, owned: false })).toEqual({ blocked: false, tight: false, reason: null });
  });
  it('over the bank blocks, and says by how much', () => {
    expect(rowAvailability({ kind: 'driver', price: 30, bank: 18, reserve: 0, selected: false, owned: false })).toEqual({ blocked: true, tight: false, reason: '$12 OVER YOUR BANK' });
  });
  it('a full driver line-up and a lock-out block drivers with their reason', () => {
    expect(rowAvailability({ kind: 'driver', price: 1, bank: 100, reserve: 0, selected: false, owned: false, driversFull: true }).reason).toMatch(/5 OF 5 DRIVERS PICKED/);
    expect(rowAvailability({ kind: 'driver', price: 1, bank: 100, reserve: 0, selected: false, owned: false, lockedOut: true }).reason).toMatch(/LOCKED OUT/);
  });
  it('a selected or owned row is never blocked by price', () => {
    expect(rowAvailability({ kind: 'driver', price: 300, bank: 0, reserve: 50, selected: true, owned: false }).blocked).toBe(false);
    expect(rowAvailability({ kind: 'constructor', price: 300, bank: 0, reserve: 50, selected: false, owned: true })).toEqual({ blocked: false, tight: false, reason: null });
  });
});
