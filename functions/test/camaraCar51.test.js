// F-139. São Paulo 2026 was held on "Unknown driver number: 51": F-138 had Câmara in car 50 and he
// raced 51. This runs the real race and qualifying converters over a stubbed feed shaped like the
// provider's São Paulo rows (sessions 11412 Race / 11408 Qualifying) and checks the hold reason is
// gone, and that an unknown number still raises it. node --test test/*.test.js after npm run build.
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-uc-test';
process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || JSON.stringify({ projectId: 'demo-uc-test' });
const test = require('node:test');
const assert = require('node:assert/strict');
const { convertToRaceResults, convertToQualifyingResults, isUnmappedDriverWarning } = require('../lib/ingestion/openf1Client.js');

const drv = (n, acr, team, session) => ({ driver_number: n, name_acronym: acr, team_name: team, session_key: session, meeting_key: 1299 });
const res = (pos, n, laps, session, extra = {}) => ({ position: pos, driver_number: n, number_of_laps: laps, points: 0, dnf: false, dns: false, dsq: false, session_key: session, meeting_key: 1299, ...extra });

function feed(sessions) {
  return async (url) => {
    const u = new URL(String(url));
    const key = Number(u.searchParams.get('session_key'));
    const s = sessions[key];
    let body = [];
    if (s && u.pathname.endsWith('/session_result')) body = s.results;
    else if (s && u.pathname.endsWith('/drivers')) body = s.drivers;
    return { ok: true, status: 200, statusText: 'OK', json: async () => body };
  };
}

async function withFeed(sessions, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = feed(sessions);
  const log = console.log;
  console.log = () => {};
  try { return await fn(); } finally { globalThis.fetch = real; console.log = log; }
}

const RACE = 11412;
const QUALI = 11408;
const saoPaulo = (carNumber, acronym) => ({
  [RACE]: {
    drivers: [drv(1, 'NOR', 'McLaren', RACE), drv(87, 'BEA', 'Haas F1 Team', RACE), drv(carNumber, acronym, 'Haas F1 Team', RACE)],
    results: [res(1, 1, 71, RACE), res(17, 87, 70, RACE), res(20, carNumber, 69, RACE)],
  },
  [QUALI]: {
    drivers: [drv(1, 'NOR', 'McLaren', QUALI), drv(87, 'BEA', 'Haas F1 Team', QUALI), drv(carNumber, acronym, 'Haas F1 Team', QUALI)],
    results: [res(1, 1, 0, QUALI), res(13, carNumber, 0, QUALI), res(15, 87, 0, QUALI)],
  },
});

test('car 51 converts to Câmara in the Haas in the race and qualifying, with no unmapped-driver warning', async () => {
  const { race, quali } = await withFeed(saoPaulo(51, 'CAM'), async () => ({
    race: await convertToRaceResults(RACE, {}, null),
    quali: await convertToQualifyingResults(QUALI),
  }));
  assert.deepEqual(race.warnings.filter(isUnmappedDriverWarning), []);
  assert.deepEqual(quali.warnings.filter(isUnmappedDriverWarning), []);
  const cam = race.results.find((r) => r.driverId === 'camara');
  assert.ok(cam, 'camara missing from the race');
  assert.deepEqual([cam.position, cam.constructorId, cam.laps], [20, 'haas', 69]);
  assert.deepEqual(race.results.filter((r) => r.constructorId === 'haas').map((r) => r.driverId).sort(), ['bearman', 'camara']);
  assert.deepEqual(quali.results.find((r) => r.driverId === 'camara'), { position: 13, driverId: 'camara', constructorId: 'haas' });
  assert.equal(race.results.some((r) => r.driverId === 'hirakawa'), false);
});

test('a number the table does not know still raises the hold (the guard F-139 relies on is intact)', async () => {
  const { race, quali } = await withFeed(saoPaulo(52, 'ZZZ'), async () => ({
    race: await convertToRaceResults(RACE, {}, null),
    quali: await convertToQualifyingResults(QUALI),
  }));
  assert.equal(race.warnings.filter(isUnmappedDriverWarning).length > 0, true);
  assert.equal(quali.warnings.filter(isUnmappedDriverWarning).length > 0, true);
});
