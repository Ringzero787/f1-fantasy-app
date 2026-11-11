// F-138 / F-139. Car 50 is Hirakawa's (Mexico City stand-in) and Câmara races 51 from São Paulo;
// 50 stays a shared number, so a row that names its driver resolves by the name and a row with
// only the number resolves to the table entry. node --test test/*.test.js after npm run build.
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-uc-test';
process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || JSON.stringify({ projectId: 'demo-uc-test' });
const test = require('node:test');
const assert = require('node:assert/strict');
const { DRIVER_NUMBER_TO_ID, SHARED_NUMBERS, driverIdFor, numberToIdFor } = require('../lib/ingestion/config.js');
const { latestByDriver } = require('../lib/moonshot/liveSweep.js');

test('car 50 is Hirakawa, Câmara is 51 (F-139), and the shared entry names both', () => {
  assert.equal(DRIVER_NUMBER_TO_ID[50], 'hirakawa');
  assert.equal(DRIVER_NUMBER_TO_ID[51], 'camara');   // F-139: his São Paulo car
  assert.deepEqual(SHARED_NUMBERS[50], { HIR: 'hirakawa', CAM: 'camara' });
  assert.equal(DRIVER_NUMBER_TO_ID[31], 'ocon');   // stored results keep his number
});

test('a named row resolves by the name; a bare number resolves to the current occupant', () => {
  assert.equal(driverIdFor(50, 'HIR'), 'hirakawa');
  assert.equal(driverIdFor(50, 'CAM'), 'camara');
  assert.equal(driverIdFor(50, ' cam '), 'camara');
  assert.equal(driverIdFor(50), 'hirakawa');
  assert.equal(driverIdFor(50, 'XXX'), 'hirakawa');   // an acronym the table does not list falls back to the number
  assert.equal(driverIdFor(50, null), 'hirakawa');
  assert.equal(driverIdFor(51), 'camara');
  assert.equal(driverIdFor(51, 'CAM'), 'camara');
});

test('an unshared number ignores the name; an unknown number is undefined either way', () => {
  assert.equal(driverIdFor(87, 'HIR'), 'bearman');
  assert.equal(driverIdFor(99), undefined);
  assert.equal(driverIdFor(99, 'CAM'), undefined);
  assert.equal(driverIdFor('50'), undefined);
  assert.equal(driverIdFor(50.5), undefined);
  assert.equal(driverIdFor(50, 'constructor'), 'hirakawa');   // a prototype name is not a table key
});

test('a session entry list resolves the shared number to whoever it names, others as the table', () => {
  const mexico = [{ driver_number: 50, name_acronym: 'HIR' }, { driver_number: 87, name_acronym: 'BEA' }];
  const brazil = [{ driver_number: 50, name_acronym: 'CAM' }, { driver_number: 87, name_acronym: 'BEA' }, { driver_number: 99, name_acronym: 'ZZZ' }];
  assert.equal(numberToIdFor(mexico)[50], 'hirakawa');
  assert.equal(numberToIdFor(brazil)[50], 'camara');
  assert.equal(numberToIdFor(brazil)[87], 'bearman');
  assert.equal(numberToIdFor(brazil)[99], undefined);
  assert.equal(numberToIdFor([])[50], 'hirakawa');
  assert.equal(numberToIdFor([{ driver_number: 51, name_acronym: 'CAM' }])[51], 'camara');
  assert.equal(numberToIdFor(brazil)[3], 'verstappen');   // the rest of the table rides along
});

test('a result row on a shared number is credited by name; an occupant the table does not list is credited to the current one with a warning', () => {
  const { driverIdForRow } = require('../lib/ingestion/openf1Client.js');
  const { unlistedOccupant } = require('../lib/ingestion/config.js');
  const warnings = [];
  assert.equal(driverIdForRow(50, new Map([[50, 'HIR']]), warnings, 'race'), 'hirakawa');
  assert.equal(driverIdForRow(50, new Map([[50, 'CAM']]), warnings, 'race'), 'camara');
  assert.equal(driverIdForRow(50, new Map(), warnings, 'race'), 'hirakawa');   // no entry list: the table entry, no warning
  assert.equal(driverIdForRow(51, new Map([[51, 'CAM']]), warnings, 'race'), 'camara');   // F-139: his São Paulo car
  assert.equal(driverIdForRow(87, new Map([[87, 'XYZ']]), warnings, 'race'), 'bearman');   // an unshared number ignores the name
  assert.equal(driverIdForRow(99, new Map([[99, 'CAM']]), warnings, 'race'), undefined);   // an unknown number is still unmapped
  assert.deepEqual(warnings, []);
  assert.equal(driverIdForRow(50, new Map([[50, 'XYZ']]), warnings, 'sprint'), 'hirakawa');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Car 50 has changed hands this season and the sprint session names XYZ in it.*credited to hirakawa/);
  assert.equal(unlistedOccupant(50, 'xyz'), true);
  assert.equal(unlistedOccupant(50, 'hir'), false);
  assert.equal(unlistedOccupant(87, 'XYZ'), false);
  assert.equal(unlistedOccupant(50, undefined), false);
});

test('the live sweep maps positions through the session map, so car 50 is whoever the session names', () => {
  const rows = [{ driver_number: 50, position: 13, date: '2026-10-25T20:40:00Z' }, { driver_number: 87, position: 9, date: '2026-10-25T20:40:00Z' }];
  assert.deepEqual(latestByDriver(rows, numberToIdFor([{ driver_number: 50, name_acronym: 'HIR' }])), { hirakawa: 13, bearman: 9 });
  assert.deepEqual(latestByDriver(rows, numberToIdFor([{ driver_number: 50, name_acronym: 'CAM' }])), { camara: 13, bearman: 9 });
  assert.deepEqual(latestByDriver(rows), { hirakawa: 13, bearman: 9 });
});

test('F-139: every car number in the São Paulo 2026 race and qualifying entry lists maps (Câmara is 51)', () => {
  // the provider's driver records for sessions 11408 (Qualifying) and 11412 (Race), meeting 1299:
  // both lists are exactly these numbers (api.openf1.org/v1/drivers?session_key=…, read 2026-11-11)
  const saoPaulo = [1, 3, 5, 6, 10, 11, 12, 14, 16, 18, 23, 27, 30, 41, 43, 44, 51, 55, 63, 77, 81, 87];
  const map = numberToIdFor(saoPaulo.map((n) => ({ driver_number: n, name_acronym: n === 51 ? 'CAM' : undefined })));
  for (const n of saoPaulo) assert.ok(map[n], `car ${n} is unmapped`);
  assert.equal(map[51], 'camara');
  assert.equal(new Set(saoPaulo.map((n) => map[n])).size, saoPaulo.length);   // no two cars credited to one driver
});
