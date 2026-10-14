import { buildRoundReport } from '../../src/simple/grid/roundReport';
import { roundReportText } from '../../src/simple/grid/roundReportShare';
import type { LeagueRaceResultDoc, RaceResultEntry } from '../../src/simple/grid/raceLeaderboard';

const e = (userId: string, points: number, rank: number, extra: Partial<RaceResultEntry> = {}): RaceResultEntry =>
  ({ userId, displayName: userId.toUpperCase(), teamName: `${userId} team`, points, rank, ...extra });
const doc = (round: number, entries: RaceResultEntry[]): LeagueRaceResultDoc =>
  ({ raceId: `r${round}`, round, entries, winners: entries.filter((x) => x.rank === 1).map((x) => x.userId) });

describe('roundReportText', () => {
  it('leads with the product, the league, your place, the podium and the invite code', () => {
    const report = buildRoundReport(doc(19, [e('ann', 300, 1), e('bob', 250, 2), e('cat', 200, 3)]), null, 'bob')!;
    const text = roundReportText({ report, label: 'RD 19 · SINGAPORE', leagueName: 'Sunday Club', inviteCode: 'SUN-2601' });
    expect(text).toContain('UNDERCUT · ROUND REPORT');
    expect(text).toContain('SUNDAY CLUB · RD 19 · SINGAPORE');
    expect(text).toContain('YOU  P2/3');
    expect(text).toContain('PODIUM');
    expect(text).toContain('BOB · YOU');
    expect(text).toContain('JOIN  SUN-2601');
    expect(text).toContain('https://undercut.humannpc.com/join?code=SUN-2601');
  });
  it('omits the join block when there is no code, so a solo player does not share a blank invite', () => {
    const report = buildRoundReport(doc(1, [e('ann', 10, 1)]), null, 'ann')!;
    const text = roundReportText({ report, label: null, leagueName: 'Solo' });
    expect(text).not.toContain('JOIN');
    expect(text).not.toContain('undercut.humannpc.com');
  });
});
