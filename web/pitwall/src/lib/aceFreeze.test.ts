import { describe, expect, it } from 'vitest';
import { aceFreezeTime, aceOutlivesLineup, lockTime, sessionMoment, type RaceSchedule } from './lock';

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

// 2026 Singapore R19, as the races document has it
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

  it('is false on a normal weekend, where the two coincide on the server', () => {
    // Measured against the server's roster lock (qualifying), not the portal's displayed one
    // (FP3) — those two have disagreed since before this change. Against the enforced lock the
    // ace freezes at the same moment, so there is nothing extra to say.
    expect(aceOutlivesLineup(NORMAL, false)).toBe(false);
    // the discrepancy itself, pinned so it is visible rather than folklore: the header tells
    // players FP3 while the server locks at qualifying, 3.5 hours later
    expect(lockTime(NORMAL, false)?.toISOString()).toBe('2026-10-03T07:30:00.000Z');
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
