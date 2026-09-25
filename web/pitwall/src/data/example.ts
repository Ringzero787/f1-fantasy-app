/**
 * EXAMPLE DATA. Every number here is generated in the browser from a fixed seed so the shell,
 * its layout and the recommendation logic can be built and reviewed before the projection
 * worker publishes real payloads (F-070, F-072). The UI shows an "EXAMPLE DATA" pill whenever
 * `payload.example` is true. Nothing here is a real projection, price or probability.
 */
import type { CircuitReport, Constructor, Driver, Lineup, NewsItem, PaceRow, Payload, Rival, SeasonRow, Team } from './types';

const TEAMS: Record<string, Team> = Object.fromEntries(([
  ['mclaren', 'McLaren', '#FF8000'], ['red_bull', 'Red Bull', '#3671C6'], ['ferrari', 'Ferrari', '#E80020'], ['mercedes', 'Mercedes', '#27F4D2'],
  ['williams', 'Williams', '#64C4FF'], ['aston_martin', 'Aston Martin', '#229971'], ['alpine', 'Alpine', '#0093CC'], ['racing_bulls', 'Racing Bulls', '#6692FF'],
  ['haas', 'Haas', '#B6BABD'], ['audi', 'Audi', '#52E252'], ['cadillac', 'Cadillac', '#C7B063'],
] as Array<[string, string, string]>).map(([id, name, color]) => [id, { id, name, color }]));

const RAW: Array<[string, number, string, string, number, number]> = [
  ['verstappen', 3, 'Verstappen', 'red_bull', 591, 58], ['norris', 1, 'Norris', 'mclaren', 560, 55], ['piastri', 81, 'Piastri', 'mclaren', 548, 52], ['russell', 63, 'Russell', 'mercedes', 520, 47],
  ['leclerc', 16, 'Leclerc', 'ferrari', 498, 44], ['antonelli', 12, 'Antonelli', 'mercedes', 480, 40], ['hamilton', 44, 'Hamilton', 'ferrari', 477, 38], ['hadjar', 6, 'Hadjar', 'red_bull', 96, 34],
  ['sainz', 55, 'Sainz', 'williams', 310, 30], ['albon', 23, 'Albon', 'williams', 298, 28], ['alonso', 14, 'Alonso', 'aston_martin', 240, 24], ['bearman', 87, 'Bearman', 'haas', 188, 21],
  ['lawson', 30, 'Lawson', 'racing_bulls', 212, 20], ['hulkenberg', 27, 'Hulkenberg', 'audi', 176, 19], ['gasly', 10, 'Gasly', 'alpine', 205, 18], ['ocon', 31, 'Ocon', 'haas', 204, 17],
  ['bortoleto', 5, 'Bortoleto', 'audi', 150, 16], ['lindblad', 41, 'Lindblad', 'racing_bulls', 120, 14], ['stroll', 18, 'Stroll', 'aston_martin', 110, 11], ['perez', 11, 'Perez', 'cadillac', 105, 10],
  ['colapinto', 43, 'Colapinto', 'alpine', 95, 9], ['bottas', 77, 'Bottas', 'cadillac', 98, 9],
];
const CTORS: Array<[string, number, number]> = [['mclaren', 620, 96], ['mercedes', 540, 80], ['ferrari', 510, 74], ['red_bull', 500, 78], ['williams', 330, 52], ['haas', 240, 34], ['racing_bulls', 230, 30], ['aston_martin', 210, 28], ['audi', 200, 30], ['alpine', 180, 22], ['cadillac', 160, 16]];

