// F-152. A car the driver table does not know is resolved from the session's entry list, and a held
// race is fetched again by itself. Runs the real converters over a stubbed feed (globalThis.fetch),
// like camaraCar51.test.js. node --test test/*.test.js after npm run build.
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-uc-test';
process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || JSON.stringify({ projectId: 'demo-uc-test' });
const test = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');
if (admin.apps.length === 0) admin.initializeApp({ projectId: 'demo-uc-test' });
const { resolveUnknownCars, nameKey, RESOLVED_BY_NAME_PREFIX, loadRoster } = require('../lib/ingestion/resolveCars.js');
const { convertToRaceResults, convertToQualifyingResults, convertToSprintResults, getGridPositions, findFastestLap, extrasFor, isUnmappedDriverWarning } = require('../lib/ingestion/openf1Client.js');
const { heldAction, HELD_RETRY_MS, HELD_RETRY_FOR_MS } = require('../lib/ingestion/checkResults.js');

// the drivers/ docs as production has them (name, shortName), trimmed
const ROSTER = [
  { id: 'norris', name: 'Lando Norris', shortName: 'NOR' },
  { id: 'bearman', name: 'Oliver Bearman', shortName: 'BEA' },
  { id: 'camara', name: 'Rafael Câmara', shortName: 'CAM' },
  { id: 'hulkenberg', name: 'Nico Hülkenberg', shortName: 'HUL' },
  { id: 'antonelli', name: 'Andrea Kimi Antonelli', shortName: 'ANT' },
  { id: 'ocon', name: 'Esteban Ocon', shortName: 'OCO' },
];

const entry = (n, acr, full, extra = {}) => ({ driver_number: n, name_acronym: acr, full_name: full, ...extra });

test('a driver we have, in a car the table does not know, is credited by code and surname (São Paulo)', () => {
  const w = [];
  const out = resolveUnknownCars([entry(1, 'NOR', 'Lando NORRIS'), entry(97, 'CAM', 'Rafael CAMARA')], ROSTER, w);
  assert.deepEqual(out, { 97: 'camara' });
  assert.equal(w.length, 1);
  assert.ok(w[0].startsWith(RESOLVED_BY_NAME_PREFIX) && w[0].includes('car 97') && w[0].includes('drivers/camara'));
  // accents and case: the provider writes HÜLKENBERG or HULKENBERG, the doc Hülkenberg
  assert.deepEqual(resolveUnknownCars([entry(96, 'HUL', 'Nico HULKENBERG')], ROSTER, []), { 96: 'hulkenberg' });
  assert.deepEqual(resolveUnknownCars([entry(96, 'HUL', 'Nico HÜLKENBERG', { last_name: 'Hülkenberg' })], ROSTER, []), { 96: 'hulkenberg' });
  assert.equal(nameKey('Câmara'), 'camara');
});

test('a driver nobody has is a stand-in under his surname, with no drivers/ doc (Mexico City)', () => {
  const w = [];
  assert.deepEqual(resolveUnknownCars([entry(45, 'DOE', 'Jane DOE')], ROSTER, w), { 45: 'doe' });
  assert.ok(w[0].includes('stand-in'));
  // the table's own stand-in id (hirakawa, car 50, no doc) back in another car is the same driver
  assert.deepEqual(resolveUnknownCars([entry(46, 'HIR', 'Ryo HIRAKAWA')], ROSTER, []), { 46: 'hirakawa' });
});

