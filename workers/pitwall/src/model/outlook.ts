/**
 * The driver Outlook (F-071): three sentences on the rounds ahead, written by a model from the
 * published numbers and tagged headlines ONLY, then checked. The check is the point: a sentence
 * that names a number, a driver, a team or an event that is not in the inputs is thrown away,
 * however good it reads. The portal labels the result "Estimate · written by AI" and lists what
 * it was built from.
 *
 * Pure. The call to the model is in jobs/outlooks.ts.
 */
export interface OutlookInputs {
  driver: { id: string; name: string; team: string; teammate: string | null; price: number };
  round: { name: string; circuit: string | null; classes: string[] };
  projection: { median: number; floor: number; ceiling: number; dnfPct: number; winPct: number; podiumPct: number; top10Pct: number; valuePer100: number; vsPriceImplied: number };
  price: { ptsToRise: number; ptsToHold: number; risePct: number; fallPct: number; predictedMove: number };
  fit: Array<{ round: string; fit: number }>;
  season: { starts: number; avgGrid: number; avgFinish: number; placesGained: number; finishRatePct: number; points: number; projectedPoints: number } | null;
  splits: Array<{ label: string; n: number; avg: number }>;
  weather: Array<{ session: string; sky: string | null; rainMm: number | null }>;
  news: Array<{ kind: string; tone: string; text: string }>;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** The facts for one driver, lifted from the published (paid) payload document. */
export function outlookInputs(doc: Record<string, any>, driverId: string): OutlookInputs | null {
  const d = (doc.drivers ?? []).find((x: any) => x.id === driverId);
  if (!d) return null;
  const teams = doc.teams ?? {};
  const mate = (doc.drivers ?? []).find((x: any) => x.team === d.team && x.id !== d.id);
  const pace = (doc.pace ?? []).find((x: any) => x.id === driverId);
  const season = (doc.season ?? []).find((x: any) => x.id === driverId);
  const rounds: string[] = doc.rounds ?? [];
  return {
    driver: { id: d.id, name: d.name, team: teams[d.team]?.name ?? d.team, teammate: mate?.name ?? null, price: d.price },
    round: { name: doc.round?.name ?? '', circuit: doc.circuit?.name ?? null, classes: doc.circuit?.classes ?? [] },
    projection: { median: d.med, floor: d.floor, ceiling: d.ceil, dnfPct: d.dnf, winPct: d.win, podiumPct: d.pod, top10Pct: d.t10, valuePer100: d.val, vsPriceImplied: d.pm },
    price: { ptsToRise: d.ptsRise, ptsToHold: d.ptsHold, risePct: d.pRise, fallPct: d.pFall, predictedMove: d.dprice },
    fit: (d.fit ?? []).map((f: number, i: number) => ({ round: rounds[i] ?? `R+${i + 1}`, fit: f })),
    season: pace ? { starts: pace.starts, avgGrid: pace.avgGrid, avgFinish: pace.avgFinish, placesGained: pace.gained, finishRatePct: pace.finishRate, points: season?.points ?? 0, projectedPoints: season?.projected ?? 0 } : null,
    splits: (d.splits ?? []).map((s: any) => ({ label: s.label, n: s.n, avg: r1(s.avg) })),
    weather: (doc.weather ?? []).map((w: any) => ({ session: w.label, sky: w.sky ?? null, rainMm: w.rainMm ?? null })),
    news: (doc.news ?? []).filter((n: any) => n.entity === d.id || n.entity === d.team).slice(0, 6).map((n: any) => ({ kind: n.kind, tone: n.tone, text: n.text })),
  };
}

export const SYSTEM_PROMPT = `You write the "Outlook" for one racing driver on a fantasy-game analytics page. Three sentences at most, plain British English, no headings, no bullet points, no emoji.
Use ONLY the facts in the JSON you are given. Do not introduce any number, driver, team, event, injury, penalty, contract or result that is not in it. If a headline is about a penalty or a change, describe it as the headline does and no further. Numbers you quote must appear in the JSON exactly (you may add a % sign or the word points).
Speak of projections as estimates from a model, never as odds, prices to bet, or certainties. Do not use the words odds, bet, wager, bookmaker, lock, guarantee.
The reader wants to know: is this driver worth picking for the coming round, what could go wrong, and what the price is likely to do.`;

export function buildPrompt(i: OutlookInputs): { system: string; user: string } {
  return { system: SYSTEM_PROMPT, user: `Write the outlook for ${i.driver.name} for the ${i.round.name} round.\n\n${JSON.stringify(i)}` };
}

/** Every number that may appear in the text: everything numeric in the inputs, as written. */
export function allowedNumbers(i: OutlookInputs): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === 'number' && Number.isFinite(v)) { out.add(String(v)); out.add(String(Math.abs(v))); out.add(String(Math.round(v))); out.add(String(Math.abs(Math.round(v)))); }
    else if (typeof v === 'string') for (const m of v.match(/\d+(?:\.\d+)?/g) ?? []) out.add(m);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(i);
  return out;
}

const FORBIDDEN = /\b(odds|bet|bets|betting|wager|bookmaker|lock|guarantee[ds]?)\b/i;
const CLAIMS: Array<[RegExp, RegExp]> = [[/\bpenalt/i, /penalt/i], [/\binjur/i, /injur/i], [/\bcontract/i, /contract/i], [/\bban(ned)?\b/i, /\bban/i], [/\bdisqualif/i, /disqualif/i], [/\bcrash/i, /crash|accident/i]];

/**
 * Why a text is refused, or null when it passes. `knownNames` is every driver surname and team
 * name on the grid, so a name that is not this driver's, their team's or their teammate's — or one
 * that a headline in the inputs carries — is caught.
 */
export function validateOutlook(text: string, i: OutlookInputs, knownNames: string[]): string | null {
  const t = text.trim();
  if (!t) return 'empty';
  const sentences = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length > 4) return `too long: ${sentences.length} sentences`;
  if (t.split(/\s+/).length > 110) return 'too long: over 110 words';
  if (FORBIDDEN.test(t)) return 'wagering language';
  const nums = allowedNumbers(i);
  for (const n of t.match(/\d+(?:\.\d+)?/g) ?? []) if (!nums.has(n)) return `number not in inputs: ${n}`;
  const newsText = i.news.map((n) => n.text).join(' ');
  const allowedNames = new Set([i.driver.name, i.driver.team, i.driver.teammate ?? '', ...knownNames.filter((n) => newsText.includes(n))].filter(Boolean).map((s) => s.toLowerCase()));
  for (const name of knownNames) {
    if (allowedNames.has(name.toLowerCase())) continue;
    if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(t)) return `names someone not in the inputs: ${name}`;
  }
  for (const [inText, inNews] of CLAIMS) if (inText.test(t) && !inNews.test(newsText)) return `claims something no headline carries: ${inText.source}`;
  return null;
}