export function examplePayload(): Payload {
  let seed = 17;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const drivers: Driver[] = RAW.map(([id, num, name, team, price, med]) => {
    const sd = 6 + med * 0.28;
    const form = Array.from({ length: 16 }, () => Math.max(0, Math.round(med + (rnd() - 0.5) * sd * 2.6) * (rnd() < 0.08 ? 0 : 1)));
    const dnf = Math.round(4 + rnd() * 14);
    const own = Math.round(rnd() * 70 + (med > 40 ? 20 : 0));
    const cons = Math.round(40 + rnd() * 40);
    const fit = Array.from({ length: 6 }, () => 1 + Math.floor(rnd() * 5));
    const win = Math.max(0, Math.round((med - 30) * 1.1 + rnd() * 4));
    const q = +(rnd() * 1.2).toFixed(2), r = +(rnd() * 1.2).toFixed(2);
    // the production price rule: 1.1% of the price to rise, 0.6% to avoid a fall
    const ptsRise = Math.ceil(price * 0.011), ptsHold = Math.ceil(price * 0.006);
    const pRise = Math.max(2, Math.min(95, Math.round(50 + (med - ptsRise) * 3)));
    return { id, num, name, team, price, med, floor: Math.max(0, Math.round(med - sd)), ceil: Math.round(med + sd * 1.15), form, dnf, own,
      pm: +(med - price / 11).toFixed(1), cons, dprice: Math.round((med - price / 11) * 1.4), fit, win, q, r, val: 0, pod: 0, t10: 0,
      ptsRise, ptsHold, pRise, pFall: Math.max(2, 98 - pRise) };
  });
  for (const d of drivers) { d.val = +((d.med / d.price) * 100).toFixed(1); d.pod = Math.min(88, d.win * 2 + Math.round(rnd() * 8)); d.t10 = Math.min(97, Math.round(d.med * 1.7 + 10)); }
  const constructors: Constructor[] = CTORS.map(([id, price, med]) => ({ id, name: TEAMS[id].name, team: id, price, med, ctor: true, floor: Math.round(med * 0.7), ceil: Math.round(med * 1.3), val: +((med / price) * 100).toFixed(1) }));
  const weather = [
    { key: 'fp1', label: 'FP1', at: '2026-09-25T08:30:00.000Z', tempC: 24, rainMm: 0, sky: 'clear', windKph: 12 },
    { key: 'qualifying', label: 'Qualifying', at: '2026-09-26T12:00:00.000Z', tempC: 23, rainMm: 0.2, sky: 'part cloud', windKph: 18 },
    { key: 'race', label: 'Race', at: '2026-09-27T11:00:00.000Z', tempC: 21, rainMm: 1.4, sky: 'light showers', windKph: 22 },
  ];
  const news: NewsItem[] = [
    { kind: 'PENALTY', entity: 'hamilton', tone: '-', text: 'Ferrari confirms a new energy store for Hamilton: 10-place grid drop in Baku.', sources: '2 sources', detail: 'Governing-body doc 14 · team release', url: '', publishedAt: '2026-09-24T09:00:00.000Z' },
    { kind: 'UPGRADE', entity: 'mclaren', tone: '+', text: 'McLaren brings a low-drag rear wing; long straights suit it.', sources: '3 sources', detail: 'Team release · 2 outlets', url: '', publishedAt: '2026-09-24T09:00:00.000Z' },
    { kind: 'WEATHER', entity: null, tone: '•', text: 'Race-day rain chance up from 10% to 35%. Wet delta favours Verstappen, Alonso.', sources: 'model', detail: 'Forecast feed', url: '', publishedAt: '2026-09-24T09:00:00.000Z' },
    { kind: 'RELIABILITY', entity: 'alonso', tone: '-', text: 'Aston Martin investigating a gearbox issue from Madrid; no penalty yet.', sources: '2 sources', detail: '2 outlets · unconfirmed', url: '', publishedAt: '2026-09-24T09:00:00.000Z' },
    { kind: 'CONTRACT', entity: 'colapinto', tone: '•', text: 'Alpine seat for 2027 still open; no change to this weekend.', sources: '4 sources', detail: '4 outlets', url: '', publishedAt: '2026-09-24T09:00:00.000Z' },
  ];
  const rivals: Rival[] = [
    { name: 'Turn One', rank: 1, gap: 33, lineup: ['verstappen', 'russell', 'hadjar', 'albon', 'lawson'], bank: 120, activity: 0.85 },
    { name: 'Gravel Trap', rank: 3, gap: -21, lineup: ['norris', 'leclerc', 'hadjar', 'hulkenberg', 'colapinto'], bank: 60, activity: 0.7 },
    { name: 'Backmarkers', rank: 4, gap: -64, lineup: ['verstappen', 'leclerc', 'gasly', 'ocon', 'bottas'], bank: 90, activity: 0.3 },
    { name: 'Slipstream', rank: 5, gap: -102, lineup: ['piastri', 'hamilton', 'alonso', 'bearman', 'lindblad'], bank: 150, activity: 0.1 },
  ];
  // F-072 frames from the classifications: the venue, where each driver starts and finishes, the season table
  const circuit: CircuitReport = {
    id: 'baku', name: 'Baku', kind: 'street', speed: 'high', classes: ['street', 'high-speed'], laps: 51, lapKm: 6.003, pitLossS: 19, strategy: '1 stop',
    profile: [['Straight-line share', 5], ['Slow-corner share', 4], ['Overtaking ease', 4], ['Safety-car rate', 5], ['Tyre stress', 2]].map(([label, v]) => ({ label: label as string, v: v as number })),
    fitRanking: constructors.map((c, i) => ({ id: c.id, fit: Math.max(1, 5 - Math.floor(i / 2)), n: 6 })),
    likeThis: drivers.map((d) => ({ id: d.id, n: 6, avgPts: Math.round(d.med * (0.8 + rnd() * 0.4)), avgFinish: +(1 + rnd() * 15).toFixed(1) })).sort((a, b) => b.avgPts - a.avgPts),
    racesInClass: 6,
  };
  const pace: PaceRow[] = drivers.map((d, i) => { const g = +(1 + i * 0.8 + rnd() * 2).toFixed(1); const f = +(Math.max(1, g - 2 + rnd() * 4)).toFixed(1); return { id: d.id, starts: 14, avgGrid: g, avgFinish: f, gained: +(g - f).toFixed(1), finishRate: 100 - Math.round(rnd() * 20), dnfs: Math.round(rnd() * 3) }; });
  const season: SeasonRow[] = drivers.map((d) => { const pts = d.form.reduce((a, b) => a + b, 0); return { id: d.id, points: pts, projected: pts + d.med * 8, starts: 14, dnfs: Math.round(rnd() * 3) }; }).sort((a, b) => b.projected - a.projected);
  return {
    example: true, asOf: '19 Sep 06:00 UTC',
    round: { number: 17, name: 'Baku', firstSession: 'FP1 Fri 25 Sep', locksIn: '6d 04h', circuit: 'Baku City Circuit' },
    rounds: ['BAK', 'SIN', 'AUS', 'MEX', 'SAO', 'LVG'], budget: 2250, teams: TEAMS, drivers, constructors, news, rivals,
    league: { name: 'Sunday Drivers', size: 10, myRank: 2 },
    weather, weatherSource: 'Example forecast', circuit, pace, season,
    // a 5x5 grid with a band of rain to the north-west drifting towards the circuit, so the map
    // has something to draw in the design preview
    weatherMap: { center: { lat: 40.37, lon: 49.85 }, radius: 2, spacingKm: 40, sessions: [{ key: 'race', label: 'Race', at: '2026-09-27T11:00:00.000Z', frames: [-3, 0, 3].map((offsetH) => ({
      offsetH, at: new Date(Date.parse('2026-09-27T11:00:00.000Z') + offsetH * 3600000).toISOString(),
      rainMm: Array.from({ length: 25 }, (_, i) => { const dx = (i % 5) - 2, dy = Math.floor(i / 5) - 2; const shift = (offsetH + 3) / 3; const d = Math.hypot(dx + 2 - shift * 1.2, dy + 2 - shift * 1.2); return d < 1.6 ? Math.round((1.6 - d) * 30) / 10 : 0; }),
      windFromDeg: 315, windKph: 22,
    })) }] },
  };
}

