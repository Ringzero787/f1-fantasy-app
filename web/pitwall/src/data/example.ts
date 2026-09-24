/**
 * EXAMPLE DATA. Every number here is generated in the browser from a fixed seed so the shell,
 * its layout and the recommendation logic can be built and reviewed before the projection
 * worker publishes real payloads (F-070, F-072). The UI shows an "EXAMPLE DATA" pill whenever
 * `payload.example` is true. Nothing here is a real projection, price or probability.
 */
import type { Constructor, Driver, Lineup, NewsItem, Payload, Rival, Team } from './types';

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
    return { id, num, name, team, price, med, floor: Math.max(0, Math.round(med - sd)), ceil: Math.round(med + sd * 1.15), form, dnf, own,
      pm: +(med - price / 11).toFixed(1), cons, dprice: Math.round((med - price / 11) * 1.4), fit, win, q, r, val: 0, pod: 0, t10: 0 };
  });
  for (const d of drivers) { d.val = +((d.med / d.price) * 100).toFixed(1); d.pod = Math.min(88, d.win * 2 + Math.round(rnd() * 8)); d.t10 = Math.min(97, Math.round(d.med * 1.7 + 10)); }
  const constructors: Constructor[] = CTORS.map(([id, price, med]) => ({ id, name: TEAMS[id].name, team: id, price, med, ctor: true, floor: Math.round(med * 0.7), ceil: Math.round(med * 1.3), val: +((med / price) * 100).toFixed(1) }));
  const news: NewsItem[] = [
    { kind: 'PENALTY', entity: 'hamilton', tone: '-', text: 'Ferrari confirms a new energy store for Hamilton: 10-place grid drop in Baku.', sources: '2 sources', detail: 'Governing-body doc 14 · team release' },
    { kind: 'UPGRADE', entity: 'mclaren', tone: '+', text: 'McLaren brings a low-drag rear wing; long straights suit it.', sources: '3 sources', detail: 'Team release · 2 outlets' },
    { kind: 'WEATHER', entity: null, tone: '•', text: 'Race-day rain chance up from 10% to 35%. Wet delta favours Verstappen, Alonso.', sources: 'model', detail: 'Forecast feed' },
    { kind: 'RELIABILITY', entity: 'alonso', tone: '-', text: 'Aston Martin investigating a gearbox issue from Madrid; no penalty yet.', sources: '2 sources', detail: '2 outlets · unconfirmed' },
    { kind: 'CONTRACT', entity: 'colapinto', tone: '•', text: 'Alpine seat for 2027 still open; no change to this weekend.', sources: '4 sources', detail: '4 outlets' },
  ];
  const rivals: Rival[] = [
    { name: 'Turn One', rank: 1, gap: 33, lineup: ['verstappen', 'russell', 'hadjar', 'albon', 'lawson'], bank: 120, activity: 0.85 },
    { name: 'Gravel Trap', rank: 3, gap: -21, lineup: ['norris', 'leclerc', 'hadjar', 'hulkenberg', 'colapinto'], bank: 60, activity: 0.7 },
    { name: 'Backmarkers', rank: 4, gap: -64, lineup: ['verstappen', 'leclerc', 'gasly', 'ocon', 'bottas'], bank: 90, activity: 0.3 },
    { name: 'Slipstream', rank: 5, gap: -102, lineup: ['piastri', 'hamilton', 'alonso', 'bearman', 'lindblad'], bank: 150, activity: 0.1 },
  ];
  return {
    example: true, asOf: '19 Sep 06:00 UTC',
    round: { number: 17, name: 'Baku', firstSession: 'FP1 Fri 25 Sep', locksIn: '6d 04h', circuit: 'Baku City Circuit' },
    rounds: ['BAK', 'SIN', 'AUS', 'MEX', 'SAO', 'LVG'], budget: 2250, teams: TEAMS, drivers, constructors, news, rivals,
    league: { name: 'Sunday Drivers', size: 10, myRank: 2 },
  };
}

export const EXAMPLE_LINEUP: Lineup = { drivers: ['norris', 'leclerc', 'sainz', 'hadjar', 'bearman'], ctor: 'mercedes', ace: 'norris' };
