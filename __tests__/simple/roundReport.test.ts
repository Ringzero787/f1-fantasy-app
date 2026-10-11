import { buildRoundReport, calloutNames, previousRaceId, signedPoints, PODIUM_MAX_ROWS } from '../../src/simple/grid/roundReport';
import type { LeagueRaceResultDoc, RaceResultEntry } from '../../src/simple/grid/raceLeaderboard';

const e = (userId: string, points: number, rank: number, extra: Partial<RaceResultEntry> = {}): RaceResultEntry =>
  ({ userId, displayName: userId.toUpperCase(), teamName: `${userId} team`, points, rank, ...extra });
const doc = (round: number, entries: RaceResultEntry[], extra: Partial<LeagueRaceResultDoc> = {}): LeagueRaceResultDoc =>
  ({ raceId: `r${round}`, round, entries, winners: entries.filter((x) => x.rank === 1).map((x) => x.userId), ...extra });

const now = doc(19, [e('ann', 300, 1), e('bob', 250, 2), e('cat', 200, 3), e('dan', 120, 4), e('eve', 90, 5)]);
const before = doc(18, [e('ann', 310, 1), e('bob', 100, 4), e('cat', 260, 2), e('dan', 240, 3), e('eve', 60, 5)]);

describe('buildRoundReport', () => {
  it('is null when there is nothing to report', () => {
    expect(buildRoundReport(null, null, 'ann')).toBeNull();
    expect(buildRoundReport(doc(19, []), null, 'ann')).toBeNull();
  });

  it('lists the podium in rank order with the viewer marked', () => {
    const r = buildRoundReport(now, before, 'bob')!;
    expect(r.podium.map((p) => [p.rank, p.userId, p.points])).toEqual([[1, 'ann', 300], [2, 'bob', 250], [3, 'cat', 200]]);
    expect(r.podium.map((p) => p.isMe)).toEqual([false, true, false]);
    expect(r.size).toBe(5);
  });

  it('keeps a tie on the podium but never more than the cap', () => {
    const tied = doc(19, [e('a', 100, 1), e('b', 90, 2), ...['c', 'd', 'f', 'g', 'h'].map((u) => e(u, 80, 3))]);
    const r = buildRoundReport(tied, null, null)!;
    expect(r.podium).toHaveLength(PODIUM_MAX_ROWS);
    expect(r.podium.slice(2).every((p) => p.rank === 3)).toBe(true);
  });

  it('names the best and the lowest score', () => {
    const r = buildRoundReport(now, before, 'eve')!;
    expect(r.topScore).toMatchObject({ value: 300, includesMe: false });
    expect(r.topScore!.people.map((p) => p.userId)).toEqual(['ann']);
    expect(r.lowScore).toMatchObject({ value: 90, includesMe: true });
  });

  it('has no lowest score when everyone is level, or in a league of two', () => {
    expect(buildRoundReport(doc(19, [e('a', 50, 1), e('b', 50, 1), e('c', 50, 1)]), null, null)!.lowScore).toBeNull();
    expect(buildRoundReport(doc(19, [e('a', 80, 1), e('b', 50, 2)]), null, null)!.lowScore).toBeNull();
  });

  it('measures the climb and the drop against each manager\'s own previous round', () => {
    const r = buildRoundReport(now, before, 'dan')!;
    expect(r.climb).toMatchObject({ value: 150 });               // bob 100 → 250
    expect(r.climb!.people.map((p) => p.userId)).toEqual(['bob']);
    expect(r.drop).toMatchObject({ value: -120, includesMe: true }); // dan 240 → 120
    expect(r.comparedToRound).toBe(18);
  });

  it('leaves the comparison out with no previous round, and for a manager who was not in it', () => {
    const first = buildRoundReport(now, null, 'ann')!;
    expect(first.climb).toBeNull();
    expect(first.drop).toBeNull();
    expect(first.comparedToRound).toBeNull();
    expect(first.me).toMatchObject({ rank: 1, of: 5, points: 300, change: null });

    const joined = doc(19, [...now.entries, e('new', 500, 1)]);
    const r = buildRoundReport(joined, before, 'new')!;
    expect(r.me!.change).toBeNull();
    expect(r.climb!.people.map((p) => p.userId)).toEqual(['bob']);   // the newcomer has nothing to climb from
  });

  it('does not call a round with no gain a climb, or one with no loss a drop', () => {
    const flat = buildRoundReport(doc(19, [e('a', 100, 1), e('b', 90, 2), e('c', 80, 3)]), doc(18, [e('a', 100, 1), e('b', 95, 2), e('c', 80, 3)]), null)!;
    expect(flat.climb).toBeNull();
    expect(flat.drop).toMatchObject({ value: -5 });
  });

  it('shares a callout between ties, the viewer first', () => {
    const r = buildRoundReport(doc(19, [e('zed', 100, 1), e('amy', 100, 1), e('me', 100, 1), e('low', 10, 4)]), null, 'me')!;
    expect(r.topScore!.people.map((p) => p.userId)).toEqual(['me', 'amy', 'zed']);
    expect(calloutNames(r.topScore!)).toBe('YOU & 2 OTHERS');
  });

  it('reports the Moonshot that landed and the one that missed, and neither when nobody called one', () => {
    const shots = doc(19, [e('a', 300, 1, { moonshotPoints: 1000 }), e('b', 250, 2, { moonshotPoints: -100 }), e('c', 200, 3, { moonshotPoints: 0 }), e('d', 100, 4)]);
    const r = buildRoundReport(shots, null, 'b')!;
    expect(r.moonshotHit).toMatchObject({ value: 1000 });
    expect(r.moonshotMiss).toMatchObject({ value: -100, includesMe: true });
    const none = buildRoundReport(now, null, null)!;
    expect(none.moonshotHit).toBeNull();
    expect(none.moonshotMiss).toBeNull();
  });

  it('passes on that the numbers are approximate when either leaderboard was rebuilt', () => {
    expect(buildRoundReport(now, before, null)!.estimated).toBe(false);
    expect(buildRoundReport({ ...now, estimated: true }, before, null)!.estimated).toBe(true);
    expect(buildRoundReport(now, { ...before, estimated: true }, null)!.estimated).toBe(true);
  });

  it('ignores entries with no usable score', () => {
    const r = buildRoundReport(doc(19, [e('a', 100, 1), { userId: 'x', points: Number.NaN, rank: 2 } as RaceResultEntry]), null, null)!;
    expect(r.size).toBe(1);
  });
});

