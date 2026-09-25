/**
 * The reader's own wire (F-071): what they have read, what they rated, and how that reorders
 * what they see next.
 *
 * The owner's call: nobody curates the feed for distribution. Readers mark headlines read and
 * they leave the page, the next ten from the window take their place, and a thumbs up or down
 * teaches the page what this reader wants more or less of. The "training" is deliberately a
 * small, legible model — a weight per driver, team and kind of story, learned from ratings —
 * because a reader should be able to see why something is at the top.
 *
 * Pure. Persistence lives in `lib/wirePrefs.ts`.
 */
import type { NewsItem, NewsKind } from './types';

export type Rating = 1 | -1;

export interface WirePrefs {
  /** headline key -> epoch ms it was marked read */
  read: Record<string, number>;
  /** headline key -> thumbs up (1) or down (-1) */
  liked: Record<string, Rating>;
}

export const EMPTY_PREFS: WirePrefs = { read: {}, liked: {} };

/** A headline's identity: the story at its source, which survives a republish. */
export const newsKey = (n: Pick<NewsItem, 'url' | 'text'>): string => {
  const raw = n.url || n.text;
  // a short, Firestore-safe key: djb2 over the url, hex
  let h = 5381;
  for (let i = 0; i < raw.length; i += 1) h = ((h << 5) + h + raw.charCodeAt(i)) | 0;
  return `n${(h >>> 0).toString(16)}`;
};

export interface Taste {
  entity: Record<string, number>;
  kind: Partial<Record<NewsKind, number>>;
}

/**
 * What the ratings say this reader likes: +1 per thumbs up and -1 per thumbs down, on the
 * headline's entity and on its kind. Only headlines still in the payload can be learned from, so
 * a taste is recomputed from the current list rather than stored.
 */
export function taste(items: NewsItem[], prefs: WirePrefs): Taste {
  const out: Taste = { entity: {}, kind: {} };
  for (const n of items) {
    const r = prefs.liked[newsKey(n)];
    if (!r) continue;
    if (n.entity) out.entity[n.entity] = (out.entity[n.entity] ?? 0) + r;
    out.kind[n.kind] = (out.kind[n.kind] ?? 0) + r;
  }
  return out;
}

/** Headlines this reader has not marked read. */
export const unread = (items: NewsItem[], prefs: WirePrefs): NewsItem[] => items.filter((n) => !prefs.read[newsKey(n)]);

/**
 * Order for this reader. The worker's order carries the editorial weight — a penalty above a
 * pole, session news above features, newer above older — and the reader's taste moves things a
 * step or two, never to the exclusion of what happened. A thumbs-down on a driver does not hide
 * their grid drop; it just stops it leading.
 */
export function rank(items: NewsItem[], prefs: WirePrefs): NewsItem[] {
  const t = taste(items, prefs);
  const base = new Map(items.map((n, i) => [newsKey(n), items.length - i]));
  const score = (n: NewsItem) => {
    const editorial = base.get(newsKey(n)) ?? 0;
    const personal = (n.entity ? t.entity[n.entity] ?? 0 : 0) + (t.kind[n.kind] ?? 0);
    // each net thumb is worth about two places in the editorial order
    return editorial + 2 * personal;
  };
  return [...items].sort((a, b) => score(b) - score(a) || (base.get(newsKey(b)) ?? 0) - (base.get(newsKey(a)) ?? 0));
}

/** The next ten unread for the Briefing, in this reader's order. */
export const forBriefing = (items: NewsItem[], prefs: WirePrefs, limit = 10): NewsItem[] => rank(unread(items, prefs), prefs).slice(0, limit);

const KEEP_READ = 400;

/** Mark read. The history is capped so the document stays small; the oldest marks fall off. */
export function markRead(prefs: WirePrefs, key: string, now: number): WirePrefs {
  const read = { ...prefs.read, [key]: now };
  const keys = Object.keys(read);
  if (keys.length > KEEP_READ) {
    keys.sort((a, b) => read[a] - read[b]);
    for (const k of keys.slice(0, keys.length - KEEP_READ)) delete read[k];
  }
  return { ...prefs, read };
}

/** Rate, or clear the rating by rating the same way again. */
export function rate(prefs: WirePrefs, key: string, rating: Rating): WirePrefs {
  const liked = { ...prefs.liked };
  if (liked[key] === rating) delete liked[key]; else liked[key] = rating;
  return { ...prefs, liked };
}

/** Coerce a stored document, dropping anything that is not the two maps. */
export function toPrefs(raw: unknown): WirePrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const read: Record<string, number> = {};
  const liked: Record<string, Rating> = {};
  const rm = (r.read && typeof r.read === 'object' ? r.read : {}) as Record<string, unknown>;
  const lm = (r.liked && typeof r.liked === 'object' ? r.liked : {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(rm)) if (typeof v === 'number' && Number.isFinite(v)) read[k] = v;
  for (const [k, v] of Object.entries(lm)) if (v === 1 || v === -1) liked[k] = v;
  return { read, liked };
}