test('anything that could credit the wrong driver is refused and the car stays unknown', () => {
  const refused = (entries, why) => {
    const w = [];
    const out = resolveUnknownCars(entries, ROSTER, w);
    assert.deepEqual(out, {}, why);
    assert.ok(w.some((l) => l.endsWith('not resolved')), why);
    assert.ok(!w.some((l) => l.startsWith(RESOLVED_BY_NAME_PREFIX)), why);
  };
  refused([entry(97, 'CAM', 'Pedro CAMPOS')], 'code matches Câmara, surname does not');
  refused([entry(97, 'RCA', 'Rafael CAMARA')], 'surname matches, code does not');
  refused([entry(97, 'LNX', 'Leo NORRIS')], 'a stand-in whose surname is a driver we have');
  refused([entry(97, 'DOE', 'Jane DOE'), entry(98, 'DOE', 'John DOE')], 'two cars to one id');
  refused([entry(51, 'CAM', 'Rafael CAMARA'), entry(97, 'CAM', 'Rafael CAMARA')], 'resolves to a driver the table seats in another car');
  refused([entry(97, '', 'Jane DOE')], 'no code');
  refused([entry(97, 'DOE', '')], 'no name');
  // a roster with two drivers sharing a code: neither is chosen
  const w = [];
  assert.deepEqual(resolveUnknownCars([entry(97, 'CAM', 'Rafael CAMARA')], [...ROSTER, { id: 'campos', name: 'Pedro Campos', shortName: 'CAM' }], w), {});
});

test('known cars are never touched, and without a roster nothing is resolved', () => {
  assert.deepEqual(resolveUnknownCars([entry(1, 'NOR', 'Lando NORRIS'), entry(51, 'CAM', 'Rafael CAMARA')], ROSTER, []), {});
  assert.deepEqual(extrasFor([entry(97, 'CAM', 'Rafael CAMARA')], undefined, []), {});
});

// ---- the converters over a stubbed feed --------------------------------------------------------

const RACE = 21412;
const QUALI = 21408;
const SPRINT = 21405;
const drv = (n, acr, full, team, session) => ({ driver_number: n, name_acronym: acr, full_name: full, team_name: team, session_key: session, meeting_key: 2299 });
const res = (pos, n, laps, session) => ({ position: pos, driver_number: n, number_of_laps: laps, points: 0, dnf: false, dns: false, dsq: false, session_key: session, meeting_key: 2299 });

function withFeed(sessions, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    const s = sessions[Number(u.searchParams.get('session_key'))];
    const part = u.pathname.split('/').pop();
    const body = (s && { session_result: s.results, drivers: s.drivers, starting_grid: s.grid, laps: s.laps }[part]) || [];
    return { ok: true, status: 200, statusText: 'OK', json: async () => body };
  };
  const log = console.log;
  console.log = () => {};
  return fn().finally(() => { globalThis.fetch = real; console.log = log; });
}

// a weekend where Câmara turns up in car 97 and a stand-in nobody has drives car 45 for Haas
const weekend = {
  [RACE]: {
    drivers: [drv(1, 'NOR', 'Lando NORRIS', 'McLaren', RACE), drv(87, 'BEA', 'Oliver BEARMAN', 'Haas F1 Team', RACE), drv(97, 'CAM', 'Rafael CAMARA', 'Audi', RACE), drv(45, 'DOE', 'Jane DOE', 'Haas F1 Team', RACE)],
    results: [res(1, 1, 71, RACE), res(5, 97, 71, RACE), res(12, 45, 70, RACE), res(17, 87, 70, RACE)],
    grid: [{ position: 1, driver_number: 1 }, { position: 3, driver_number: 97 }, { position: 9, driver_number: 45 }, { position: 20, driver_number: 87 }],
    laps: [{ driver_number: 45, lap_duration: 70.1, is_pit_out_lap: false }, { driver_number: 1, lap_duration: 70.5, is_pit_out_lap: false }],
  },
  [QUALI]: {
    drivers: [drv(1, 'NOR', 'Lando NORRIS', 'McLaren', QUALI), drv(97, 'CAM', 'Rafael CAMARA', 'Audi', QUALI), drv(45, 'DOE', 'Jane DOE', 'Haas F1 Team', QUALI)],
    results: [res(1, 1, 0, QUALI), res(3, 97, 0, QUALI), res(9, 45, 0, QUALI)],
  },
  [SPRINT]: {
    drivers: [drv(1, 'NOR', 'Lando NORRIS', 'McLaren', SPRINT), drv(45, 'DOE', 'Jane DOE', 'Haas F1 Team', SPRINT)],
    results: [res(1, 45, 19, SPRINT), res(2, 1, 19, SPRINT)],
  },
};

