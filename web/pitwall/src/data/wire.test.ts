import { describe, expect, it } from 'vitest';
import { EMPTY_PREFS, forBriefing, markRead, newsKey, rank, rate, taste, toPrefs, unread } from './wire';
import type { NewsItem } from './types';

const item = (i: number, entity: string | null, kind: NewsItem['kind']): NewsItem => ({
  kind, entity, tone: '•', text: `Story ${i}`, sources: 'F1', detail: '', url: `https://x/${i}`, publishedAt: '2026-09-25T10:00:00.000Z',
});
// the worker's editorial order: 1 leads
const items = [item(1, 'stone', 'PENALTY'), item(2, 'reed', 'QUALIFYING'), item(3, 'stone', 'RACE'), item(4, null, 'REGULATION'), item(5, 'reed', 'NEWS')];

describe('newsKey', () => {
  it('is the same for the same story and safe for a document field', () => {
    expect(newsKey(items[0])).toBe(newsKey({ ...items[0], text: 'retitled' }));
    expect(newsKey(items[0])).not.toBe(newsKey(items[1]));
    expect(newsKey(items[0])).toMatch(/^n[0-9a-f]+$/);
  });
  it('falls back to the headline when there is no link', () => {
    expect(newsKey({ url: '', text: 'a' })).not.toBe(newsKey({ url: '', text: 'b' }));
  });
});

describe('reading', () => {
  it('a headline marked read leaves the briefing and the next one takes its place', () => {
    const p1 = markRead(EMPTY_PREFS, newsKey(items[0]), 1);
    expect(unread(items, p1).map((n) => n.text)).toEqual(['Story 2', 'Story 3', 'Story 4', 'Story 5']);
    expect(forBriefing(items, p1, 2).map((n) => n.text)).toEqual(['Story 2', 'Story 3']);
  });

  it('keeps the history bounded so the document stays small', () => {
    let p = EMPTY_PREFS;
    for (let i = 0; i < 450; i += 1) p = markRead(p, `k${i}`, i);
    expect(Object.keys(p.read)).toHaveLength(400);
    expect(p.read.k0).toBeUndefined();     // the oldest fell off
    expect(p.read.k449).toBe(449);
  });
});

describe('rating', () => {
  it('learns a taste from thumbs on entity and kind, and the same thumb again clears it', () => {
    let p = rate(EMPTY_PREFS, newsKey(items[0]), 1);      // stone, PENALTY: up
    p = rate(p, newsKey(items[1]), -1);                    // reed, QUALIFYING: down
    expect(taste(items, p)).toEqual({ entity: { stone: 1, reed: -1 }, kind: { PENALTY: 1, QUALIFYING: -1 } });
    expect(rate(p, newsKey(items[0]), 1).liked[newsKey(items[0])]).toBeUndefined();
  });

  it('moves a liked driver up without hiding what happened', () => {
    // a thumbs up on story 3's driver lifts story 3 (same driver) above story 2
    const p = rate(EMPTY_PREFS, newsKey(items[3]), 1);     // REGULATION, no entity: kind only
    const p2 = rate(p, newsKey(items[3]), 1);              // cleared again
    expect(rank(items, p2).map((n) => n.text)).toEqual(['Story 1', 'Story 2', 'Story 3', 'Story 4', 'Story 5']);
    const liked = rate(EMPTY_PREFS, newsKey(items[2]), 1); // stone, RACE
    const order = rank(items, liked).map((n) => n.text);
    expect(order.indexOf('Story 3')).toBeLessThan(order.indexOf('Story 2'));
    // the penalty still leads: taste moves things a step or two, not to the top by itself
    expect(order[0]).toBe('Story 1');
  });

  it('a thumbs-down demotes but does not remove', () => {
    const p = rate(EMPTY_PREFS, newsKey(items[0]), -1);    // stone, PENALTY: down
    const order = rank(items, p).map((n) => n.text);
    expect(order).toContain('Story 1');
    expect(order[0]).not.toBe('Story 1');
  });
});

describe('toPrefs', () => {
  it('keeps only well-formed marks', () => {
    expect(toPrefs({ read: { a: 1, b: 'x' }, liked: { a: 1, b: 2, c: -1 }, junk: true })).toEqual({ read: { a: 1 }, liked: { a: 1, c: -1 } });
    expect(toPrefs(null)).toEqual(EMPTY_PREFS);
  });
});
