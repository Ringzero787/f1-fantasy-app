/**
 * Where the round report opens from, pinned as a shape (F-120). Neither host screen has a
 * component test (see aceGateShape.test.ts), and the two conditions here are the ones that decide
 * whether a manager is offered a report that does not exist.
 */
import fs from 'fs';
import path from 'path';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

describe('round report entry points', () => {
  it('the League tab offers it for the race on screen, else the latest one, and only when there is one', () => {
    const src = read('src/simple/grid/GridLeaguePanel.tsx');
    expect(src).toContain('const reportRaceId = raceId ?? options[0]?.raceId ?? null;');
    expect(src).toMatch(/\{reportRaceId \? \(\s*<Pressable\s+onPress=\{\(\) => setReporting\(true\)\}/);
    expect(src).toMatch(/reporting && league && reportRaceId \? <GridRoundReportSheet leagueId=\{league\.id\} raceId=\{reportRaceId\} resultIds=\{league\.raceResultIds\}/);
  });

  it('the table and the report share one cached read, which pull to refresh and sign-out both clear', () => {
    const panel = read('src/simple/grid/GridLeaguePanel.tsx');
    expect(panel).toContain('readLeagueRaceResult(league.id, raceId)');
    expect(panel).not.toContain('getLeagueRaceResult');
    expect(panel).toContain('clearRoundReportCache();');
    expect(read('src/store/auth.store.ts')).toMatch(/clearRoundReportCache \}\) => clearRoundReportCache\(\)/);
  });

  it('the weekend recap offers the next step to anyone in a league, never on a list that may be stale', () => {
    const src = read('src/simple/grid/GridWeekendRecap.tsx');
    expect(src).toContain('const hasReport = !!leagueId;');
    // the report is asked for by the team's league id, not a league object that may not have loaded
    expect(src).toContain('useRoundReport(reportRaceId ? leagueId : null, reportRaceId, resultIds)');
    // gating on the league's list of leaderboards lost the step for good when the recap was dismissed before the list refreshed
    expect(src).not.toMatch(/hasReport = [^;]*raceResultIds/);
    // the race is captured before the recap marks itself seen, and the old ending stays available
    expect(src).toMatch(/onPress=\{\(\) => \{ setReportRaceId\(recap\.raceId\); dismiss\(\); \}\}/);
    // with and without a league; F-130 swaps each for NEXT · <team> when the other team's recap is still to see
    expect((src.match(/label="GOT IT"/g) ?? []).length).toBe(2);
    expect((src.match(/label=\{`NEXT · \$\{nextTeam\.name\.toUpperCase\(\)\}`\}/g) ?? []).length).toBe(2);
    // the recap's places are the round's and the season's (F-130); the report's is the round's
    expect(src).toContain('const roundText = roundLine(standing);');
    expect(src).toContain('const seasonText = seasonLine(standing, team ? (team.totalPoints ?? 0) + (team.lockedPoints ?? 0) : null);');
    expect(read('src/simple/grid/weekendRecap.ts')).toContain('`SEASON P${s.seasonRank}');
    expect(read('src/simple/grid/GridRoundReport.tsx')).toContain('YOUR ROUND');
  });

  it('the sheet keeps its scrim behind the sheet so it scrolls on iOS (F-119)', () => {
    const src = read('src/simple/grid/GridRoundReport.tsx');
    expect(src).toMatch(/<Pressable style=\{\[StyleSheet\.absoluteFill, \{ backgroundColor: colors\.scrim \}\]\} onPress=\{onClose\}/);
  });

  it('SHARE on the sheet and the recap step goes through shareRoundReport', () => {
    expect(read('src/simple/grid/GridRoundReport.tsx')).toContain('shareRoundReport');
    expect(read('src/simple/grid/GridWeekendRecap.tsx')).toContain('shareRoundReport');
    expect(read('src/simple/grid/GridRoundReport.tsx')).toContain('RoundReportShareCard');
  });
});
