/**
 * Two layouts that broke at the largest display size, pinned as a shape (F-108 follow-up).
 *
 * Neither screen has a component test (see aceGateShape.test.ts for why), and both faults
 * were only visible on a device at XXL. This reads the composition off the source so that
 * putting either one back the way it was fails here.
 */
import fs from 'fs';
import path from 'path';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

describe('layouts that must survive the largest display size', () => {
  it('the team name field wraps, and return commits instead of adding a line', () => {
    const src = read('src/simple/grid/GridTeamPanel.tsx');
    const field = src.match(/<TextInput[\s\S]*?accessibilityLabel="Team name, tap to edit"[\s\S]*?\/>/)?.[0];
    expect(field).toBeDefined();
    expect(field).toMatch(/\n\s*multiline\n/);
    expect(field).toContain('submitBehavior="blurAndSubmit"');
    // one line cut the name to its first word once it was wider than the row
    expect(field).not.toContain('numberOfLines={1}');
    // iOS keeps the one-line height across a display-size change unless the field remounts
    expect(field).toMatch(/key=\{`team-name-\$\{scaled\(100\)\}`\}/);
  });

  it('a Moonshot choice card restacks above display size L', () => {
    const src = read('src/simple/grid/GridMoonshotSheet.tsx');
    expect(src).toMatch(/const stackChoices = usePrefsStore\(\(s\) => s\.displayScale\) > 1\.15;/);
    const card = src.match(/const choice = [\s\S]*?<\/Pressable>/)?.[0];
    expect(card).toBeDefined();
    expect(card).toContain("flexDirection: stackChoices ? 'column' : 'row'");
  });
});
