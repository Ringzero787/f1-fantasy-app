/**
 * The wiring between the screens and the share builders.
 *
 * The builders are covered by their own tests. What was not covered, and what shipped wrong, is the
 * decision about when to offer the control at all: `computeTiles` always pads the roster to a fixed
 * size with empty placeholders, so `tiles.length` is a constant and a brand-new team with nothing
 * picked got a SHARE button that silently did nothing.
 *
 * A static check, because neither screen can be rendered in this test environment, and because the
 * bug was a wrong variable rather than wrong logic — exactly what reading the source catches.
 */
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..', '..', 'src', 'simple', 'grid');
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');

describe('offering the control', () => {
  it('the team share is offered on content, not on a padded array length', () => {
    const s = read('GridTeamPanel.tsx');
    expect(s).toMatch(/tiles\.some\(\(t\) => t\.kind !== 'empty'\)/);
    // `tiles.length` is TEAM_SIZE + 1 whenever a team exists, so it can never gate anything.
    expect(s).not.toMatch(/\{tiles\.length \?/);
  });

  it('the league share is offered only when there are standings', () => {
    expect(read('GridLeaguePanel.tsx')).toMatch(/\{rows\.length \?/);
  });
});

describe('the shared share helper', () => {
  it('both screens go through it rather than each writing the sheet call', () => {
    for (const f of ['GridTeamPanel.tsx', 'GridLeaguePanel.tsx']) {
      const s = read(f);
      expect(s).toMatch(/shareText\(/);
      // A second copy of the try/catch is how the two drift apart on what counts as a failure.
      expect(s).not.toMatch(/Share\.share\(/);
    }
  });

  it('a dismissal is silent and anything else is logged', () => {
    const s = read('shareText.ts');
    expect(s).toMatch(/\/cancel\/i\.test\(reason\)/);
    expect(s).toMatch(/console\.warn/);
    // Never log the throwable whole, and never swallow a real failure.
    expect(s).not.toMatch(/catch\s*\{\s*\}/);
  });

  it('returns false for an empty message rather than opening a sheet onto nothing', () => {
    expect(read('shareText.ts')).toMatch(/if \(!message\) return false/);
  });
});

describe('what the team share is given', () => {
  it('takes both drivers and the constructor, since the constructor scores too', () => {
    expect(read('GridTeamPanel.tsx')).toMatch(/t\.kind === 'driver' \|\| t\.kind === 'constructor'/);
  });
});
