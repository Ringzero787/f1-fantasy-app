import { serverIsNewer, toMillis } from '../../src/utils/syncFreshness';

describe('metadata sync: the server copy wins when it is newer (F-101)', () => {
  const t0 = Date.UTC(2026, 9, 5, 0, 56, 0);
  const t1 = Date.UTC(2026, 9, 5, 1, 27, 0);

  it('reads every shape updatedAt takes', () => {
    expect(toMillis(new Date(t0))).toBe(t0);
    expect(toMillis(t0)).toBe(t0);
    expect(toMillis(new Date(t0).toISOString())).toBe(t0);
    expect(toMillis({ seconds: t0 / 1000, nanoseconds: 0 })).toBe(t0);          // persisted Timestamp
    expect(toMillis({ _seconds: t0 / 1000, _nanoseconds: 5e8 })).toBe(t0 + 500);
    expect(toMillis({ toMillis: () => t0 })).toBe(t0);                           // live Timestamp
    expect(toMillis('not a date')).toBeNull();
    expect(toMillis(undefined)).toBeNull();
  });

  it('skips the push when the server was written after this device last changed the team', () => {
    // the reported case: renamed on the web at 00:56, app opened with a copy from before that
    expect(serverIsNewer(new Date(t0 - 86400000), { seconds: t0 / 1000, nanoseconds: 0 })).toBe(true);
  });

  it('pushes when this device changed the team after the server last wrote it', () => {
    expect(serverIsNewer(new Date(t1), { seconds: t0 / 1000, nanoseconds: 0 })).toBe(false);
  });

  it('treats an unreadable local time as stale, and an unreadable server time as unknown', () => {
    expect(serverIsNewer(undefined, new Date(t0))).toBe(true);
    expect(serverIsNewer(new Date(t0), undefined)).toBe(false);
  });
});
