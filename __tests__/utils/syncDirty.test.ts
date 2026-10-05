import { clearDirty, dirtyMetadataKeys, markDirty, METADATA_SYNC_KEYS } from '../../src/utils/syncDirty';

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
  it('never lists a server-owned field', () => {
    for (const k of ['drivers', 'budget', 'totalPoints', 'isLocked']) expect(METADATA_SYNC_KEYS).not.toContain(k);
  });
});
