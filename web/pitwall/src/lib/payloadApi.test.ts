import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPayload, toPayload } from './payloadApi';

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

describe('toPayload: the forecast map and the wire', () => {
  const frame = (n: number) => ({ offsetH: 0, at: '2026-09-27T11:00:00.000Z', rainMm: Array.from({ length: n }, () => 0.2), windFromDeg: 315, windKph: 22 });
  const map = (frames: unknown[]) => ({ center: { lat: 40.37, lon: 49.85 }, radius: 2, spacingKm: 40, sessions: [{ key: 'race', label: 'Race', at: '2026-09-27T11:00:00.000Z', frames }] });

  it('keeps a map whose frames have one cell per grid point', () => {
    const p = toPayload({ ...DOC, weatherMap: map([frame(25)]) });
    expect(p.weatherMap?.sessions[0].frames).toHaveLength(1);
    expect(p.weatherMap?.radius).toBe(2);
  });

  it('drops a frame with the wrong number of cells, and the map when no frame survives', () => {
    // a scrambled grid is worse than no grid: 24 cells would shift every row by one
    const p = toPayload({ ...DOC, weatherMap: map([frame(24), frame(25)]) });
    expect(p.weatherMap?.sessions[0].frames).toHaveLength(1);
    expect(toPayload({ ...DOC, weatherMap: map([frame(24)]) }).weatherMap).toBeNull();
    expect(toPayload({ ...DOC, weatherMap: 'no' }).weatherMap).toBeNull();
    expect(toPayload({ ...DOC, weatherMap: { radius: 2, spacingKm: 40, sessions: [] } }).weatherMap).toBeNull();
  });

  it('reads a silent cell as unknown rather than dry', () => {
    const f = { ...frame(25), rainMm: [null, 'x', 1.5, ...Array.from({ length: 22 }, () => 0)] };
    const p = toPayload({ ...DOC, weatherMap: map([f]) });
    expect(p.weatherMap?.sessions[0].frames[0].rainMm.slice(0, 3)).toEqual([null, null, 1.5]);
  });

  it('lets only an https link through on a headline, and drops a kind it does not know', () => {
    const news = [
      { kind: 'PENALTY', entity: 'stone', tone: '-', text: 'Grid drop', sources: 'F1', detail: '', url: 'https://example.com/a', publishedAt: '2026-09-25T10:00:00.000Z' },
      { kind: 'PENALTY', entity: null, tone: '?', text: 'Odd link', sources: 'F1', detail: '', url: 'javascript:alert(1)', publishedAt: '' },
      { kind: 'GOSSIP', text: 'Not a kind we show', url: 'https://example.com/c' },
    ];
    const p = toPayload({ ...DOC, news });
    expect(p.news.map((n) => n.url)).toEqual(['https://example.com/a', '']);
    expect(p.news[1].tone).toBe('•');
  });
});
