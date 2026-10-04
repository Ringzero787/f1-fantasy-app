/**
 * Unit tests for lockout utility
 */

import {
  getNextIncompleteRace,
  getLockoutTime,
  computeLockoutStatus,
  serverAceLocked,
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
  // Use a time before race start so races aren't implicitly complete
  const beforeRace = new Date('2026-03-06T00:00:00Z');

  it('returns the first race when none are completed', () => {
    const result = getNextIncompleteRace(races, new Set(), beforeRace);
    expect(result?.id).toBe('r1');
  });

  it('returns the second race when first is completed', () => {
    const result = getNextIncompleteRace(races, new Set(['r1']), beforeRace);
    expect(result?.id).toBe('r2');
  });

  it('returns the third race when first two are completed', () => {
    const result = getNextIncompleteRace(races, new Set(['r1', 'r2']), beforeRace);
    expect(result?.id).toBe('r3');
  });

  it('returns null when all races are completed', () => {
    const result = getNextIncompleteRace(races, new Set(['r1', 'r2', 'r3']), beforeRace);
    expect(result).toBeNull();
  });

  it('handles unsorted races correctly', () => {
    const unsorted = [races[2], races[0], races[1]];
    const result = getNextIncompleteRace(unsorted, new Set(['r1']), beforeRace);
    expect(result?.id).toBe('r2');
  });

  it('skips races whose race time is more than 4 hours in the past (implicit complete)', () => {
    const racesWithDates = [
      makeRace({ id: 'r1', round: 1, schedule: {
        fp1: new Date('2026-03-06T01:30:00Z'), fp2: new Date('2026-03-06T05:00:00Z'),
        fp3: new Date('2026-03-07T01:30:00Z'), qualifying: new Date('2026-03-07T05:00:00Z'),
        race: new Date('2026-03-08T04:00:00Z'),
      }}),
      makeRace({ id: 'r2', round: 2, schedule: {
        fp1: new Date('2026-03-20T01:30:00Z'), fp2: new Date('2026-03-20T05:00:00Z'),
        fp3: new Date('2026-03-21T01:30:00Z'), qualifying: new Date('2026-03-21T05:00:00Z'),
        race: new Date('2026-03-22T04:00:00Z'),
      }}),
    ];
    // 5 hours after r1 race start — r1 implicitly complete, r2 still upcoming
    const wellAfterR1 = new Date('2026-03-08T09:00:00Z');
    const result = getNextIncompleteRace(racesWithDates, new Set(), wellAfterR1);
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
    expect(result.aceLocked).toBe(false);
    expect(result.nextRace?.id).toBe('r1');
  });

  it('is locked after FP3', () => {
    const now = new Date('2026-03-07T02:00:00Z'); // After FP3
    const result = computeLockoutStatus(races, new Set(), now, null);
    expect(result.isLocked).toBe(true);
    expect(result.lockReason).toContain('Australian Grand Prix');
    expect(result.aceLocked).toBe(false); // Before race start
  });

  it('ace is locked after race start', () => {
    const now = new Date('2026-03-08T05:00:00Z'); // After race start
    const result = computeLockoutStatus(races, new Set(), now, null);
    expect(result.isLocked).toBe(true);
    expect(result.aceLocked).toBe(true);
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
    expect(result.aceLocked).toBe(false);
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

describe('serverAceLocked (F-095)', () => {
  const raceStart = new Date('2026-03-08T14:00:00Z');
  const before = new Date('2026-03-08T13:59:00Z');
  const after = new Date('2026-03-08T14:01:00Z');

  it('is open before the race and shut from lights out', () => {
    expect(serverAceLocked({ aceLockTime: raceStart }, true, before)).toBe(false);
    expect(serverAceLocked({ aceLockTime: raceStart }, true, raceStart)).toBe(true);
    expect(serverAceLocked({ aceLockTime: raceStart }, true, after)).toBe(true);
  });

  it('is ignored on an unlocked team, so a deadline left over from last race cannot freeze the ace', () => {
    expect(serverAceLocked({ aceLockTime: raceStart }, false, after)).toBe(false);
  });

  it('says nothing when there is no deadline — teams written before the field existed', () => {
    expect(serverAceLocked({ aceLockTime: null }, true, after)).toBe(false);
    expect(serverAceLocked({}, true, after)).toBe(false);
    expect(serverAceLocked(undefined, true, after)).toBe(false);
    expect(serverAceLocked(null, true, after)).toBe(false);
  });

  it('reads the shapes the value actually arrives in', () => {
    // Firestore Timestamp (the web SDK hands this straight through), its admin twin,
    // and what a Timestamp becomes after a round trip through the persisted store.
    expect(serverAceLocked({ aceLockTime: { toMillis: () => raceStart.getTime() } }, true, after)).toBe(true);
    expect(serverAceLocked({ aceLockTime: { toDate: () => raceStart } }, true, after)).toBe(true);
    expect(serverAceLocked({ aceLockTime: { seconds: raceStart.getTime() / 1000, nanoseconds: 0 } }, true, after)).toBe(true);
    expect(serverAceLocked({ aceLockTime: { _seconds: raceStart.getTime() / 1000 } }, true, after)).toBe(true);
    expect(serverAceLocked({ aceLockTime: raceStart.toISOString() }, true, after)).toBe(true);
    expect(serverAceLocked({ aceLockTime: raceStart.getTime() }, true, after)).toBe(true);
    expect(serverAceLocked({ aceLockTime: raceStart.toISOString() }, true, before)).toBe(false);
  });

  it('treats an unreadable deadline as no deadline rather than locking everyone out', () => {
    expect(serverAceLocked({ aceLockTime: 'not a date' }, true, after)).toBe(false);
    expect(serverAceLocked({ aceLockTime: {} }, true, after)).toBe(false);
    expect(serverAceLocked({ aceLockTime: new Date('nope') }, true, after)).toBe(false);
  });
});
