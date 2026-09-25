/**
 * What a signed-in user can see (F-068). The rules are the real gate; this decides what the UI
 * shows so a locked frame can render its true layout with the offer over it, rather than vanishing.
 *
 * Free for everyone signed in: the projection for every driver and constructor, Briefing
 * headlines, Wire headlines, the lineup with manual editing, Rate My Team, and every
 * timing-derived frame (Pace Lab and the circuit history), which is never sold (ADR-001).
 *
 * The pass buys what is built on the projection: the recommendations and the reasoning, the
 * ranges, the probabilities, form, the price model, rivals, and the deep dives.
 */
export type Access = 'free' | 'pass';

export interface PassState {
  access: Access;
  /** epoch ms the pass ends, when there is one */
  expiresAt: number | null;
  /** a 7-day trial rather than a bought pass */
  trial: boolean;
}
export const NO_PASS: PassState = { access: 'free', expiresAt: null, trial: false };

/** Read the pass out of the auth token's claims, the same value the rules read. */
export function passFromClaims(claims: Record<string, unknown> | undefined, now: number): PassState {
  const pw = claims?.pw;
  if (typeof pw !== 'number' || pw * 1000 <= now) return NO_PASS;
  return { access: 'pass', expiresAt: pw * 1000, trial: false };
}

export type Feature =
  | 'briefing.headlines' | 'briefing.recommendations' | 'briefing.rivals'
  | 'board.top10' | 'board.full' | 'board.probabilities' | 'board.movement'
  | 'circuit' | 'circuit.fit' | 'pace'
  | 'market' | 'season'
  | 'lineup.edit' | 'lineup.rateMyTeam' | 'lineup.topPick' | 'lineup.whatIf'
  | 'entity.present' | 'entity.past' | 'entity.outlook'
  | 'wire.headlines' | 'wire.full';

const FREE: ReadonlySet<Feature> = new Set<Feature>([
  'briefing.headlines', 'board.top10', 'circuit', 'pace',
  'lineup.edit', 'lineup.rateMyTeam', 'wire.headlines', 'entity.present',
]);

export const can = (state: PassState, feature: Feature): boolean => state.access === 'pass' || FREE.has(feature);

/** One line of copy per locked frame: what the user would get, in their terms. */
export const LOCKED_COPY: Partial<Record<Feature, string>> = {
  'briefing.recommendations': 'See which swaps the data backs, with the reason and the points behind each one.',
  'briefing.rivals': "See the move each rival is most likely to make, and whether it threatens you.",
  'circuit.fit': 'See which cars suit this kind of circuit, from their results at circuits like it.',
  'board.full': 'See every driver and constructor with ranges, value, form and price movement.',
  'board.probabilities': 'See win, podium, top ten and retirement chances for the whole grid.',
  'board.movement': 'Follow how each projection moves through the weekend.',
  'market': 'See what each price move needs, and who is over or under owned in your league.',
  'season': 'See where the season is heading for every driver: points so far plus the projection for each remaining round.',
  'lineup.topPick': 'See the best replacement for any pick, compared side by side.',
  'lineup.whatIf': 'Try a lineup and see the projection, bank and fees before you save.',
  'entity.past': 'See a full season of form, splits by circuit type and a percentile profile.',
  'entity.outlook': 'Read the outlook for the rounds ahead, built from the model and tagged news.',
  'wire.full': 'Read every story cluster with its sources and who it affects.',
};

/**
 * The payload to render, given what was last fetched and what the viewer is entitled to now.
 *
 * A payload is tagged with the access it was fetched for. When a pass lapses, is revoked, or the
 * viewer signs out, the next read is not instant, and showing the paid payload in the meantime
 * would hand out what the rules have already stopped granting. So a mismatch renders nothing and
 * the example set stands in for the moment it takes.
 */
export function payloadForAccess<T>(held: { access: Access; payload: T } | null | undefined, access: Access): T | null {
  return held && held.access === access ? held.payload : null;
}