export const EXAMPLE_LINEUP: Lineup = { drivers: ['norris', 'leclerc', 'sainz', 'hadjar', 'bearman'], ctor: 'mercedes', ace: 'norris' };

/**
 * The example payload reduced to what the worker actually publishes today: projections and the
 * price model, and nothing else. Used by the preview build (`?bare=1`) so the scroll-budget run
 * also measures every "not published yet" state, which is otherwise only reachable in production.
 */
export function bareExamplePayload(free = false): Payload {
  const p = examplePayload();
  // The free document keeps every median and strips what the pass buys, exactly as the worker
  // does, so the preview shows what a reader without a pass sees.
  const strip = (d: Payload['drivers'][number]) => (free
    ? { ...d, floor: 0, ceil: 0, dnf: 0, pm: 0, cons: 0, dprice: 0, win: 0, pod: 0, t10: 0, val: 0, form: [], ptsRise: 0, ptsHold: 0, pRise: 0, pFall: 0 }
    : d);
  return {
    ...p,
    constructors: free ? p.constructors.map((c) => ({ ...c, floor: 0, ceil: 0, val: 0 })) : p.constructors,
    example: false,
    news: [],
    rivals: [],
    league: { name: '', size: 0, myRank: 0 },
    drivers: p.drivers.map((d) => strip({ ...d, own: 0, q: 0, r: 0, fit: d.fit.map(() => 3) })),
    // the worker publishes these now, so the bare preview keeps them; the free look loses the two judgements
    circuit: p.circuit && free ? { ...p.circuit, fitRanking: [] } : p.circuit,
    season: free ? p.season.map((r) => ({ ...r, projected: 0 })) : p.season,
  };
}
