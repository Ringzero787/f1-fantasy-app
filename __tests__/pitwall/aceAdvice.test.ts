import { aceAdvice, aceAdviceLine, aceVerdictFor, type AceCandidate } from '../../src/pitwall/aceAdvice';
import type { Projection } from '../../src/pitwall/projections';

const P = (id: string, med: number): Projection => ({
  id, med, floor: med - 8, ceil: med + 12, dnf: 12,
  win: 0, pod: 0, t10: 0, val: 0, price: 0, dprice: 0,
  ptsRise: 4, ptsHold: 0, pRise: 0, pFall: 0, own: 0,
  form: [], fit: [], mix: null, splits: [],
});
const byId = (...ps: Projection[]): Record<string, Projection> => Object.fromEntries(ps.map((p) => [p.id, p]));
const D = (id: string, eligible = true): AceCandidate => ({ id, name: id[0].toUpperCase() + id.slice(1), eligible });

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
    expect(aceAdvice(lineup, 'perez', projections)).toEqual({ kind: 'move', id: 'bearman', name: 'Bearman', med: 18, gain: 6 });
  });

  it('keeps the ace where it is when it is already on the best, with the lead over the next', () => {
    expect(aceAdvice(lineup, 'bearman', projections)).toEqual({ kind: 'keep', id: 'bearman', name: 'Bearman', med: 18, lead: 6 });
  });

  it('keeps on a tie rather than moving for no projected gain', () => {
    const level = byId(P('perez', 18), P('bearman', 18));
    expect(aceAdvice([D('perez'), D('bearman')], 'perez', level)).toMatchObject({ kind: 'keep', id: 'perez', lead: 0 });
  });

  it('keeps with no lead when the holder is the only eligible driver', () => {
    expect(aceAdvice([D('norris', false), D('perez')], 'perez', projections)).toEqual({ kind: 'keep', id: 'perez', name: 'Perez', med: 12, lead: null });
  });

  it('moves with no gain figure when the current ace has no projection', () => {
    expect(aceAdvice([...lineup, D('rookie')], 'rookie', projections)).toMatchObject({ kind: 'move', id: 'bearman', gain: null });
  });

  it('says nothing when a constructor ace out-projects every eligible driver', () => {
    expect(aceAdvice(lineup, 'team', projections)).toBeNull();
  });

  it('moves the ace off a constructor that projects lower', () => {
    expect(aceAdvice(lineup, 'team', { ...projections, team: P('team', 10) })).toMatchObject({ kind: 'move', id: 'bearman', gain: 8 });
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
    expect(aceAdviceLine({ kind: 'move', id: 'b', name: 'Bearman', med: 18, gain: 6 })).toBe('MOVE THE ACE TO BEARMAN · +6 BEFORE DOUBLING');
    expect(aceAdviceLine({ kind: 'move', id: 'b', name: 'Bearman', med: 18, gain: null })).toBe('MOVE THE ACE TO BEARMAN · PROJECTS 18');
    expect(aceAdviceLine({ kind: 'keep', id: 'b', name: 'Bearman', med: 18, lead: 6 })).toBe('KEEP THE ACE ON BEARMAN · 6 CLEAR OF YOUR NEXT BEST');
    expect(aceAdviceLine({ kind: 'keep', id: 'b', name: 'Bearman', med: 18, lead: null })).toBe('KEEP THE ACE ON BEARMAN');
    expect(aceAdviceLine({ kind: 'keep', id: 'b', name: 'Bearman', med: 18, lead: 0 })).toBe('KEEP THE ACE ON BEARMAN');
  });
});

describe('aceVerdictFor', () => {
  const set = aceAdvice(lineup, null, projections);
  it('marks the driver Pit Wall would ace', () => {
    expect(aceVerdictFor('bearman', true, set, projections)).toEqual({ pick: true, text: 'ACE THIS DRIVER · YOUR HIGHEST PROJECTION THAT CAN CARRY IT' });
    expect(aceVerdictFor('bearman', true, aceAdvice(lineup, 'bearman', projections), projections)?.text).toMatch(/^KEEP THE ACE HERE/);
  });
  it('says who instead, and by how much, on any other driver', () => {
    expect(aceVerdictFor('perez', true, set, projections)).toEqual({ pick: false, text: 'NOT THIS ONE · BEARMAN PROJECTS 6 MORE' });
  });
  it('says a driver over the cap cannot carry it rather than comparing projections', () => {
    expect(aceVerdictFor('norris', false, set, projections)).toEqual({ pick: false, text: 'CANNOT CARRY THE ACE · IT GOES ON BEARMAN' });
  });
  it('is silent without advice or without a projection for this driver', () => {
    expect(aceVerdictFor('perez', true, null, projections)).toBeNull();
    expect(aceVerdictFor('rookie', true, set, projections)).toBeNull();
  });
});
