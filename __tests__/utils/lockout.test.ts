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
  // F-103: qualifying, not FP3 — nothing scores at FP3, and the server has always locked at
  // qualifying (effectiveLockTime). This asserted FP3 for as long as the app disagreed.
  it('returns qualifying time for a normal weekend', () => {
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
    expect(lockTime?.toISOString()).toBe('2026-03-07T05:00:00.000Z');
  });

  // F-103: the fallback chain must end at the race, not at null. A schedule with no qualifying
  // time and no deadline means autoLockTeams drops the race from dueRaces and nothing is ever
  // stamped — no isLocked, no ace window — while checkQualifyingResults still scores qualifying
  // off OpenF1 without consulting this document. Late is a deadline; null is not.
  it('falls back to the race when a schedule has no qualifying time', () => {
    const race = makeRace({
      id: 'partial', round: 3, hasSprint: false,
      schedule: {
        fp1: new Date('2026-03-06T01:30:00Z'),
        fp3: new Date('2026-03-07T01:30:00Z'),
        race: new Date('2026-03-08T04:00:00Z'),
      } as never,
    });
    expect(getLockoutTime(race)?.toISOString()).toBe('2026-03-08T04:00:00.000Z');
  });

  it('falls back to qualifying for a sprint weekend whose sprint qualifying has not synced', () => {
    const race = makeRace({
      id: 'unsynced', round: 4, hasSprint: true,
      schedule: {
        fp1: new Date('2026-03-06T01:30:00Z'),
        qualifying: new Date('2026-03-07T05:00:00Z'),
        race: new Date('2026-03-08T04:00:00Z'),
      } as never,
    });
    expect(getLockoutTime(race)?.toISOString()).toBe('2026-03-07T05:00:00.000Z');
  });

  it('has no deadline at all when the schedule cannot give one', () => {
    const race = makeRace({ id: 'empty', round: 5, hasSprint: false, schedule: {} as never });
    expect(getLockoutTime(race)).toBeNull();
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
  // F-103: the lineup locks here, not at FP3
  const qualiTime = new Date('2026-03-07T05:00:00Z');
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
        qualifying: qualiTime,
        race: raceTime,
      },
    }),
  ];

  it('is unlocked before qualifying', () => {
    const now = new Date('2026-03-06T12:00:00Z'); // After FP1, well before qualifying
    const result = computeLockoutStatus(races, new Set(), now, null);
    expect(result.isLocked).toBe(false);
    expect(result.aceLocked).toBe(false);
    expect(result.nextRace?.id).toBe('r1');
  });

  // F-103: the three and a half hours the app used to refuse and the server always allowed.
  it('is still unlocked between FP3 and qualifying', () => {
    const result = computeLockoutStatus(races, new Set(), new Date('2026-03-07T02:00:00Z'), null);
    expect(result.isLocked).toBe(false);
  });

  it('is locked once qualifying starts', () => {
    const now = new Date('2026-03-07T05:30:00Z'); // After qualifying began
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
    expect(result.lockTime).toEqual(qualiTime);
    expect(result.raceStartTime).toEqual(raceTime);
  });
});

