/**
 * F-101: the metadata sync writes only what this device changed, and nothing when it changed
 * nothing — the case that let a rehydrated copy revert a rename made on the Pit Wall portal.
 */
const updateDoc: jest.Mock = jest.fn(async () => undefined);
jest.mock('../../src/config/firebase', () => ({ db: {}, functions: {}, httpsCallable: () => () => ({ data: { available: true } }) }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  doc: jest.fn((_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` })),
  query: jest.fn(), where: jest.fn(), limit: jest.fn(), orderBy: jest.fn(),
  getDoc: jest.fn(), getDocs: jest.fn(), setDoc: jest.fn(), addDoc: jest.fn(), deleteDoc: jest.fn(),
  updateDoc: (ref: unknown, data: unknown) => updateDoc(ref, data),
  serverTimestamp: () => 'SERVER_TIME',
  Timestamp: { now: () => ({}) },
  writeBatch: jest.fn(), runTransaction: jest.fn(), arrayUnion: jest.fn(), arrayRemove: jest.fn(), increment: jest.fn(),
}));
jest.mock('firebase/functions', () => ({ httpsCallable: () => () => ({ data: { available: true } }) }));

import { teamService } from '../../src/services/team.service';
import { markDirty } from '../../src/utils/syncDirty';
import type { FantasyTeam } from '../../src/types';

const base = { id: 't1', userId: 'u1', leagueId: 'L', name: 'Late Brakers', drivers: [], budget: 100, totalPoints: 0, createdAt: new Date(), updatedAt: new Date() } as unknown as FantasyTeam;

describe('syncTeam pushes only what this device changed (F-101)', () => {
  beforeEach(() => updateDoc.mockClear());

  it('writes nothing for a copy nobody edited — a rehydrated team cannot revert a web rename', async () => {
    const res = await teamService.syncTeam({ ...base, name: 'LEGIT TEAM' });
    expect(res.pushed).toEqual([]);
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('writes only the edited keys, never the name alongside an ace change', async () => {
    const edited = markDirty({ ...base, name: 'LEGIT TEAM', aceDriverId: 'ver' }, ['aceDriverId', 'aceConstructorId']);
    const res = await teamService.syncTeam(edited);
    expect(res.pushed).toEqual(['aceDriverId', 'aceConstructorId']);
    expect(updateDoc).toHaveBeenCalledTimes(1);
    const payload = updateDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).toEqual({ aceDriverId: 'ver', aceConstructorId: null, updatedAt: 'SERVER_TIME' });
    expect(payload).not.toHaveProperty('name');
    expect(payload).not.toHaveProperty('dirtyKeys');
  });

  it('never writes a server-owned field even if it is marked', async () => {
    const tampered = { ...base, dirtyKeys: ['drivers', 'budget', 'leagueId'] };
    const res = await teamService.syncTeam(tampered);
    expect(res.pushed).toEqual(['leagueId']);
    expect(Object.keys(updateDoc.mock.calls[0][1] as object)).toEqual(['leagueId', 'updatedAt']);
  });
});
