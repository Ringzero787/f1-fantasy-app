import { runStoreAction } from '../../src/simple/grid/storeAction';
import { rosterConstructor, computeTiles } from '../../src/simple/grid/tileState';
import type { FantasyTeam } from '../../src/types';

describe('runStoreAction', () => {
  const slot = () => { let err: string | null = 'stale'; return { clear: () => { err = null; }, read: () => err, set: (e: string) => { err = e; } }; };
  it('clears a stale error and resolves null on success', async () => {
    const s = slot();
    expect(await runStoreAction(async () => {}, s)).toBeNull();
  });
  it('resolves the message the action left in the store', async () => {
    const s = slot();
    expect(await runStoreAction(async () => { s.set('Teams are locked'); }, s)).toBe('Teams are locked');
  });
  it('turns a thrown error into a message', async () => {
    const s = slot();
    expect(await runStoreAction(async () => { throw new Error('offline'); }, s)).toBe('offline');
  });
});

describe('rosterConstructor', () => {
  it('ignores the inherited Object constructor and non-roster values', () => {
    expect(rosterConstructor({ drivers: [] })).toBeNull();          // inherited function only
    expect(rosterConstructor({ constructor: null })).toBeNull();
    expect(rosterConstructor({ constructor: { name: 'x' } })).toBeNull();
    expect(rosterConstructor(null)).toBeNull();
  });
  it('returns an own constructor pick, and the grid renders it', () => {
    const team = { drivers: [], constructor: { constructorId: 'apex', name: 'Apex', purchasePrice: 1, currentPrice: 1, pointsScored: 0, racesHeld: 0 } };
    expect(rosterConstructor(team)?.constructorId).toBe('apex');
    const tiles = computeTiles(team as unknown as FantasyTeam, { teamSize: 5, defaultContract: 3, lastRace: {}, prevRace: {}, numbers: {}, showCarNumbers: true });
    expect(tiles[5]).toMatchObject({ kind: 'constructor', id: 'apex' });
    expect(computeTiles({ drivers: [] } as unknown as FantasyTeam, { teamSize: 5, defaultContract: 3, lastRace: {}, prevRace: {}, numbers: {}, showCarNumbers: true })[5]).toEqual({ kind: 'empty', slot: 'constructor' });
  });
});
