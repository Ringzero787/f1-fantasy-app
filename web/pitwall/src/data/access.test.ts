import { describe, expect, it } from 'vitest';
import { can, LOCKED_COPY, NO_PASS, passFromClaims, payloadForAccess, type Feature } from './access';

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
    for (const f of freeFeatures) expect(can(free, f, false)).toBe(true);
    const paidFeatures: Feature[] = ['briefing.recommendations', 'briefing.rivals', 'board.full', 'board.probabilities', 'board.movement', 'market', 'season', 'lineup.topPick', 'lineup.whatIf', 'entity.past', 'entity.outlook', 'wire.full'];
    for (const f of paidFeatures) {
      expect(can(free, f, false)).toBe(false);
      expect(can(paid, f, false)).toBe(true);
    }
  });

  it('opens every frame to a signed-in user while content is free (F-124)', () => {
    expect(can(NO_PASS, 'market')).toBe(true);
    expect(can(NO_PASS, 'briefing.recommendations')).toBe(true);
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

describe('payloadForAccess', () => {
  it('renders a payload only for the access it was fetched for', () => {
    const paid = { access: 'pass' as const, payload: { drivers: 22 } };
    expect(payloadForAccess(paid, 'pass', false)).toEqual({ drivers: 22 });
    // the pass lapsed, was revoked, or the viewer signed out: the paid payload must not linger
    expect(payloadForAccess(paid, 'free', false)).toBeNull();
    expect(payloadForAccess(null, 'free', false)).toBeNull();
    expect(payloadForAccess(undefined, 'pass', false)).toBeNull();
  });

  it('keeps the paid payload for a free viewer while content is open (F-124)', () => {
    const paid = { access: 'pass' as const, payload: { drivers: 22 } };
    expect(payloadForAccess(paid, 'free')).toEqual({ drivers: 22 });
  });
});
