/**
 * Reads the published page payload (F-070). The worker writes two documents per round with the
 * same shape as `data/types.ts` Payload:
 *
 *   pw_pages/{season}_{round}   the full payload, readable only with the `pw` claim
 *   pw_public/{season}_{round}  the free look: top-ten medians and nothing the pass buys
 *
 * The rules are the real gate, so this asks for the document the caller is entitled to and never
 * treats a refusal as an error worth showing. Everything is coerced on the way in: a field the
 * worker has not started publishing yet must leave the page rendering, not crash it.
 */
import { firestore } from './firebase';
import type { Constructor, Driver, MapFrame, NewsItem, NewsKind, Payload, Rival, SessionMap, SessionWeather, Team, WeatherMap } from '../data/types';

const NEWS_KINDS: readonly NewsKind[] = ['PENALTY', 'UPGRADE', 'WEATHER', 'RELIABILITY', 'CONTRACT', 'REGULATION', 'PRACTICE', 'QUALIFYING', 'RACE', 'NEWS'];

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const nums = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)) : []);

function toDriver(v: Record<string, unknown>): Driver {
  return {
    id: str(v.id), num: num(v.num), name: str(v.name, str(v.id)), team: str(v.team), price: num(v.price),
    med: num(v.med), floor: num(v.floor), ceil: num(v.ceil), form: nums(v.form),
    dnf: num(v.dnf), own: num(v.own), pm: num(v.pm), cons: num(v.cons), dprice: num(v.dprice),
    fit: nums(v.fit), win: num(v.win), pod: num(v.pod), t10: num(v.t10),
    ptsRise: num(v.ptsRise), ptsHold: num(v.ptsHold), pRise: num(v.pRise), pFall: num(v.pFall),
    q: num(v.q), r: num(v.r), val: num(v.val),
    ...(typeof v.lev === 'number' ? { lev: v.lev } : {}),
  };
}

function toConstructor(v: Record<string, unknown>): Constructor {
  return {
    id: str(v.id), name: str(v.name, str(v.id)), team: str(v.team, str(v.id)), price: num(v.price),
    med: num(v.med), floor: num(v.floor), ceil: num(v.ceil), val: num(v.val), ctor: true,
  };
}

function toNews(v: Record<string, unknown>): NewsItem | null {
  const kind = str(v.kind) as NewsKind;
  if (!NEWS_KINDS.includes(kind)) return null;
  const tone = str(v.tone, '•');
  return {
    kind, entity: typeof v.entity === 'string' ? v.entity : null,
    tone: tone === '+' || tone === '-' ? tone : '•',
    text: str(v.text), sources: str(v.sources), detail: str(v.detail),
    // only https links reach the page: the field comes from a feed we fetch, not from a reader
    url: /^https:\/\//.test(str(v.url)) ? str(v.url) : '',
    publishedAt: str(v.publishedAt),
  };
}

function toFrame(v: Record<string, unknown>): MapFrame | null {
  if (!Array.isArray(v.rainMm)) return null;
  return {
    offsetH: num(v.offsetH), at: str(v.at),
    rainMm: v.rainMm.map((x) => (typeof x === 'number' && Number.isFinite(x) ? x : null)),
    windFromDeg: numOrNull(v.windFromDeg), windKph: numOrNull(v.windKph),
  };
}

function toWeatherMap(raw: unknown): WeatherMap | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const c = (m.center && typeof m.center === 'object' ? m.center : {}) as Record<string, unknown>;
  const radius = num(m.radius), spacingKm = num(m.spacingKm);
  const side = 2 * radius + 1;
  const sessions: SessionMap[] = objects(m.sessions).map((s) => ({
    key: str(s.key), label: str(s.label), at: str(s.at),
    // a frame with the wrong number of cells would draw a scrambled grid; drop it instead
    frames: objects(s.frames).map(toFrame).filter((f): f is MapFrame => f !== null && f.rainMm.length === side * side),
  })).filter((s) => s.key && s.frames.length > 0);
  if (!radius || !spacingKm || !sessions.length) return null;
  return { center: { lat: num(c.lat), lon: num(c.lon) }, radius, spacingKm, sessions };
}

