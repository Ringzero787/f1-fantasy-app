import { describe, expect, it } from 'vitest';
import { can, LOCKED_COPY, NO_PASS, passFromClaims, type Feature } from './access';

const now = Date.UTC(2026, 8, 24);

describe('pass access', () => {
  it('reads the pass from the same claim the rules read, and ignores an expired or malformed one', () => {
    expect(passFromClaims({ pw: (now + 86400000) / 1000 }, now)).toEqual({ access: 'pass', expiresAt: now + 86400000, trial: false });
    expect(passFromClaims({ pw: (now - 1) / 1000 }, now)).toEqual(NO_PASS);
    expect(passFromClaims({ pw: 'forever' as unknown as number }, now)).toEqual(NO_PASS);
    expect(passFromClaims(undefined, now)).toEqual(NO_PASS);
  });

  it('the free look is exactly what was promised, and a pass opens everything', () => {
    const free = NO_PASS;
    const paid = { access: 'pass' as const, expiresAt: now + 1, trial: false };
    const freeFeatures: Feature[] = ['briefing.headlines', 'board.top10', 'circuit', 'pace', 'lineup.edit', 'lineup.rateMyTeam', 'wire.headlines', 'entity.present'];
    for (const f of freeFeatures) expect(can(free, f)).toBe(true);
    const paidFeatures: Feature[] = ['briefing.recommendations', 'briefing.rivals', 'board.full', 'board.probabilities', 'board.movement', 'market', 'season', 'lineup.topPick', 'lineup.whatIf', 'entity.past', 'entity.outlook', 'wire.full'];
    for (const f of paidFeatures) {
      expect(can(free, f)).toBe(false);
      expect(can(paid, f)).toBe(true);
    }
  });

  it('timing-derived frames are never sold (ADR-001)', () => {
    expect(can(NO_PASS, 'pace')).toBe(true);
    expect(can(NO_PASS, 'circuit')).toBe(true);
    expect(LOCKED_COPY.pace).toBeUndefined();
    expect(LOCKED_COPY.circuit).toBeUndefined();
  });

  it('every locked feature explains what it would give', () => {
    const paidFeatures: Feature[] = ['briefing.recommendations', 'briefing.rivals', 'board.full', 'board.probabilities', 'board.movement', 'market', 'season', 'lineup.topPick', 'lineup.whatIf', 'entity.past', 'entity.outlook', 'wire.full'];
    for (const f of paidFeatures) expect(LOCKED_COPY[f], f).toBeTruthy();
  });
});
