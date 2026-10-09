import { aceAdvice, aceAdviceLine, aceVerdictFor, projectionsAreForRound, type AceCandidate } from '../../src/pitwall/aceAdvice';
import type { Projection } from '../../src/pitwall/projections';

const P = (id: string, med: number): Projection => ({
  id, med, floor: med - 8, ceil: med + 12, dnf: 12,
  win: 0, pod: 0, t10: 0, val: 0, price: 0, dprice: 0,
  ptsRise: 4, ptsHold: 0, pRise: 0, pFall: 0, own: 0,
  form: [], fit: [], mix: null, splits: [],
});
const byId = (...ps: Projection[]): Record<string, Projection> => Object.fromEntries(ps.map((p) => [p.id, p]));
const D = (id: string, eligible = true): AceCandidate => ({ id, name: id[0].toUpperCase() + id.slice(1), eligible });

const on = (id: string, eligible = true) => ({ id, eligible });

const projections = byId(P('norris', 40), P('perez', 12), P('bearman', 18), P('colapinto', 9), P('team', 60));
const lineup = [D('norris', false), D('perez'), D('bearman'), D('colapinto')];

describe('aceAdvice', () => {
  it('with no ace set, names the highest projection that may carry it', () => {
    expect(aceAdvice(lineup, null, projections)).toEqual({ kind: 'set', id: 'bearman', name: 'Bearman', med: 18 });
  });

  it('never names a driver over the ace cap, however high they project', () => {
    expect(aceAdvice(lineup, null, projections)?.id).not.toBe('norris');
  });

  it('moves the ace off a lower projection and says by how much', () => {
    expect(aceAdvice(lineup, on('perez'), projections)).toEqual({ kind: 'move', id: 'bearman', name: 'Bearman', med: 18, gain: 6, capped: false });
  });

  it('keeps the ace where it is when it is already on the best, with the lead over the next', () => {
    expect(aceAdvice(lineup, on('bearman'), projections)).toEqual({ kind: 'keep', id: 'bearman', name: 'Bearman', med: 18, lead: 6 });
  });

  it('keeps on a tie rather than moving for no projected gain', () => {
    const level = byId(P('perez', 18), P('bearman', 18));
    expect(aceAdvice([D('perez'), D('bearman')], on('perez'), level)).toMatchObject({ kind: 'keep', id: 'perez', lead: 0 });
  });

  it('keeps with no lead when the holder is the only eligible driver', () => {
    expect(aceAdvice([D('norris', false), D('perez')], on('perez'), projections)).toEqual({ kind: 'keep', id: 'perez', name: 'Perez', med: 12, lead: null });
  });

  it('moves with no gain figure when the current ace has no projection', () => {
    expect(aceAdvice([...lineup, D('rookie')], on('rookie'), projections)).toMatchObject({ kind: 'move', id: 'bearman', gain: null });
  });

  it('says nothing when a constructor ace out-projects every eligible driver', () => {
    expect(aceAdvice(lineup, on('team'), projections)).toBeNull();
  });

  it('moves the ace off a constructor that projects lower', () => {
    expect(aceAdvice(lineup, on('team'), { ...projections, team: P('team', 10) })).toMatchObject({ kind: 'move', id: 'bearman', gain: 8 });
  });

  it('moves the ace off a driver who has risen over the cap, however high they project', () => {
    // Scoring strips the multiplier above the cap: 40 un-doubled is not better than 18 doubled.
    expect(aceAdvice(lineup, on('norris', false), projections)).toEqual({ kind: 'move', id: 'bearman', name: 'Bearman', med: 18, gain: null, capped: true });
  });

  it('moves the ace off a constructor over the cap too', () => {
    expect(aceAdvice(lineup, on('team', false), projections)).toMatchObject({ kind: 'move', id: 'bearman', capped: true });
  });

  it('compares the whole points the screen shows: a fraction ahead is level, not a move', () => {
    const close = byId(P('perez', 18.0), P('bearman', 18.4));
    expect(aceAdvice([D('perez'), D('bearman')], on('perez'), close)).toMatchObject({ kind: 'keep', id: 'perez', lead: 0 });
    expect(aceAdvice([D('perez'), D('bearman')], null, byId(P('perez', 17.5)))).toMatchObject({ kind: 'set', med: 18 });
  });

  it('is null when no eligible driver has a projection', () => {
    expect(aceAdvice([D('norris', false), D('rookie')], null, projections)).toBeNull();
    expect(aceAdvice([], null, projections)).toBeNull();
  });

  it('treats a zero projection as not published', () => {
    expect(aceAdvice([D('perez')], null, byId(P('perez', 0)))).toBeNull();
  });

  it('breaks a tie by id so the advice does not move between renders', () => {
    const level = byId(P('b', 20), P('a', 20));
    expect(aceAdvice([D('b'), D('a')], null, level)?.id).toBe('a');
    expect(aceAdvice([D('a'), D('b')], null, level)?.id).toBe('a');
  });
});

