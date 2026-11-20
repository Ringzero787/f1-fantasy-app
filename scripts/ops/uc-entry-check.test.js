// node --test scripts/ops/*.test.js. The race-weekend entry check's rules: which weekend it is,
// what is an alert and what is only a note. A false alarm on every FP1 rookie would teach the
// owner to ignore the mail that matters (Mexico F-134, Brazil F-139).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parseNumberMap, pickRace, previousRace, compareEntry, renderReport, isScoringSession, clean } = require('./uc-entry-check-lib');
const { verdict, failures } = require('./pitwall-alert-lib');

const CONFIG = `export const X = 1;
export const DRIVER_NUMBER_TO_ID: Record<number, string> = {
${Array.from({ length: 20 }, (_, i) => `  ${i + 1}: '${'d' + (i + 1)}',`).join('\n')}
  44: "hamilton",
};

export const ALIASES = {
  50: { HIR: 'hirakawa', CAM: 'camara' },
};
`;
const car = (n, a, team = 'T') => ({ driver_number: n, name_acronym: a, team_name: team });
const H = 3600e3;
const race = (key, iso, location = `L${key}`) => ({ meeting_key: key, session_key: key * 10, date_start: iso, location, year: 2026 });

test('the number map: top-level entries only, and a parse that finds too few is an error', () => {
  const map = parseNumberMap(CONFIG);
  assert.equal(map['44'], 'hamilton');
  assert.equal(map['1'], 'd1');
  assert.equal(map['50'], undefined);
  assert.throws(() => parseNumberMap('const DRIVER_NUMBER_TO_ID = {\n  1: "a",\n}'), /only 1 cars/);
  assert.throws(() => parseNumberMap('nothing here'), /not found/);
});

test('the weekend runs from 5 days before the race start to 8 hours after', () => {
  const t = Date.parse('2026-11-22T04:00:00Z');
  const races = [race(2, '2026-11-22T04:00:00Z'), race(1, '2026-11-08T17:00:00Z'), race(3, '2026-12-06T13:00:00Z')];
  assert.equal(pickRace(races, t - 5 * 24 * H)?.meeting_key, 2);
  assert.equal(pickRace(races, t - 5 * 24 * H - 1), undefined);
  assert.equal(pickRace(races, t + 8 * H)?.meeting_key, 2);
  assert.equal(pickRace(races, t + 8 * H + 1), undefined);
  assert.equal(previousRace(races, races[0]).meeting_key, 1);
  assert.equal(previousRace(races, races[1]), undefined);
});

test('race list: an unmapped car and a number with a new driver are alerts', () => {
  const map = parseNumberMap(CONFIG);
  const { fail, note } = compareEntry({
    entry: [car(1, 'AAA'), car(2, 'NEW'), car(99, 'XYZ')],
    last: [car(1, 'AAA'), car(2, 'OLD'), car(3, 'GON')],
    lastName: 'Brazil', raceName: 'Las Vegas 2026', map, alerting: true,
  });
  assert.equal(fail.length, 2);
  assert.match(fail[0], /^Las Vegas 2026: car 99 XYZ .*not in DRIVER_NUMBER_TO_ID/);
  assert.match(fail[1], /car 2 was OLD at Brazil, now NEW/);
  assert.deepEqual(note, ['Las Vegas 2026: car 3 GON (T) raced at Brazil and is not on this entry list']);
});

test('practice list before the race list is out: stand-ins are notes, never alerts', () => {
  const map = parseNumberMap(CONFIG);
  const { fail, note } = compareEntry({ entry: [car(34, 'CRA'), car(2, 'BEG')], last: [car(2, 'HAM')], map, alerting: false });
  assert.deepEqual(fail, []);
  assert.equal(note.length, 2);
});

test('the report reads the way pitwall-alert expects', () => {
  const bad = renderReport({ stamp: '2026-11-20T00:00:00Z', title: 't', fail: ['car 9 X'], note: ['n'] });
  assert.equal(bad.verdict, 'FAIL');
  assert.equal(verdict(bad.text), 'FAIL');
  assert.deepEqual(failures(bad.text), ['**entry** car 9 X']);
  const warn = renderReport({ stamp: 's', title: 't', fail: [], note: ['n'] });
  assert.equal(verdict(warn.text), 'WARN');
  assert.deepEqual(failures(warn.text), []);
  assert.equal(verdict(renderReport({ stamp: 's', title: 't', fail: [], note: [] }).text), 'OK');
});

test('the repo\'s real config.ts parses, with the stand-in seats of Mexico and Brazil', () => {
  const map = parseNumberMap(fs.readFileSync(path.join(__dirname, '../../functions/src/ingestion/config.ts'), 'utf8'));
  assert.equal(map['50'], 'hirakawa');
  assert.equal(map['51'], 'camara');
  assert.equal(map['44'], 'hamilton');
});

test('qualifying and sprint lists alert like the race list; practice lists never do', () => {
  for (const s of ['Race', 'Qualifying', 'Sprint', 'Sprint Qualifying', 'Sprint Shootout']) assert.equal(isScoringSession(s), true, s);
  for (const s of ['Practice 1', 'Practice 2', 'Practice 3', undefined]) assert.equal(isScoringSession(s), false, String(s));
});

test('OpenF1 text cannot forge or hide a report line', () => {
  const map = parseNumberMap(CONFIG);
  const { fail } = compareEntry({ entry: [car(99, 'X\n- ✗ fake', 'T\n## Triage')], map, alerting: true });
  const r = renderReport({ stamp: 's', title: 't', fail, note: [] });
  assert.deepEqual(failures(r.text).length, 1);
  assert.equal(clean('a\u0000b\nc'), 'a b c');
  assert.equal(clean('x'.repeat(100)).length, 60);
});
