/**
 * The projections the app shows to pass holders (F-077, widened by F-084).
 *
 * The worker publishes one document per round to `pw_pages`, readable only with the `pw` claim.
 * The rules are the gate: without a pass this read is refused, and a refusal is not an error worth
 * showing — the app simply has no projections and every Pit Wall mark stays hidden.
 *
 * This used to keep six fields and say "the portal renders the rest". The app was already
 * downloading the whole document and throwing almost all of it away, which is why someone who had
 * paid got a single number on a picker row here and a full driver panel on the web. The read is the
 * same; what changes is that the answer is no longer discarded on arrival.
 *
 * Pure on purpose: the read lives in `client.ts`, so the shape handling is tested without a React
 * Native runtime.
 */

/** One slice of where a driver's season points came from. */
export interface PointsMix { race: number; quali: number; sprint: number; fl: number }

/** Average points at one class of circuit, against the kind of track the next round is. */
export interface Split { cls: string; label: string; n: number; avg: number }

export interface Projection {
  id: string;
  /** projected points for the coming round */
  med: number;
  /** 15th and 85th percentile of the simulation: the honest spread around `med` */
  floor: number;
  ceil: number;
  /** retirement chance, whole percent */
  dnf: number;

  /** chance of winning, a podium, a top ten — whole percent */
  win: number;
  pod: number;
  t10: number;

  /** points per $100: what the money is actually buying */
  val: number;
  /** current price, and the move the model predicts next */
  price: number;
  dprice: number;
  /** the price model: points needed to rise or hold, and the chance of each */
  ptsRise: number;
  ptsHold: number;
  pRise: number;
  pFall: number;
  /** share of leagues that own them, whole percent */
  own: number;

  /** points scored per round this season, oldest first */
  form: number[];
  /** fit for each of the next rounds, 1 to 5 */
  fit: number[];
  /** where the season's points came from */
  mix: PointsMix | null;
  /** average points by class of circuit */
  splits: Split[];
}

export interface ProjectionSet {
  /** round number the projections are for */
  round: number;
  /** ISO timestamp the worker published them */
  asOf: string;
  byId: Record<string, Projection>;
  /** the rounds `fit` lines up with, so a fit score can be labelled */
  rounds: string[];
}

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const nums = (v: unknown): number[] => (Array.isArray(v) ? v.map((x) => num(x)) : []);

function toMix(v: unknown): PointsMix | null {
  if (!v || typeof v !== 'object') return null;
  const m = v as Record<string, unknown>;
  const mix = { race: num(m.race), quali: num(m.quali), sprint: num(m.sprint), fl: num(m.fl) };
  // All zero means the worker published nothing, which is different from a driver who scored nothing
  // in every category — but not distinguishable here, and a chart of four zeroes says nothing either.
  return mix.race || mix.quali || mix.sprint || mix.fl ? mix : null;
}

function toSplits(v: unknown): Split[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((s) => ({ cls: String(s.cls ?? ''), label: String(s.label ?? ''), n: num(s.n), avg: num(s.avg) }))
    .filter((s) => s.label && s.n > 0);
}

function toProjection(v: Record<string, unknown>): Projection | null {
  const id = typeof v.id === 'string' ? v.id : '';
  if (!id) return null;
  return {
    id,
    med: num(v.med), floor: num(v.floor), ceil: num(v.ceil), dnf: num(v.dnf),
    win: num(v.win), pod: num(v.pod), t10: num(v.t10),
    val: num(v.val), price: num(v.price), dprice: num(v.dprice),
    ptsRise: num(v.ptsRise), ptsHold: num(v.ptsHold), pRise: num(v.pRise), pFall: num(v.pFall),
    own: num(v.own),
    form: nums(v.form), fit: nums(v.fit), mix: toMix(v.mix), splits: toSplits(v.splits),
  };
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
  const rounds = Array.isArray(raw.rounds)
    ? raw.rounds.map((r) => (r && typeof r === 'object' ? String((r as Record<string, unknown>).name ?? '') : String(r ?? ''))).filter(Boolean)
    : [];
  return { round, asOf: typeof raw.asOf === 'string' ? raw.asOf : '', byId, rounds };
}
