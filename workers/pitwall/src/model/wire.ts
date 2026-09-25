/**
 * The wire: headlines for the round, from the app's own `articles` collection (F-071, first cut).
 *
 * The app already gathers the official F1 and FIA feeds into `articles`; nothing had read them
 * for the portal. This maps the recent ones onto the Briefing's news shape: which driver or team
 * a story is about, what kind of story it is, and whether it reads as good or bad news for that
 * entity. Headlines are free and link to their source; the summary rides only in the paid
 * document (ADR-001: headlines public, body pass).
 *
 * Pure. The read lives in the job, outside the projection model's input allowlist, because the
 * wire is not a model input and the allowlist has to stay truthful.
 */
export type WireKind = 'PENALTY' | 'REGULATION' | 'CONTRACT' | 'PRACTICE' | 'QUALIFYING' | 'RACE' | 'NEWS';
export type Tone = '+' | '-' | '•';

export interface Article {
  title: string;
  summary: string;
  url: string;
  source: string;
  category: string;
  publishedAt: Date;
}

export interface EntityNames {
  /** driver id -> surname as shown */
  drivers: Record<string, string>;
  /** constructor id -> short name as shown, plus the full name for matching */
  constructors: Record<string, string[]>;
}

/** Words that appear in team names and mean nothing on their own; never a tag by themselves. */
const GENERIC = new Set(['team', 'racing', 'formula', 'motorsport', 'scuderia', 'petronas', 'oracle', 'aramco', 'moneygram', 'bwt', 'amg', 'cash', 'visa', 'app', 'kick', 'stake', 'hp', 'sauber', 'grand', 'prix']);

/** The names a constructor can be recognised by: its short name and its full name, never a sponsor or a generic word alone. */
export function teamVariants(full: string, short: string): string[] {
  const out = new Set<string>([short, full]);
  for (const w of full.split(/\s+/)) if (w.length >= 4 && !GENERIC.has(w.toLowerCase())) out.add(w);
  return [...out].filter((v) => v.length >= 3 && !GENERIC.has(v.toLowerCase()));
}

export interface WireItem {
  kind: WireKind;
  entity: string | null;
  tone: Tone;
  text: string;
  sources: string;
  detail: string;
  url: string;
  publishedAt: string;
}

const BAD = /\b(penalt(y|ies)|grid drop|disqualif|crash|retire|exit|damage|reprimand|fined?|investigat|stupid|mistake|out of)\b/i;
const GOOD = /\b(pole|wins?|victory|fastest|charges? to|perfect|upgrade|extends? (his|her|the) lead|top(s|ped)? the)\b/i;
const PENALTY = /\b(penalt(y|ies)|steward|grid drop|reprimand|disqualif|fined?)\b/i;

/** Which driver or team the headline names. The first match wins; a driver beats a team. */
export function tagEntity(title: string, names: EntityNames): string | null {
  const t = ` ${title.toLowerCase()} `;
  for (const [id, surname] of Object.entries(names.drivers)) {
    if (surname.length >= 4 && t.includes(surname.toLowerCase())) return id;
  }
  for (const [id, variants] of Object.entries(names.constructors)) {
    if (variants.some((v) => v.length >= 3 && t.includes(v.toLowerCase()))) return id;
  }
  return null;
}

export function kindOf(a: Article): WireKind {
  if (PENALTY.test(a.title)) return 'PENALTY';
  switch (a.category) {
    case 'regulation': return 'REGULATION';
    case 'transfer': return 'CONTRACT';
    case 'practice': return 'PRACTICE';
    case 'qualifying': return 'QUALIFYING';
    case 'race': return 'RACE';
    default: return 'NEWS';
  }
}

export function toneOf(a: Article): Tone {
  if (BAD.test(a.title)) return '-';
  if (GOOD.test(a.title)) return '+';
  return '•';
}

/**
 * Rank and trim. A story about someone on the grid beats one about nobody in particular, a story
 * from a session beats general coverage, newer beats older, and nothing older than the window
 * survives at all. `general` items with no entity are dropped: fashion shows and fan features
 * are not what a briefing is for.
 */
export function buildWire(articles: Article[], names: EntityNames, now: Date, opts: { days?: number; limit?: number } = {}): WireItem[] {
  const days = opts.days ?? 7;
  const limit = opts.limit ?? 8;
  const since = now.getTime() - days * 86400000;
  const seen = new Set<string>();
  const scored: Array<{ item: WireItem; score: number }> = [];
  for (const a of articles) {
    // only a real https link is published: the field comes from a feed, and it ends up as an anchor
    if (!a.title || !/^https:\/\//.test(a.url) || !(a.publishedAt instanceof Date) || Number.isNaN(a.publishedAt.getTime())) continue;
    if (a.publishedAt.getTime() < since || a.publishedAt.getTime() > now.getTime() + 3600000) continue;
    const key = a.title.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const entity = tagEntity(a.title, names);
    const kind = kindOf(a);
    if (kind === 'NEWS' && !entity) continue;
    const ageH = (now.getTime() - a.publishedAt.getTime()) / 3600000;
    const score = (entity ? 40 : 0) + (kind === 'NEWS' ? 0 : 20) + (kind === 'PENALTY' ? 15 : 0) + Math.max(0, 48 - ageH) / 2;
    scored.push({ item: { kind, entity, tone: toneOf(a), text: a.title.trim(), sources: a.source, detail: a.summary.trim(), url: a.url, publishedAt: a.publishedAt.toISOString() }, score });
  }
  return scored.sort((x, y) => y.score - x.score).slice(0, limit).map((x) => x.item);
}

/** The free document keeps the headline and the link and drops the body. */
export const headlineOnly = (w: WireItem): WireItem => ({ ...w, detail: '' });
