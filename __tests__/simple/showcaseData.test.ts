import { SHOWCASE_ENABLED, SHOWCASE_LEAGUE_ID, showcaseMembers, showcaseTotal, SHOWCASE_ROSTER, SHOWCASE_CONSTRUCTOR, SHOWCASE_BANKED } from '../../src/simple/grid/showcaseData';

describe('store-screenshot showcase', () => {
  it('is off unless both build flags are set, and then supplies no members', () => {
    expect(SHOWCASE_ENABLED).toBe(false);
    expect(showcaseMembers(SHOWCASE_LEAGUE_ID, 'demo-user')).toBeNull();
  });

  it('adds up: tiles plus banked points equal the standings total', () => {
    const tiles = SHOWCASE_ROSTER.reduce((s, r) => s + r[1], 0) + SHOWCASE_CONSTRUCTOR[1];
    expect(showcaseTotal()).toBe(tiles + SHOWCASE_BANKED);
  });
});