test('with the roster, the race, qualifying, sprint, grid and fastest lap all credit the resolved cars: nothing holds', async () => {
  const out = await withFeed(weekend, async () => {
    const extras = extrasFor(weekend[RACE].drivers, ROSTER, []);
    const grid = await getGridPositions([], RACE, extras);
    const fastest = await findFastestLap(RACE, extras);
    return {
      grid, fastest,
      race: await convertToRaceResults(RACE, grid, fastest, ROSTER),
      quali: await convertToQualifyingResults(QUALI, ROSTER),
      sprint: await convertToSprintResults(SPRINT, ROSTER),
    };
  });
  assert.deepEqual(out.grid, { norris: 1, camara: 3, doe: 9, bearman: 20 });
  assert.equal(out.fastest, 'doe');
  for (const k of ['race', 'quali', 'sprint']) assert.deepEqual(out[k].warnings.filter(isUnmappedDriverWarning), [], k);
  const by = (id) => out.race.results.find((r) => r.driverId === id);
  assert.deepEqual([by('camara').position, by('camara').constructorId, by('camara').gridPosition], [5, 'audi', 3]);
  assert.deepEqual([by('doe').position, by('doe').constructorId, by('doe').fastestLap], [12, 'haas', true]);
  assert.deepEqual(out.race.results.filter((r) => r.constructorId === 'haas').map((r) => r.driverId).sort(), ['bearman', 'doe'], 'Haas scores both cars');
  assert.equal(out.race.warnings.filter((w) => w.startsWith(RESOLVED_BY_NAME_PREFIX)).length, 2, 'each resolution is reported');
  assert.deepEqual(out.quali.results.map((r) => r.driverId), ['norris', 'camara', 'doe']);
  assert.deepEqual(out.sprint.results.map((r) => r.driverId), ['doe', 'norris']);
});

test('without the roster the same weekend holds exactly as before (the Zandvoort rule)', async () => {
  const race = await withFeed(weekend, () => convertToRaceResults(RACE, {}, null));
  assert.deepEqual(race.warnings.filter(isUnmappedDriverWarning).sort(), ['Unknown driver number: 45', 'Unknown driver number: 97']);
  assert.equal(race.results.length, 2);
});

test('loadRoster reads id, name and shortName from drivers/', async () => {
  const db = { collection: (n) => ({ get: async () => ({ docs: n === 'drivers' ? [{ id: 'camara', data: () => ({ name: 'Rafael Câmara', shortName: 'CAM', price: 9 }) }] : [] }) }) };
  assert.deepEqual(await loadRoster(db), [{ id: 'camara', name: 'Rafael Câmara', shortName: 'CAM' }]);
});

// ---- the held-race retry -----------------------------------------------------------------------

test('a held race is fetched again every 30 minutes for 14 days; nothing else changes', () => {
  const race = Date.parse('2026-11-08T17:00:00Z');
  const at = (iso) => ({ toMillis: () => Date.parse(iso) });
  const held = (iso) => ({ status: 'pending', blockedReason: 'Unmapped driver number(s)', fetchedAt: at(iso) });
  const now = Date.parse('2026-11-08T19:30:00Z');
  assert.equal(HELD_RETRY_MS, 30 * 60 * 1000);
  assert.equal(heldAction(undefined, race, now), 'fetch');
  assert.equal(heldAction({ status: 'rejected' }, race, now), 'fetch');
  assert.equal(heldAction({ status: 'approved' }, race, now), 'skip');
  assert.equal(heldAction(held('2026-11-08T19:10:00Z'), race, now), 'skip', '20 minutes since the last fetch');
  assert.equal(heldAction(held('2026-11-08T19:00:00Z'), race, now), 'retry', '30 minutes');
  assert.equal(heldAction({ status: 'pending', blockedReason: 'x' }, race, now), 'retry', 'no fetchedAt');
  assert.equal(heldAction({ status: 'pending', fetchedAt: at('2026-11-08T19:00:00Z') }, race, now), 'skip', 'pending without a reason waits for an admin');
  assert.equal(heldAction(held('2026-11-01T00:00:00Z'), race, race + HELD_RETRY_FOR_MS + 1), 'skip', 'past 14 days: a hand re-queue');
});
