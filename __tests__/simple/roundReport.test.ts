import { buildRoundReport, calloutNames, pointsPer100, previousRaceId, reportRaces, signedPoints, PODIUM_MAX_ROWS } from '../../src/simple/grid/roundReport';
import type { ActivityEntry } from '../../src/simple/grid/moonshot';
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

describe('a round nobody scored in', () => {
  it('has no podium and no top score, as the server names no winner', () => {
    const r = buildRoundReport(doc(19, [e('a', 0, 1), e('b', 0, 1), e('c', -3, 3)]), null, 'a')!;
    expect(r.hasWinner).toBe(false);
    expect(r.podium).toEqual([]);
    expect(r.topScore).toBeNull();
    expect(r.lowScore).toMatchObject({ value: -3 });
    expect(r.me).toMatchObject({ rank: 1, points: 0 });
  });
});

describe('a crowded podium', () => {
  it('never drops the viewer from a place they share', () => {
    const tied = doc(19, [e('a', 100, 1), e('b', 90, 2), ...['c', 'd', 'f', 'g', 'zme'].map((u) => e(u, 80, 3))]);
    const r = buildRoundReport(tied, null, 'zme')!;
    expect(r.podium).toHaveLength(PODIUM_MAX_ROWS);
    expect(r.podium[2]).toMatchObject({ userId: 'zme', isMe: true });
  });
});

describe('value: race points per $100 of roster', () => {
  it('rounds to one decimal', () => {
    expect(pointsPer100(300, 950)).toBe(31.6);
    expect(pointsPer100(-20, 1000)).toBe(-2);
  });

  it('names the best and the least among managers the server priced, and nobody else', () => {
    const priced = doc(19, [e('ann', 300, 1, { rosterValue: 1000 }), e('bob', 250, 2, { rosterValue: 500 }), e('cat', 200, 3, { rosterValue: 1000 }), e('dan', 999, 1, { rosterValue: null }), e('eve', 90, 5)]);
    const r = buildRoundReport(priced, null, 'cat')!;
    expect(r.mostEfficient).toMatchObject({ value: 50 });            // bob: 250 on a $500 roster
    expect(r.mostEfficient!.people.map((p) => p.userId)).toEqual(['bob']);
    expect(r.leastEfficient).toMatchObject({ value: 20, includesMe: true });
  });

  it('says nothing on a leaderboard written before roster values were recorded', () => {
    const r = buildRoundReport(now, before, null)!;
    expect(r.mostEfficient).toBeNull();
    expect(r.leastEfficient).toBeNull();
  });

  it('needs two to compare, three to name a least, and a real gap between them', () => {
    const two = buildRoundReport(doc(19, [e('a', 100, 1, { rosterValue: 1000 }), e('b', 50, 2, { rosterValue: 1000 })]), null, null)!;
    expect(two.mostEfficient).toMatchObject({ value: 10 });
    expect(two.leastEfficient).toBeNull();
    const level = buildRoundReport(doc(19, ['a', 'b', 'c'].map((u, i) => e(u, 100, 1, { rosterValue: 1000 }))), null, null)!;
    expect(level.leastEfficient).toBeNull();
    const one = buildRoundReport(doc(19, [e('a', 100, 1, { rosterValue: 1000 }), e('b', 50, 2)]), null, null)!;
    expect(one.mostEfficient).toBeNull();
  });
});

