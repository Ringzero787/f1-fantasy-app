// F-138. Car 50 has had two occupants in 2026 (Hirakawa at Mexico City, Câmara from São Paulo):
// a row that names its driver resolves by the name, a row with only the number resolves to the
// current occupant. node --test test/*.test.js after npm run build.
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-uc-test';
process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || JSON.stringify({ projectId: 'demo-uc-test' });
const test = require('node:test');
const assert = require('node:assert/strict');
const { DRIVER_NUMBER_TO_ID, SHARED_NUMBERS, driverIdFor, numberToIdFor } = require('../lib/ingestion/config.js');
const { latestByDriver } = require('../lib/moonshot/liveSweep.js');

test('the table holds the current occupant of a shared number and names both', () => {
  assert.equal(DRIVER_NUMBER_TO_ID[50], 'camara');
  assert.deepEqual(SHARED_NUMBERS[50], { HIR: 'hirakawa', CAM: 'camara' });
  assert.equal(DRIVER_NUMBER_TO_ID[31], 'ocon');   // stored results keep his number
});

test('a named row resolves by the name; a bare number resolves to the current occupant', () => {
  assert.equal(driverIdFor(50, 'HIR'), 'hirakawa');
  assert.equal(driverIdFor(50, 'CAM'), 'camara');
  assert.equal(driverIdFor(50, ' cam '), 'camara');
  assert.equal(driverIdFor(50), 'camara');
  assert.equal(driverIdFor(50, 'XXX'), 'camara');   // an acronym the table does not list falls back to the number
  assert.equal(driverIdFor(50, null), 'camara');
});

test('an unshared number ignores the name; an unknown number is undefined either way', () => {
  assert.equal(driverIdFor(87, 'HIR'), 'bearman');
  assert.equal(driverIdFor(99), undefined);
  assert.equal(driverIdFor(99, 'CAM'), undefined);
  assert.equal(driverIdFor('50'), undefined);
  assert.equal(driverIdFor(50.5), undefined);
  assert.equal(driverIdFor(50, 'constructor'), 'camara');   // a prototype name is not a table key
});

test('a session entry list resolves the shared number to whoever it names, others as the table', () => {
  const mexico = [{ driver_number: 50, name_acronym: 'HIR' }, { driver_number: 87, name_acronym: 'BEA' }];
  const brazil = [{ driver_number: 50, name_acronym: 'CAM' }, { driver_number: 87, name_acronym: 'BEA' }, { driver_number: 99, name_acronym: 'ZZZ' }];
  assert.equal(numberToIdFor(mexico)[50], 'hirakawa');
  assert.equal(numberToIdFor(brazil)[50], 'camara');
  assert.equal(numberToIdFor(brazil)[87], 'bearman');
  assert.equal(numberToIdFor(brazil)[99], undefined);
  assert.equal(numberToIdFor([])[50], 'camara');
  assert.equal(numberToIdFor(brazil)[3], 'verstappen');   // the rest of the table rides along
});

test('a result row on a shared number is credited by name; an occupant the table does not list is credited to the current one with a warning', () => {
  const { driverIdForRow } = require('../lib/ingestion/openf1Client.js');
  const { unlistedOccupant } = require('../lib/ingestion/config.js');
  const warnings = [];
  assert.equal(driverIdForRow(50, new Map([[50, 'HIR']]), warnings, 'race'), 'hirakawa');
  assert.equal(driverIdForRow(50, new Map([[50, 'CAM']]), warnings, 'race'), 'camara');
  assert.equal(driverIdForRow(50, new Map(), warnings, 'race'), 'camara');   // no entry list: the current occupant, no warning
  assert.equal(driverIdForRow(87, new Map([[87, 'XYZ']]), warnings, 'race'), 'bearman');   // an unshared number ignores the name
  assert.equal(driverIdForRow(99, new Map([[99, 'CAM']]), warnings, 'race'), undefined);   // an unknown number is still unmapped
  assert.deepEqual(warnings, []);
  assert.equal(driverIdForRow(50, new Map([[50, 'XYZ']]), warnings, 'sprint'), 'camara');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Car 50 has changed hands this season and the sprint session names XYZ in it.*credited to camara/);
  assert.equal(unlistedOccupant(50, 'xyz'), true);
  assert.equal(unlistedOccupant(50, 'hir'), false);
  assert.equal(unlistedOccupant(87, 'XYZ'), false);
  assert.equal(unlistedOccupant(50, undefined), false);
});

test('the live sweep maps positions through the session map, so car 50 is whoever the session names', () => {
  const rows = [{ driver_number: 50, position: 13, date: '2026-10-25T20:40:00Z' }, { driver_number: 87, position: 9, date: '2026-10-25T20:40:00Z' }];
  assert.deepEqual(latestByDriver(rows, numberToIdFor([{ driver_number: 50, name_acronym: 'HIR' }])), { hirakawa: 13, bearman: 9 });
  assert.deepEqual(latestByDriver(rows, numberToIdFor([{ driver_number: 50, name_acronym: 'CAM' }])), { camara: 13, bearman: 9 });
  assert.deepEqual(latestByDriver(rows), { camara: 13, bearman: 9 });
});