describe('serverAceLocked (F-095 / F-098)', () => {
  const HOUR = 60 * 60 * 1000;
  const race = new Date('2026-03-08T14:00:00Z');
  const quali = new Date('2026-03-07T14:00:00Z');
  const QUALI_MARK = 'quali_bahrain_2026';
  const SPRINT_MARK = 'sprint_bahrain_2026';
  const at = (ms: number) => new Date(race.getTime() + ms);

  /** What autoLockTeams stamps: the freeze from the first scoring session to race + 24h. */
  const team = (over: Record<string, unknown> = {}, scoredRaces: string[] = []) => ({
    scoredRaces,
    lockStatus: {
      aceFreezeFrom: quali, aceLockTime: race,
      aceLockUntil: new Date(race.getTime() + 24 * HOUR), aceQualiKey: QUALI_MARK,
      ...over,
    },
  });

  it('is free before the weekend\'s first scoring session', () => {
    expect(serverAceLocked(team(), new Date(quali.getTime() - 1))).toBe(false);
  });

  it('freezes through qualifying and the sprint, until qualifying is actually scored', () => {
    expect(serverAceLocked(team(), quali)).toBe(true);
    expect(serverAceLocked(team(), at(-20 * HOUR))).toBe(true);
    expect(serverAceLocked(team(), at(-2 * HOUR))).toBe(true);
  });

  it('needs the sprint settled too, on a weekend that has one', () => {
    const sprint = (over = {}, scoredRaces: string[] = []) =>
      team({ aceSprintKey: SPRINT_MARK, ...over }, scoredRaces);
    expect(serverAceLocked(sprint({}, [QUALI_MARK]), at(-2 * HOUR))).toBe(true);
    expect(serverAceLocked(sprint({}, [QUALI_MARK, SPRINT_MARK]), at(-2 * HOUR))).toBe(false);
    // a weekend with no sprint asks nothing of the marker
    expect(serverAceLocked(team({}, [QUALI_MARK]), at(-2 * HOUR))).toBe(false);
    expect(serverAceLocked(team({ aceSprintKey: null }, [QUALI_MARK]), at(-2 * HOUR))).toBe(false);
  });

  it('opens the gap when the qualifying key lands in scoredRaces, not on a clock', () => {
    expect(serverAceLocked(team({}, [QUALI_MARK]), at(-2 * HOUR))).toBe(false);
    // another race's key is not this one's
    expect(serverAceLocked(team({}, ['quali_singapore_2026', 'singapore_2026']), at(-2 * HOUR))).toBe(true);
  });

  it('shuts the gap again at lights out', () => {
    expect(serverAceLocked(team({}, [QUALI_MARK]), new Date(race.getTime() - 1))).toBe(false);
    expect(serverAceLocked(team({}, [QUALI_MARK]), race)).toBe(true);
    expect(serverAceLocked(team({}, [QUALI_MARK]), at(2 * HOUR))).toBe(true);
  });

  it('expires, so a freeze nobody cleared cannot hold the ace for ever', () => {
    expect(serverAceLocked(team({}, [QUALI_MARK]), at(24 * HOUR - 1))).toBe(true);
    expect(serverAceLocked(team({}, [QUALI_MARK]), at(24 * HOUR))).toBe(false);
    expect(serverAceLocked(team({}, [QUALI_MARK]), at(72 * HOUR))).toBe(false);
  });

  it('falls back to the race start on a weekend stamped before aceFreezeFrom existed', () => {
    // What F-095 stamped, and what the Bahrain backfill put on 75 live teams.
    const f095 = { lockStatus: { aceLockTime: race, aceLockUntil: new Date(race.getTime() + 24 * HOUR) } };
    expect(serverAceLocked(f095, at(-2 * HOUR))).toBe(false);
    expect(serverAceLocked(f095, race)).toBe(true);
    expect(serverAceLocked(f095, at(24 * HOUR))).toBe(false);
  });

  it('says nothing when there is no window — teams written before the fields existed', () => {
    expect(serverAceLocked({ lockStatus: { aceLockTime: null, aceLockUntil: null } }, race)).toBe(false);
    expect(serverAceLocked({ lockStatus: {} }, race)).toBe(false);
    expect(serverAceLocked({}, race)).toBe(false);
    expect(serverAceLocked(undefined, race)).toBe(false);
    expect(serverAceLocked(null, race)).toBe(false);
  });

  it('freezes nothing on half a window — fail open, not shut', () => {
    expect(serverAceLocked(team({ aceLockUntil: null }), race)).toBe(false);
    expect(serverAceLocked(team({ aceFreezeFrom: null, aceLockTime: null }), race)).toBe(false);
  });

  it('reads the shapes the values actually arrive in', () => {
    // Firestore Timestamp (the web SDK hands this straight through), its admin twin,
    // and what a Timestamp becomes after a round trip through the persisted store.
    const ms = (d: Date) => d.getTime();
    const until = new Date(race.getTime() + 24 * HOUR);
    const shapes: Array<(d: Date) => unknown> = [
      (d) => ({ toMillis: () => ms(d) }),
      (d) => ({ toDate: () => d }),
      (d) => ({ seconds: ms(d) / 1000, nanoseconds: 0 }),
      (d) => ({ _seconds: ms(d) / 1000 }),
      (d) => d.toISOString(),
      (d) => ms(d),
    ];
    for (const shape of shapes) {
      const t = team({ aceFreezeFrom: shape(quali), aceLockTime: shape(race), aceLockUntil: shape(until) });
      expect(serverAceLocked(t, at(-2 * HOUR))).toBe(true);
      expect(serverAceLocked(t, new Date(quali.getTime() - 1))).toBe(false);
    }
  });

  it('treats an unreadable window as no window rather than locking everyone out', () => {
    expect(serverAceLocked(team({ aceFreezeFrom: 'not a date', aceLockTime: null }), race)).toBe(false);
    expect(serverAceLocked(team({ aceLockUntil: {} }), race)).toBe(false);
    expect(serverAceLocked(team({ aceFreezeFrom: new Date('nope'), aceLockTime: null }), race)).toBe(false);
  });

  it('ignores a scoredRaces that is not a list, rather than throwing', () => {
    expect(serverAceLocked({ ...team(), scoredRaces: 'quali_bahrain_2026' as unknown as string[] }, at(-2 * HOUR))).toBe(true);
  });
});