describe('aceAdviceLine', () => {
  it('reads as one line per kind', () => {
    expect(aceAdviceLine({ kind: 'set', id: 'b', name: 'Bearman', med: 18 })).toBe('ACE BEARMAN · PROJECTS 18, 36 DOUBLED');
    expect(aceAdviceLine({ kind: 'move', id: 'b', name: 'Bearman', med: 18, gain: 6, capped: false })).toBe('MOVE THE ACE TO BEARMAN · +6 BEFORE DOUBLING');
    expect(aceAdviceLine({ kind: 'move', id: 'b', name: 'Bearman', med: 18, gain: null, capped: false })).toBe('MOVE THE ACE TO BEARMAN · PROJECTS 18');
    expect(aceAdviceLine({ kind: 'move', id: 'b', name: 'Bearman', med: 18, gain: null, capped: true })).toBe('YOUR ACE IS OVER THE CAP AND WILL NOT DOUBLE · MOVE IT TO BEARMAN');
    expect(aceAdviceLine({ kind: 'keep', id: 'b', name: 'Bearman', med: 18, lead: 6 })).toBe('KEEP THE ACE ON BEARMAN · 6 CLEAR OF YOUR NEXT BEST');
    expect(aceAdviceLine({ kind: 'keep', id: 'b', name: 'Bearman', med: 18, lead: null })).toBe('KEEP THE ACE ON BEARMAN');
    expect(aceAdviceLine({ kind: 'keep', id: 'b', name: 'Bearman', med: 18, lead: 0 })).toBe('KEEP THE ACE ON BEARMAN');
  });
});

describe('aceVerdictFor', () => {
  const set = aceAdvice(lineup, null, projections);
  it('marks the driver Pit Wall would ace', () => {
    expect(aceVerdictFor('bearman', true, set, projections)).toEqual({ pick: true, text: 'ACE THIS DRIVER · YOUR HIGHEST PROJECTION THAT CAN CARRY IT' });
    expect(aceVerdictFor('bearman', true, aceAdvice(lineup, on('bearman'), projections), projections)?.text).toMatch(/^KEEP THE ACE HERE/);
  });
  it('says who instead, and by how much, on any other driver', () => {
    expect(aceVerdictFor('perez', true, set, projections)).toEqual({ pick: false, text: 'NOT THIS ONE · BEARMAN PROJECTS 6 MORE' });
  });
  it('says a driver over the cap cannot carry it rather than comparing projections', () => {
    expect(aceVerdictFor('norris', false, set, projections)).toEqual({ pick: false, text: 'CANNOT CARRY THE ACE · IT GOES ON BEARMAN' });
  });
  it('names who instead without a figure when the two are level', () => {
    const level = byId(P('perez', 18), P('bearman', 18));
    const a = aceAdvice([D('perez'), D('bearman')], on('bearman'), level);
    expect(aceVerdictFor('perez', true, a, level)).toEqual({ pick: false, text: 'NOT THIS ONE · THE ACE GOES ON BEARMAN' });
  });
  it('is silent without advice or without a projection for this driver', () => {
    expect(aceVerdictFor('perez', true, null, projections)).toBeNull();
    expect(aceVerdictFor('rookie', true, set, projections)).toBeNull();
  });
});

describe('projectionsAreForRound', () => {
  it('is true for the round about to be played', () => {
    expect(projectionsAreForRound(19, 19)).toBe(true);
  });
  it('is false while the projections are still last round\'s', () => {
    expect(projectionsAreForRound(18, 19)).toBe(false);
  });
  it('does not call an unknown round a mismatch', () => {
    expect(projectionsAreForRound(0, 19)).toBe(true);
    expect(projectionsAreForRound(19, null)).toBe(true);
  });
});
