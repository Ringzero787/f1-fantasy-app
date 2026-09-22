/**
 * EXAMPLE DATA. Every number here is generated in the browser from a fixed seed so the shell,
 * its layout and the recommendation logic can be built and reviewed before the projection
 * worker publishes real payloads (F-070, F-072). The UI shows an "EXAMPLE DATA" pill whenever
 * `payload.example` is true. Nothing here is a real projection, price or probability.
 */
import type { Constructor, Driver, Lineup, NewsItem, Payload, Rival, Team } from './types';

const TEAMS: Record<string, Team> = Object.fromEntries(([
  ['MCL', 'McLaren', '#FF8000'], ['RBR', 'Red Bull', '#3671C6'], ['FER', 'Ferrari', '#E80020'], ['MER', 'Mercedes', '#27F4D2'],
  ['WIL', 'Williams', '#64C4FF'], ['AMR', 'Aston Martin', '#229971'], ['ALP', 'Alpine', '#0093CC'], ['RCB', 'Racing Bulls', '#6692FF'],
  ['HAA', 'Haas', '#B6BABD'], ['AUD', 'Audi', '#52E252'], ['CAD', 'Cadillac', '#C7B063'],
] as Array<[string, string, string]>).map(([id, name, color]) => [id, { id, name, color }]));

const RAW: Array<[string, number, string, string, number, number]> = [
  ['VER', 1, 'Verstappen', 'RBR', 591, 58], ['NOR', 4, 'Norris', 'MCL', 560, 55], ['PIA', 81, 'Piastri', 'MCL', 548, 52], ['RUS', 63, 'Russell', 'MER', 520, 47],
  ['LEC', 16, 'Leclerc', 'FER', 498, 44], ['ANT', 12, 'Antonelli', 'MER', 480, 40], ['HAM', 44, 'Hamilton', 'FER', 477, 38], ['HAD', 6, 'Hadjar', 'RBR', 96, 34],
  ['SAI', 55, 'Sainz', 'WIL', 310, 30], ['ALB', 23, 'Albon', 'WIL', 298, 28], ['ALO', 14, 'Alonso', 'AMR', 240, 24], ['BEA', 87, 'Bearman', 'HAA', 188, 21],
  ['LAW', 30, 'Lawson', 'RCB', 212, 20], ['HUL', 27, 'Hulkenberg', 'AUD', 176, 19], ['GAS', 10, 'Gasly', 'ALP', 205, 18], ['OCO', 31, 'Ocon', 'HAA', 204, 17],
  ['BOR', 5, 'Bortoleto', 'AUD', 150, 16], ['LIN', 41, 'Lindblad', 'RCB', 120, 14], ['STR', 18, 'Stroll', 'AMR', 110, 11], ['PER', 11, 'Perez', 'CAD', 105, 10],
  ['COL', 43, 'Colapinto', 'ALP', 95, 9], ['BOT', 77, 'Bottas', 'CAD', 98, 9],
];
const CTORS: Array<[string, number, number]> = [['MCL', 620, 96], ['MER', 540, 80], ['FER', 510, 74], ['RBR', 500, 78], ['WIL', 330, 52], ['HAA', 240, 34], ['RCB', 230, 30], ['AMR', 210, 28], ['AUD', 200, 30], ['ALP', 180, 22], ['CAD', 160, 16]];

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
    { kind: 'PENALTY', entity: 'HAM', tone: '-', text: 'Ferrari confirms a new energy store for Hamilton: 10-place grid drop in Baku.', sources: '2 sources', detail: 'Governing-body doc 14 · team release' },
    { kind: 'UPGRADE', entity: 'MCL', tone: '+', text: 'McLaren brings a low-drag rear wing; long straights suit it.', sources: '3 sources', detail: 'Team release · 2 outlets' },
    { kind: 'WEATHER', entity: null, tone: '•', text: 'Race-day rain chance up from 10% to 35%. Wet delta favours Verstappen, Alonso.', sources: 'model', detail: 'Forecast feed' },
    { kind: 'RELIABILITY', entity: 'ALO', tone: '-', text: 'Aston Martin investigating a gearbox issue from Madrid; no penalty yet.', sources: '2 sources', detail: '2 outlets · unconfirmed' },
    { kind: 'CONTRACT', entity: 'COL', tone: '•', text: 'Alpine seat for 2027 still open; no change to this weekend.', sources: '4 sources', detail: '4 outlets' },
  ];
  const rivals: Rival[] = [
    { name: 'Apex Hunters', rank: 1, gap: 33, lineup: ['VER', 'RUS', 'HAD', 'ALB', 'LAW'], bank: 120, activity: 0.85 },
    { name: 'Box Box Baby', rank: 3, gap: -21, lineup: ['NOR', 'LEC', 'HAD', 'HUL', 'COL'], bank: 60, activity: 0.7 },
    { name: 'Marbles FC', rank: 4, gap: -64, lineup: ['VER', 'LEC', 'GAS', 'OCO', 'BOT'], bank: 90, activity: 0.3 },
    { name: 'Lift and Coast', rank: 5, gap: -102, lineup: ['PIA', 'HAM', 'ALO', 'BEA', 'LIN'], bank: 150, activity: 0.1 },
  ];
  return {
    example: true, asOf: '19 Sep 06:00 UTC',
    round: { number: 17, name: 'Baku', firstSession: 'FP1 Fri 25 Sep', locksIn: '6d 04h', circuit: 'Baku City Circuit' },
    rounds: ['BAK', 'SIN', 'AUS', 'MEX', 'SAO', 'LVG'], budget: 2250, teams: TEAMS, drivers, constructors, news, rivals,
    league: { name: 'Sunday Drivers', size: 10, myRank: 2 },
  };
}

export const EXAMPLE_LINEUP: Lineup = { drivers: ['NOR', 'LEC', 'SAI', 'HAD', 'BEA'], ctor: 'MER', ace: 'NOR' };