describe('labels', () => {
  it('names one, two, or a crowd', () => {
    const p = (name: string, isMe = false) => ({ userId: name, name, team: '', isMe });
    expect(calloutNames({ people: [p('Sam Okafor')], value: 1, includesMe: false })).toBe('SAM OKAFOR');
    expect(calloutNames({ people: [p('me', true), p('Sam')], value: 1, includesMe: true })).toBe('YOU & SAM');
    expect(calloutNames({ people: [p('A'), p('B'), p('C'), p('D')], value: 1, includesMe: false })).toBe('A & 3 OTHERS');
  });

  it('signs points', () => {
    expect(signedPoints(1080)).toBe(`+${(1080).toLocaleString()}`);
    expect(signedPoints(-223)).toBe('-223');
    expect(signedPoints(0)).toBe('+0');
  });
});

describe('previousRaceId', () => {
  const options = [{ raceId: 'r19', round: 19 }, { raceId: 'r18', round: 18 }, { raceId: 'r16', round: 16 }];
  it('is the nearest earlier round on record, skipping gaps', () => {
    expect(previousRaceId(options, 'r19')).toBe('r18');
    expect(previousRaceId(options, 'r18')).toBe('r16');
  });
  it('is null for the first round on record and for an unknown race', () => {
    expect(previousRaceId(options, 'r16')).toBeNull();
    expect(previousRaceId(options, 'nope')).toBeNull();
  });
});
