/**
 * A team as a message.
 *
 * Same budget as the league share and for the same reason: a line long enough to wrap reads as two
 * lines and the thing stops being a table. The additions here are the ace mark, which is the single
 * most argued-about choice and so the one thing that must survive, and the summary line, which only
 * carries what actually exists.
 */
import { teamText } from '../../src/simple/grid/shareTeam';
import { LINE_WIDTH, displayWidth } from '../../src/simple/grid/shareStandings';

const D = (name: string, pts: number, ace = false) => ({ name, pts, ace });
const base = {
  teamName: 'Late Brakers', caption: 'After round 17',
  seasonPoints: 1444, lastRace: 294, rank: 2, leagueSize: 8,
  drivers: [D('Hadjar', 212, true), D('Colapinto', 148), D('Gasly', 96), D('Antonelli', 301), D('Hamilton', 187), D('Red Bull', 264)],
};

describe('teamText', () => {
  it('leads with the team and what is being shown', () => {
    const [a, b] = teamText(base).split('\n');
    expect(a).toBe('LATE BRAKERS');
    expect(b).toBe('AFTER ROUND 17');
  });

  it('summarises the season, the last race and the place', () => {
    expect(teamText(base)).toContain('1,444 PTS · +294 LAST · P2 OF 8');
  });

  it('leaves out what does not exist rather than printing a dash', () => {
    const out = teamText({ ...base, lastRace: null, rank: null, leagueSize: null });
    expect(out).toContain('1,444 PTS');
    expect(out).not.toContain('LAST');
    expect(out).not.toMatch(/P\d/);   // no place, rather than "P—"
    expect(out.split('\n')[3]).toBe('1,444 PTS');
  });

  it('marks the ace, because it is the thing people argue about', () => {
    const lines = teamText(base).split('\n');
    expect(lines.find((l) => /hadjar/i.test(l))).toMatch(/2x$/);
    expect(lines.find((l) => /gasly/i.test(l))).not.toMatch(/2x/);
  });

  it('spends no room on an ace column when nobody is the ace', () => {
    const out = teamText({ ...base, drivers: base.drivers.map((d) => ({ ...d, ace: false })) });
    expect(out).not.toContain('2x');
  });

  it('never writes a line long enough to wrap', () => {
    const out = teamText({
      ...base,
      teamName: 'A Team With An Extremely Long Name That Goes On',
      drivers: [D('Bartholomew Fotheringay-Smythe', 12345, true), ...base.drivers],
    });
    for (const line of out.split('\n')) expect(displayWidth(line)).toBeLessThanOrEqual(LINE_WIDTH);
  });

  it('holds the budget for a team of CJK names too', () => {
    const out = teamText({
      ...base, teamName: '東京アンダーカット', caption: '第 17 ラウンド',
      drivers: [D('山田太郎山田太郎山田', 301, true), D('佐藤花子', 212), D('김민준', 96)],
    });
    for (const line of out.split('\n')) expect(displayWidth(line)).toBeLessThanOrEqual(LINE_WIDTH);
  });

  it('keeps the scores in one column', () => {
    // The trailing ace padding is trimmed, so the lines differ in length; what has to line up is
    // where the score ends.
    const lines = teamText(base).split('\n').slice(5);
    const ends = lines.map((l) => l.search(/\s+\d+(\s+2x)?$/) + l.match(/\s+\d+/)![0].length);
    expect(new Set(ends).size).toBe(1);
  });

  it('gives the caller nothing to share for an empty team', () => {
    expect(teamText({ ...base, drivers: [] })).toBe('');
  });

  it('carries no code fence, for the same reason the league share does not', () => {
    expect(teamText(base)).not.toContain('```');
  });
});
