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
    expect(src).toMatch(/\{reportRaceId \? \(\s*<Pressable onPress=\{\(\) => setReporting\(true\)\}/);
    expect(src).toMatch(/reporting && league && reportRaceId \? <GridRoundReportSheet leagueId=\{league\.id\} raceId=\{reportRaceId\} resultIds=\{league\.raceResultIds\}/);
    // pull to refresh must not keep serving a cached leaderboard
    expect(src).toContain('clearRoundReportCache();');
  });

  it('the weekend recap offers it only when the league has a leaderboard for that race', () => {
    const src = read('src/simple/grid/GridWeekendRecap.tsx');
    expect(src).toContain('const hasReport = !!league && (league.raceResultIds ?? []).includes(recap.raceId);');
    // the race is captured before the recap marks itself seen, and the old ending stays available
    expect(src).toMatch(/onPress=\{\(\) => \{ setReportRaceId\(recap\.raceId\); dismiss\(\); \}\}/);
    expect((src.match(/label="GOT IT"/g) ?? []).length).toBe(2);
  });

  it('the sheet keeps its scrim behind the sheet so it scrolls on iOS (F-119)', () => {
    const src = read('src/simple/grid/GridRoundReport.tsx');
    expect(src).toMatch(/<Pressable style=\{\[StyleSheet\.absoluteFill, \{ backgroundColor: colors\.scrim \}\]\} onPress=\{onClose\}/);
  });
});
