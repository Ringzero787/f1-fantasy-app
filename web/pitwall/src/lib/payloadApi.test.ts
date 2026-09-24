import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPayload } from './payloadApi';

// The Firestore module is loaded on demand inside `firestore()`, so the whole helper is stubbed.
const getDocs = vi.fn();
const collection = vi.fn((_db: unknown, name: string) => ({ name }));
const query = vi.fn((...args: unknown[]) => ({ args }));
const orderBy = vi.fn((field: string, dir: string) => ({ orderBy: field, dir }));
const limit = vi.fn((n: number) => ({ limit: n }));

vi.mock('./firebase', () => ({
  firestore: async () => ({ m: { getDocs, collection, query, orderBy, limit }, db: {} }),
  callable: vi.fn(),
  auth: vi.fn(),
  firebaseApp: vi.fn(),
}));

const DOC = {
  asOf: '2026-09-24T19:00:00.000Z',
  round: { number: 17 },
  drivers: [{ id: 'stone', med: 58, price: 400 }],
  constructors: [],
};
const snapshot = (docs: unknown[]) => ({ docs: docs.map((d) => ({ data: () => d })) });

beforeEach(() => {
  getDocs.mockReset();
  collection.mockClear();
  orderBy.mockClear();
});

describe('loadPayload', () => {
  it('asks for the paid document with a pass and the free one without', async () => {
    getDocs.mockResolvedValue(snapshot([DOC]));
    await loadPayload(true);
    expect(collection).toHaveBeenLastCalledWith({}, 'pw_pages');
    await loadPayload(false);
    expect(collection).toHaveBeenLastCalledWith({}, 'pw_public');
  });

  it('takes the newest by asOf, since document ids sort as text', async () => {
    getDocs.mockResolvedValue(snapshot([DOC]));
    await loadPayload(true);
    expect(orderBy).toHaveBeenCalledWith('asOf', 'desc');
    expect(limit).toHaveBeenCalledWith(1);
  });

  it('returns the coerced payload', async () => {
    getDocs.mockResolvedValue(snapshot([DOC]));
    const p = await loadPayload(true);
    expect(p?.round.number).toBe(17);
    expect(p?.drivers[0].med).toBe(58);
    expect(p?.example).toBe(false);
  });

  it('falls back to null when nothing is published, so the example set stands in', async () => {
    getDocs.mockResolvedValue(snapshot([]));
    expect(await loadPayload(true)).toBeNull();
  });

  it('falls back to null on a document with no drivers rather than rendering an empty board', async () => {
    getDocs.mockResolvedValue(snapshot([{ ...DOC, drivers: [] }]));
    expect(await loadPayload(true)).toBeNull();
  });

  it('treats a refusal by the rules as "no payload", not an error to show', async () => {
    getDocs.mockRejectedValue(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
    await expect(loadPayload(true)).resolves.toBeNull();
  });
});
