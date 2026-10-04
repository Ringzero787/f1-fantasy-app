/**
 * The ace gate on the two team screens, pinned as a shape.
 *
 * Both screens decide whether to offer an ace control, and both have had that decision
 * wrong in a way no test caught:
 *
 *  • `app/(tabs)/my-team/index.tsx` ANDed `lockStatus.canModify`, which is false from the
 *    roster lock onwards — so that screen could never reach the gap between qualifying
 *    and lights out that the game deliberately gives you (F-098).
 *  • Before that, the same file carried `serverAceLocked` as an unused import for a
 *    commit, because an edit script aborted partway. Typecheck does not mind an unused
 *    import and neither did any test.
 *
 * Rendering either screen in jest needs expo-router, a dozen stores and a Firebase mock,
 * which is why neither has a component test. This is the cheaper guard: the composition
 * itself, read off the source, in the spirit of __tests__/store/iapWiring.test.ts.
 */
import fs from 'fs';
import path from 'path';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

describe('the ace gate consults the server freeze (F-095 / F-098)', () => {
  it('the complex team screen takes the freeze and does NOT also require canModify', () => {
    const src = read('app/(tabs)/my-team/index.tsx');
    const decl = src.match(/const canChangeAce =[\s\S]*?;/)?.[0];
    expect(decl).toBeDefined();
    expect(decl).toContain('serverAceLocked');
    // canModify is the ROSTER lock. Requiring it here shuts the ace a day early.
    expect(decl).not.toContain('canModify');
  });

  it('the Grid team panel takes the freeze alongside the calendar', () => {
    const src = read('src/simple/grid/GridTeamPanel.tsx');
    const decl = src.match(/const aceLocked =[\s\S]*?;/)?.[0];
    expect(decl).toBeDefined();
    expect(decl).toContain('lockoutInfo.aceLocked');
    expect(decl).toContain('serverAceLocked');
  });

  it('every screen that imports serverAceLocked actually calls it', () => {
    for (const p of ['app/(tabs)/my-team/index.tsx', 'src/simple/grid/GridTeamPanel.tsx']) {
      const src = read(p);
      expect(src).toContain("import { serverAceLocked }");
      // an import with no call is what shipped once already
      expect(src).toMatch(/serverAceLocked\(/);
    }
  });
});
