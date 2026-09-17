/**
 * F-045: the roster callables hand back the projected team; the app must
 * read it the same way it reads a Firestore doc, with the two timestamps the
 * UI compares turned into Dates whatever shape they crossed the wire in.
 */
jest.mock('../../src/config/firebase', () => ({
  db: {},
  functions: {},
  httpsCallable: () => jest.fn(),
}));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(), doc: jest.fn(), getDoc: jest.fn(), getDocs: jest.fn(), updateDoc: jest.fn(),
  addDoc: jest.fn(), deleteDoc: jest.fn(), query: jest.fn(), where: jest.fn(), orderBy: jest.fn(),
  limit: jest.fn(), serverTimestamp: jest.fn(), increment: jest.fn(),
}));

import { teamFromCallable } from '../../src/services/team.service';

const base = { id: 'T1', userId: 'u1', drivers: [], constructor: null, budget: 1000 };

describe('teamFromCallable', () => {
  it('rejects anything that is not a team-shaped payload for the requested team', () => {
    expect(teamFromCallable(undefined, 'T1')).toBeNull();
    expect(teamFromCallable(null, 'T1')).toBeNull();
    expect(teamFromCallable({ id: 'T1' }, 'T1')).toBeNull();
    expect(teamFromCallable({ drivers: [] }, 'T1')).toBeNull();
    expect(teamFromCallable({ ...base, id: 'T2' }, 'T1')).toBeNull(); // someone else's team
  });

  it('turns ISO strings and serialised Timestamps into Dates', () => {
    const t = teamFromCallable({
      ...base,
      updatedAt: '2026-09-17T15:00:00.000Z',
      createdAt: { _seconds: 1_772_000_000, _nanoseconds: 0 },
    }, 'T1')!;
    expect(t.updatedAt).toBeInstanceOf(Date);
    expect(t.updatedAt.toISOString()).toBe('2026-09-17T15:00:00.000Z');
    expect(t.createdAt).toBeInstanceOf(Date);
    expect(t.createdAt.getTime()).toBe(1_772_000_000_000);
  });

  it('leaves the rest of the document untouched and tolerates missing timestamps', () => {
    const t = teamFromCallable({ ...base, budget: 375, lockedPoints: 40 }, 'T1') as any;
    expect(t.budget).toBe(375);
    expect(t.lockedPoints).toBe(40);
    expect(t.constructor).toBeNull();
    expect('updatedAt' in t).toBe(false);
  });
});
