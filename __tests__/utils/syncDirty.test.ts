import { adoptServer, clearDirty, dirtyMetadataKeys, markDirty, METADATA_SYNC_KEYS } from '../../src/utils/syncDirty';

describe('metadata sync pushes only what this device changed (F-101)', () => {
  it('a copy nobody edited has nothing to push', () => {
    expect(dirtyMetadataKeys({})).toEqual([]);
    expect(dirtyMetadataKeys({ dirtyKeys: undefined })).toEqual([]);
  });
  it('records the keys an edit touched and nothing else', () => {
    const t = markDirty({ dirtyKeys: undefined }, ['aceDriverId', 'aceConstructorId']);
    expect(dirtyMetadataKeys(t)).toEqual(['aceDriverId', 'aceConstructorId']);
    expect(dirtyMetadataKeys(t)).not.toContain('name');   // the reported case: an ace change must not carry a stale name
  });
  it('accumulates across edits and ignores keys the sync may not write', () => {
    const t = markDirty(markDirty({ dirtyKeys: ['drivers' as never] }, ['leagueId']), ['avatarUrl']);
    expect(dirtyMetadataKeys(t)).toEqual(['avatarUrl', 'leagueId']);
  });
  it('clears what was pushed and keeps what was not', () => {
    const t = markDirty({ dirtyKeys: undefined }, ['leagueId', 'avatarUrl']);
    expect(clearDirty(t, ['leagueId']).dirtyKeys).toEqual(['avatarUrl']);
    expect(clearDirty(t, ['leagueId', 'avatarUrl']).dirtyKeys).toBeUndefined();
  });
  it('keeps a key whose value changed again while the push was in flight', () => {
    // detach during a slow sync: the push carried leagueId L, the store now holds null
    const pushed = { leagueId: 'L' };
    const nowNull = markDirty({ leagueId: null, dirtyKeys: undefined }, ['leagueId']);
    expect(clearDirty(nowNull, ['leagueId'], pushed).dirtyKeys).toEqual(['leagueId']);
    const nowL = markDirty({ leagueId: 'L', dirtyKeys: undefined }, ['leagueId']);
    expect(clearDirty(nowL, ['leagueId'], pushed).dirtyKeys).toBeUndefined();
  });
  it('a reloaded server copy keeps the local value of a key still waiting to be pushed', () => {
    type T = { name: string; aceDriverId: string; leagueId: string; dirtyKeys?: string[] };
    const local: T = markDirty<T>({ name: 'LEGIT TEAM', aceDriverId: 'ver', leagueId: 'L' }, ['aceDriverId']);
    const server: T = { name: 'Late Brakers', aceDriverId: 'ham', leagueId: 'L' };
    const adopted = adoptServer(local, server);
    expect(adopted.name).toBe('Late Brakers');       // the portal's rename wins
    expect(adopted.aceDriverId).toBe('ver');         // the pending ace edit survives
    expect(adopted.dirtyKeys).toEqual(['aceDriverId']);
    expect(adoptServer<T>({ name: 'x', aceDriverId: 'a', leagueId: 'L' }, server)).toBe(server);
  });
  it('never lists a server-owned field', () => {
    for (const k of ['drivers', 'budget', 'totalPoints', 'isLocked']) expect(METADATA_SYNC_KEYS).not.toContain(k);
  });
});