function toRival(v: Record<string, unknown>): Rival {
  return {
    name: str(v.name), rank: num(v.rank), gap: num(v.gap),
    lineup: Array.isArray(v.lineup) ? v.lineup.filter((x): x is string => typeof x === 'string') : [],
    bank: num(v.bank), activity: num(v.activity),
  };
}

function toWeather(v: Record<string, unknown>): SessionWeather | null {
  const key = str(v.key), label = str(v.label), at = str(v.at);
  if (!key || !label || !at) return null;
  return { key, label, at, tempC: numOrNull(v.tempC), rainMm: numOrNull(v.rainMm), sky: typeof v.sky === 'string' ? v.sky : null, windKph: numOrNull(v.windKph) };
}

const objects = (v: unknown): Array<Record<string, unknown>> =>
  (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : []);

/** Coerce a published document into a Payload. Anything missing becomes an empty, honest value. */
export function toPayload(raw: Record<string, unknown>): Payload {
  const round = (raw.round && typeof raw.round === 'object' ? raw.round : {}) as Record<string, unknown>;
  const league = (raw.league && typeof raw.league === 'object' ? raw.league : {}) as Record<string, unknown>;
  const teamsRaw = (raw.teams && typeof raw.teams === 'object' ? raw.teams : {}) as Record<string, unknown>;
  const teams: Record<string, Team> = {};
  for (const [id, t] of Object.entries(teamsRaw)) {
    const o = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
    teams[id] = { id: str(o.id, id), name: str(o.name, id), color: str(o.color, '#7A7A7A') };
  }
  return {
    // A published document is real data by definition; only the browser-generated stand-in is example.
    example: raw.example === true,
    asOf: str(raw.asOf),
    round: {
      number: num(round.number), name: str(round.name), firstSession: str(round.firstSession),
      locksIn: str(round.locksIn), circuit: str(round.circuit),
    },
    rounds: Array.isArray(raw.rounds) ? raw.rounds.filter((x): x is string => typeof x === 'string') : [],
    budget: num(raw.budget, 1000),
    teams,
    drivers: objects(raw.drivers).map(toDriver).filter((d) => d.id),
    constructors: objects(raw.constructors).map(toConstructor).filter((c) => c.id),
    news: objects(raw.news).map(toNews).filter((n): n is NewsItem => n !== null),
    rivals: objects(raw.rivals).map(toRival).filter((r) => r.name),
    league: { name: str(league.name), size: num(league.size), myRank: num(league.myRank) },
    weather: objects(raw.weather).map(toWeather).filter((w): w is SessionWeather => w !== null),
    weatherSource: typeof raw.weatherSource === 'string' ? raw.weatherSource : null,
    weatherMap: toWeatherMap(raw.weatherMap),
  };
}

/**
 * The newest published payload the caller may read, or null when there is none yet or the rules
 * refuse it. Ordered by `asOf` rather than by document id, because ids sort as text
 * ("2026_9" after "2026_17") and a season rolls over.
 */
export async function loadPayload(hasPass: boolean): Promise<Payload | null> {
  try {
    const { m, db } = await firestore();
    const snap = await m.getDocs(m.query(m.collection(db, hasPass ? 'pw_pages' : 'pw_public'), m.orderBy('asOf', 'desc'), m.limit(1)));
    const doc = snap.docs[0];
    if (!doc) return null;
    const payload = toPayload(doc.data() as Record<string, unknown>);
    return payload.drivers.length ? payload : null;
  } catch {
    // Offline, refused by the rules, or nothing published: the caller falls back to the example set.
    return null;
  }
}