describe('Moonshots of the round', () => {
  const act = (id: string, type: string, userId: string, extra: Partial<ActivityEntry> = {}): ActivityEntry => ({
    id, type, userId, driverId: 'hadjar', predictionType: 'PODIUM', predictionTarget: null, officialDriverFinish: 3, stakeCurrency: 'POINTS', stakeAmount: 200,
    multiplier: 5, modelProbability: 0.11, adjustmentAmount: 1000, raceId: 'r19', roundNumber: 19, createdAtMs: 1, ...extra,
  });

  it('lists every call settled on this race and no other, named from the leaderboard', () => {
    const r = buildRoundReport(now, null, 'bob', [
      act('h1', 'MOONSHOT_HIT', 'ann'),
      act('m1', 'MOONSHOT_MISSED', 'bob', { adjustmentAmount: -100, modelProbability: 0.22, multiplier: 2.5 }),
      act('old', 'MOONSHOT_HIT', 'cat', { raceId: 'r18' }),
      act('odd', 'MOONSHOT_SOMETHING_NEW', 'dan'),
    ])!;
    expect(r.moonshots.map((m) => m.id)).toEqual(['h1', 'm1']);
    expect(r.moonshots[0]).toMatchObject({ outcome: 'HIT', amount: 1000, who: { name: 'ANN', isMe: false } });
    expect(r.moonshots[1]).toMatchObject({ outcome: 'MISSED', amount: -100, who: { isMe: true } });
  });

  it('the call of the round is the hit the model gave the least chance, the bigger payout on level chances', () => {
    const r = buildRoundReport(now, null, null, [
      act('safe', 'MOONSHOT_HIT', 'ann', { modelProbability: 0.76, adjustmentAmount: 2000 }),
      act('bold', 'MOONSHOT_HIT', 'bob', { modelProbability: 0.08, adjustmentAmount: 500 }),
      act('bold2', 'MOONSHOT_HIT', 'cat', { modelProbability: 0.08, adjustmentAmount: 400 }),
      act('miss', 'MOONSHOT_MISSED', 'dan', { modelProbability: 0.01, adjustmentAmount: -200 }),
    ])!;
    expect(r.callOfTheRound!.id).toBe('bold');
    expect(r.moonshots.map((m) => m.id)).toEqual(['bold', 'safe', 'bold2', 'miss']);
  });

  it('has no call of the round when nothing landed, a void pays nothing, and a call follows the car it settled on', () => {
    const r = buildRoundReport(now, null, null, [
      act('v', 'MOONSHOT_VOID', 'ann', { adjustmentAmount: 0, settledOnDriverId: 'reserve' }),
      act('m', 'MOONSHOT_MISSED', 'bob', { adjustmentAmount: -50 }),
    ])!;
    expect(r.callOfTheRound).toBeNull();
    expect(r.moonshots.map((m) => [m.id, m.outcome, m.amount])).toEqual([['m', 'MISSED', -50], ['v', 'VOID', 0]]);
    expect(r.moonshots[1].driverId).toBe('reserve');
  });

  it('a caller who is not on the leaderboard is still shown, unnamed', () => {
    const r = buildRoundReport(now, null, 'gone', [act('h', 'MOONSHOT_HIT', 'gone')])!;
    expect(r.moonshots[0].who).toMatchObject({ name: 'Player', isMe: true });
  });

  it('is empty with no activity', () => {
    expect(buildRoundReport(now, null, null)!.moonshots).toEqual([]);
  });
});

describe('reportRaces', () => {
  const races = [
    { id: 'r17', round: 17, name: 'Azerbaijan Grand Prix', seasonId: '2026', status: 'completed' },
    { id: 'r18', round: 18, name: 'Bahrain Grand Prix', seasonId: '2026', status: 'completed' },
    { id: 'r19', round: 19, name: 'Singapore Grand Prix', seasonId: '2026', status: 'completed' },
    { id: 'r20', round: 20, name: 'United States Grand Prix', seasonId: '2026', status: 'upcoming' },
    { id: 'old19', round: 18, name: 'Old', seasonId: '2025', status: 'completed' },
  ];
  it('labels the race from the calendar and compares it with the round before', () => {
    expect(reportRaces(races, 'r19')).toEqual({ round: 19, label: 'RD 19 · SINGAPORE', previousId: 'r18' });
  });
  it('does not need the race to be in the league\'s list, which may not have refreshed yet', () => {
    expect(reportRaces(races, 'r19', ['r17'])).toEqual({ round: 19, label: 'RD 19 · SINGAPORE', previousId: 'r17' });
    expect(reportRaces(races, 'r19', [])).toMatchObject({ previousId: 'r18' });
  });
  it('has nothing to compare for the first round, and nothing at all for an unknown race', () => {
    expect(reportRaces(races, 'r17').previousId).toBeNull();
    expect(reportRaces(races, 'nope')).toEqual({ round: null, label: null, previousId: null });
  });
});
