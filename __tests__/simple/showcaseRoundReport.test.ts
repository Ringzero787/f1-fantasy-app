/**
 * The demo league must be able to show the whole round report (F-120): a round to compare
 * against, roster values, and the two Moonshots its history names.
 */
describe('showcase league round report fixture', () => {
  const OLD = process.env;
  beforeEach(() => { jest.resetModules(); process.env = { ...OLD, EXPO_PUBLIC_ALLOW_DEMO: '1', EXPO_PUBLIC_SHOWCASE: '1' }; });
  afterAll(() => { process.env = OLD; });

  it('builds a full report from the two showcase rounds', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const data = require('../../src/simple/grid/showcaseData');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { buildRoundReport } = require('../../src/simple/grid/roundReport');
    expect(data.SHOWCASE_ENABLED).toBe(true);
    const now = data.showcaseRaceResult(data.SHOWCASE_LEAGUE_ID, 'me', data.SHOWCASE_RESULT_ROUND);
    const before = data.showcaseRaceResult(data.SHOWCASE_LEAGUE_ID, 'me', data.SHOWCASE_RESULT_ROUND - 1);
    expect(now.entries).toHaveLength(8);
    expect(before.entries).toHaveLength(8);
    expect(data.showcaseRaceResult(data.SHOWCASE_LEAGUE_ID, 'me', data.SHOWCASE_RESULT_ROUND - 2)).toBeNull();
    const r = buildRoundReport(now, before, 'me');
    expect(r.podium).toHaveLength(3);
    expect(r.climb).not.toBeNull();
    expect(r.drop).not.toBeNull();
    expect(r.mostEfficient).not.toBeNull();
    expect(r.leastEfficient).not.toBeNull();
    expect(now.entries.filter((x: { moonshotPoints?: number }) => x.moonshotPoints).map((x: { userId: string }) => x.userId).sort()).toEqual(['showcase-0', 'showcase-2']);
  });
});
