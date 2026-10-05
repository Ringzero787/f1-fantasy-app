import { describe, expect, it } from 'vitest';
import { aceFreezeLine, aceFreezeTime, aceOutlivesLineup, lockTime, sessionMoment, type RaceSchedule } from './lock';

/**
 * F-098. Three sessions score with the Ace applied, so it freezes when the first of them begins.
 * On a normal weekend that is qualifying, which is also when the server locks the lineup, so the
 * header has nothing extra to say. On a sprint weekend the lineup goes at sprint qualifying on
 * Friday and the Ace survives until Saturday's sprint — and "Lineups locked" on its own reads as
 * though everything is settled, which is what this line exists to correct.
 *
 * These mirror functions/test/aceFreezeStart.test.js. If the two ever disagree the portal is
 * telling people something the rules will not honour.
 */
const d = (iso: string) => new Date(iso);

// 2026 Singapore R19, read off the LIVE races/singapore_2026 document. Note seedData.ts has the
// sprint an hour later; the OpenF1 sync supersedes the seed, so these are the real times.
// (A review flagged the difference as a mistake in this fixture — it is not.)
const SPRINT: RaceSchedule = {
  fp1: d('2026-10-09T08:30:00Z'),
  sprintQualifying: d('2026-10-09T12:30:00Z'),
  sprint: d('2026-10-10T09:00:00Z'),
  qualifying: d('2026-10-10T13:00:00Z'),
  race: d('2026-10-11T12:00:00Z'),
};
// a normal weekend: Bahrain at Sepang, R18
const NORMAL: RaceSchedule = {
  fp3: d('2026-10-03T07:30:00Z'),
  qualifying: d('2026-10-03T11:00:00Z'),
  race: d('2026-10-04T09:00:00Z'),
};

describe('aceFreezeTime', () => {
  it('is the sprint on a sprint weekend, which comes before qualifying', () => {
    expect(aceFreezeTime(SPRINT, true)?.toISOString()).toBe('2026-10-10T09:00:00.000Z');
  });

  it('is qualifying on a normal weekend', () => {
    expect(aceFreezeTime(NORMAL, false)?.toISOString()).toBe('2026-10-03T11:00:00.000Z');
  });

  it('reads the sprint off its time, not the flag', () => {
    // the flag is only ever set to true; a stale false must not push the freeze past the sprint
    expect(aceFreezeTime({ ...SPRINT, }, false)?.toISOString()).toBe('2026-10-10T09:00:00.000Z');
  });

  it('takes qualifying when a sprint is somehow scheduled after it', () => {
    // mirrors functions/test/aceFreezeStart.test.js: the earlier of the two wins, whichever it is
    const reordered: RaceSchedule = { ...SPRINT, sprint: d('2026-10-10T16:00:00Z') };
    expect(aceFreezeTime(reordered, true)?.toISOString()).toBe('2026-10-10T13:00:00.000Z');
  });

  it('falls back to qualifying for a sprint round missing both sprint times', () => {
    const bare: RaceSchedule = { qualifying: SPRINT.qualifying, race: SPRINT.race };
    expect(aceFreezeTime(bare, true)?.toISOString()).toBe('2026-10-10T13:00:00.000Z');
  });

  it('falls back to sprint qualifying when a sprint round has no sprint time yet', () => {
    const unpublished: RaceSchedule = { sprintQualifying: SPRINT.sprintQualifying, qualifying: SPRINT.qualifying, race: SPRINT.race };
    expect(aceFreezeTime(unpublished, true)?.toISOString()).toBe('2026-10-09T12:30:00.000Z');
    // and without the flag there is no sprint to protect, so qualifying is right
    expect(aceFreezeTime(unpublished, false)?.toISOString()).toBe('2026-10-10T13:00:00.000Z');
  });

  it('falls back rather than returning nothing on a partial schedule', () => {
    expect(aceFreezeTime({ race: NORMAL.race }, false)?.toISOString()).toBe('2026-10-04T09:00:00.000Z');
    expect(aceFreezeTime({}, false)).toBeNull();
  });
});

describe('aceOutlivesLineup — whether the header says anything at all', () => {
  it('is true on a sprint weekend: Friday lineup lock, Saturday ace freeze', () => {
    expect(lockTime(SPRINT, true)?.toISOString()).toBe('2026-10-09T12:30:00.000Z');
    expect(aceOutlivesLineup(SPRINT, true)).toBe(true);
  });

  it('is false on a normal weekend, where the lineup lock and the ace freeze are one moment', () => {
    expect(aceOutlivesLineup(NORMAL, false)).toBe(false);
    // Both are qualifying. They differed while the portal displayed FP3 (F-103) — fixed, so this
    // now pins the agreement rather than the discrepancy, and `aceOutlivesLineup` can go back to
    // the exported lockTime instead of a private copy of the server's rule.
    expect(lockTime(NORMAL, false)?.toISOString()).toBe('2026-10-03T11:00:00.000Z');
    expect(aceFreezeTime(NORMAL, false)?.toISOString()).toBe('2026-10-03T11:00:00.000Z');
  });

  it('is false when the schedule cannot answer', () => {
    expect(aceOutlivesLineup({}, false)).toBe(false);
    expect(aceOutlivesLineup({ race: NORMAL.race }, false)).toBe(false);
  });
});

describe('sessionMoment', () => {
  it('names the moment unambiguously', () => {
    expect(sessionMoment(aceFreezeTime(SPRINT, true))).toBe('Sat 10 Oct 09:00 UTC');
  });
  it('is null without one', () => {
    expect(sessionMoment(null)).toBeNull();
  });
});

describe('aceFreezeLine — what the header renders, decided at render time', () => {
  const at = aceFreezeTime(SPRINT, true)!.getTime();

  it('names the moment and counts down to it', () => {
    expect(aceFreezeLine(at, d('2026-10-09T13:00:00Z'))).toEqual({ in: '20h 00m', at: 'Sat 10 Oct 09:00 UTC' });
  });

  it('disappears once the freeze has passed, rather than counting up or saying LOCKED', () => {
    expect(aceFreezeLine(at, d('2026-10-10T09:00:00Z'))).toBeNull();
    expect(aceFreezeLine(at, d('2026-10-10T09:30:00Z'))).toBeNull();
  });

  it('says nothing without a moment — a normal weekend, or no team', () => {
    expect(aceFreezeLine(null, d('2026-10-09T13:00:00Z'))).toBeNull();
    expect(aceFreezeLine(Number.NaN, d('2026-10-09T13:00:00Z'))).toBeNull();
  });

  it('is derived, not stored, so a tab left open does not keep promising a shut window', () => {
    // the same input moment, read at two different times: the words change and then stop
    expect(aceFreezeLine(at, d('2026-10-05T22:00:00Z'))?.in).toBe('4d 11h');
    expect(aceFreezeLine(at, d('2026-10-10T08:45:00Z'))?.in).toBe('0h 15m');
    expect(aceFreezeLine(at, d('2026-10-10T09:01:00Z'))).toBeNull();
  });
});
