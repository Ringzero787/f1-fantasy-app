/**
 * The projections the app shows to pass holders (F-077).
 *
 * The worker publishes one document per round to `pw_pages`, readable only with the `pw` claim.
 * The rules are the gate: without a pass this read is refused, and a refusal is not an error worth
 * showing — the app simply has no projections and every Pit Wall mark stays hidden.
 *
 * Only the few fields the app uses are kept. The portal renders the rest. Pure on purpose: the
 * read lives in `client.ts`, so the shape handling is tested without a React Native runtime.
 */
export interface Projection {
  id: string;
  /** projected points for the coming round */
  med: number;
  floor: number;
  ceil: number;
  /** retirement chance, whole percent */
  dnf: number;
  /** points needed for the price to rise */
  ptsRise: number;
}

export interface ProjectionSet {
  /** round number the projections are for */
  round: number;
  /** ISO timestamp the worker published them */
  asOf: string;
  byId: Record<string, Projection>;
}

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

function toProjection(v: Record<string, unknown>): Projection | null {
  const id = typeof v.id === 'string' ? v.id : '';
  if (!id) return null;
  return { id, med: num(v.med), floor: num(v.floor), ceil: num(v.ceil), dnf: num(v.dnf), ptsRise: num(v.ptsRise) };
}

/** Coerce a published page document. Pure, so the shape handling is tested without Firestore. */
export function toProjectionSet(raw: Record<string, unknown> | null | undefined): ProjectionSet | null {
  if (!raw) return null;
  const round = raw.round && typeof raw.round === 'object' ? num((raw.round as Record<string, unknown>).number) : 0;
  const entities = [
    ...(Array.isArray(raw.drivers) ? raw.drivers : []),
    ...(Array.isArray(raw.constructors) ? raw.constructors : []),
  ].filter((x): x is Record<string, unknown> => !!x && typeof x === 'object');
  const byId: Record<string, Projection> = {};
  for (const e of entities) {
    const p = toProjection(e);
    // A stripped free-look document has every projection at zero; it is not worth showing.
    if (p && p.med > 0) byId[p.id] = p;
  }
  if (Object.keys(byId).length === 0) return null;
  return { round, asOf: typeof raw.asOf === 'string' ? raw.asOf : '', byId };
}
