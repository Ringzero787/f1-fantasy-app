/**
 * Unit tests for lockout utility
 */

import {
  getNextIncompleteRace,
  getLockoutTime,
  computeLockoutStatus,
} from '../../src/utils/lockout';
import type { Race } from '../../src/types';

// Helper to create a minimal race object for testing
function makeRace(overrides: Partial<Race> & { id: string; round: number }): Race {
  const base: Race = {
    id: overrides.id,
    seasonId: '2026',
    round: overrides.round,
    name: overrides.name || `Race ${overrides.round}`,
    officialName: `Official ${overrides.round}`,
    circuitId: 'test',
    circuitName: 'Test Circuit',
    country: 'Test',
    city: 'Test',
    timezone: 'UTC',
    hasSprint: overrides.hasSprint ?? false,
    status: overrides.status || 'upcoming',
    schedule: overrides.schedule || {
      fp1: new Date('2026-03-06T01:30:00Z'),
      fp2: new Date('2026-03-06T05:00:00Z'),
      fp3: new Date('2026-03-07T01:30:00Z'),
      qualifying: new Date('2026-03-07T05:00:00Z'),
      race: new Date('2026-03-08T04:00:00Z'),
    },
  };
  return base;
}

describe('getNextIncompleteRace', () => {
  const races = [
    makeRace({ id: 'r1', round: 1 }),
    makeRace({ id: 'r2', round: 2 }),
    makeRace({ id: 'r3', round: 3 }),
  ];

  it('returns the first race when none are completed', () => {
    const result = getNextIncompleteRace(races, new Set());
    expect(result?.id).toBe('r1');
  });

  it('returns the second race when first is completed', () => {
    const result = getNextIncompleteRace(races, new Set(['r1']));
    expect(result?.id).toBe('r2');
  });

  it('returns the third race when first two are completed', () => {
    const result = getNextIncompleteRace(races, new Set(['r1', 'r2']));
    expect(result?.id).toBe('r3');
  });

  it('returns null when all races are completed', () => {
    const result = getNextIncompleteRace(races, new Set(['r1', 'r2', 'r3']));
    expect(result).toBeNull();
  });

  it('handles unsorted races correctly', () => {
    const unsorted = [races[2], races[0], races[1]];
    const result = getNextIncompleteRace(unsorted, new Set(['r1']));
    expect(result?.id).toBe('r2');
  });
});

describe('getLockoutTime', () => {
  it('returns FP3 time for a normal weekend', () => {
    const race = makeRace({
      id: 'normal',
      round: 1,
      hasSprint: false,
      schedule: {
        fp1: new Date('2026-03-06T01:30:00Z'),
        fp2: new Date('2026-03-06T05:00:00Z'),
        fp3: new Date('2026-03-07T01:30:00Z'),
        qualifying: new Date('2026-03-07T05:00:00Z'),
        race: new Date('2026-03-08T04:00:00Z'),
      },
    });
    const lockTime = getLockoutTime(race);
    expect(lockTime?.toISOString()).toBe('2026-03-07T01:30:00.000Z');
  });

  it('returns sprint qualifying time for a sprint weekend', () => {
    const race = makeRace({
      id: 'sprint',
      round: 2,
      hasSprint: true,
      schedule: {
        fp1: new Date('2026-03-13T03:30:00Z'),
        sprintQualifying: new Date('2026-03-13T07:30:00Z'),
        sprint: new Date('2026-03-14T03:00:00Z'),
        qualifying: new Date('2026-03-14T07:00:00Z'),
        race: new Date('2026-03-15T07:00:00Z'),
      },
    });
    const lockTime = getLockoutTime(race);
    expect(lockTime?.toISOString()).toBe('2026-03-13T07:30:00.000Z');
  });

  it('falls back to qualifying if no FP3 or sprint qualifying', () => {
    const race = makeRace({
      id: 'fallback',
      round: 3,
      hasSprint: false,
      schedule: {
        fp1: new Date('2026-03-06T01:30:00Z'),
        qualifying: new Date('2026-03-07T05:00:00Z'),
        race: new Date('2026-03-08T04:00:00Z'),
      },
    });
    const lockTime = getLockoutTime(race);
    expect(lockTime?.toISOString()).toBe('2026-03-07T05:00:00.000Z');
  });
});

describe('computeLockoutStatus', () => {
  const fp3Time = new Date('2026-03-07T01:30:00Z');
  const raceTime = new Date('2026-03-08T04:00:00Z');
  const races = [
    makeRace({
      id: 'r1',
      round: 1,
      name: 'Australian Grand Prix',
      schedule: {
        fp1: new Date('2026-03-06T01:30:00Z'),
        fp2: new Date('2026-03-06T05:00:00Z'),
        fp3: fp3Time,
        qualifying: new Date('2026-03-07T05:00:00Z'),
        race: raceTime,
      },
    }),
  ];

  it('is unlocked before FP3', () => {
    const now = new Date('2026-03-06T12:00:00Z'); // After FP1 but before FP3
    const result = computeLockoutStatus(races, new Set(), now, null);
    expect(result.isLocked).toBe(false);
    expect(result.captainLocked).toBe(false);
    expect(result.nextRace?.id).toBe('r1');
  });

  it('is locked after FP3', () => {
    const now = new Date('2026-03-07T02:00:00Z'); // After FP3
    const result = computeLockoutStatus(races, new Set(), now, null);
    expect(result.isLocked).toBe(true);
    expect(result.lockReason).toContain('Australian Grand Prix');
    expect(result.captainLocked).toBe(false); // Before race start
  });

  it('captain is locked after race start', () => {
    const now = new Date('2026-03-08T05:00:00Z'); // After race start
    const result = computeLockoutStatus(races, new Set(), now, null);
    expect(result.isLocked).toBe(true);
    expect(result.captainLocked).toBe(true);
  });

  it('returns season complete when all races done', () => {
    const now = new Date('2026-03-09T00:00:00Z');
    const result = computeLockoutStatus(races, new Set(['r1']), now, null);
    expect(result.isLocked).toBe(true);
    expect(result.lockReason).toBe('Season complete');
    expect(result.nextRace).toBeNull();
  });

  it('admin override "locked" forces lock regardless of time', () => {
    const now = new Date('2026-03-06T00:00:00Z'); // Way before FP3
    const result = computeLockoutStatus(races, new Set(), now, 'locked');
    expect(result.isLocked).toBe(true);
    expect(result.lockReason).toContain('admin override');
  });

  it('admin override "unlocked" forces unlock regardless of time', () => {
    const now = new Date('2026-03-07T02:00:00Z'); // After FP3
    const result = computeLockoutStatus(races, new Set(), now, 'unlocked');
    expect(result.isLocked).toBe(false);
    expect(result.captainLocked).toBe(false);
  });

  it('admin override "unlocked" even works with season complete', () => {
    const now = new Date('2026-03-09T00:00:00Z');
    const result = computeLockoutStatus(races, new Set(['r1']), now, 'unlocked');
    expect(result.isLocked).toBe(false);
  });

  it('provides lock and race times', () => {
    const now = new Date('2026-03-06T00:00:00Z');
    const result = computeLockoutStatus(races, new Set(), now, null);
    expect(result.lockTime).toEqual(fp3Time);
    expect(result.raceStartTime).toEqual(raceTime);
  });
});
