// node --test newgame/functions/scripts/ — pure checks, no Firestore.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkLines } = require('./checkBenLines');

const drivers = [{ id: 'a', isActive: true }, { id: 'b', isActive: true }, { id: 'c', isActive: true }];
const constructors = [{ id: 't1', isActive: true }];
const line = (id, kind = 'driver', lo = 3, hi = 6) => ({ entityId: id, entityKind: kind, predictedLo: lo, predictedHi: hi, withOdds: 1.43, againstOdds: 2.87 });
const race = (over = {}) => ({ id: 'x_2026', status: 'upcoming', hasSprint: false, schedule: { qualifying: Date.parse('2026-09-12T14:00:00Z'), race: Date.parse('2026-09-13T13:00:00Z') }, ...over });
const cleanDocs = () => ({
  qualifying: { posted: true, updatedAt: Date.parse('2026-09-08T00:00:00Z'), entities: { a: line('a'), b: line('b'), c: line('c') } },
  race: {
    posted: true, bestBetsSource: 'manual', updatedAt: Date.parse('2026-09-08T00:00:00Z'),
    entities: { a: { ...line('a'), bestBet: true }, b: { ...line('b'), bestBet: true }, c: { ...line('c'), bestBet: true }, t1: line('t1', 'constructor', 8, 14) },
  },
});
const run = (docs, over = {}) => checkLines({ race: race(), docs, drivers, constructors, lastCompletedRaceStart: Date.parse('2026-09-06T13:00:00Z'), now: Date.parse('2026-09-10T00:00:00Z'), ...over });
const titles = (f) => f.map((x) => `${x.severity} ${x.title}`);

test('clean lines produce no findings', () => {
  assert.deepEqual(run(cleanDocs()), []);
});

test('ranges: inverted and unreachable are critical, covering every result is high', () => {
  const d = cleanDocs();
  d.race.entities.a = { ...line('a', 'driver', 7, 4), bestBet: true };
  d.race.entities.b = { ...line('b', 'driver', 23, 30), bestBet: true };
  d.race.entities.t1 = line('t1', 'constructor', 1, 44);
  const t = titles(run(d));
  assert.ok(t.includes('critical x_2026_race: a range 7–4 is inverted'));
  assert.ok(t.some((x) => x.startsWith('critical x_2026_race: b range 23–30 is unreachable')));
  assert.ok(t.includes('high x_2026_race: t1 range 1–44 covers every result'));
});

test('one-sided best-bet ranges are valid', () => {
  const d = cleanDocs();
  d.race.entities.a = { ...line('a', 'driver', 5, 22), bestBet: true, benCall: 'O 4.5' };
  d.race.entities.t1 = { ...line('t1', 'constructor', 3, 34), benCall: 'U 17.5' };
  assert.deepEqual(run(d), []);
});

test('odds: non-numbers and values not above 1.00 are critical; a book under 100% is flagged', () => {
  const d = cleanDocs();
  d.race.entities.a = { ...d.race.entities.a, withOdds: 0.98 };
  d.race.entities.b = { ...d.race.entities.b, againstOdds: NaN };
  d.race.entities.c = { ...d.race.entities.c, withOdds: 1.94, againstOdds: 2.07 };
  d.qualifying.entities.a = { ...line('a'), withOdds: 1.6, againstOdds: 2.9 };
  const f = run(d);
  assert.ok(titles(f).includes('critical x_2026_race: a withOdds 0.98 is not above 1.00'));
  assert.ok(titles(f).includes('critical x_2026_race: b againstOdds is null'));
  assert.equal(f.find((x) => x.title.startsWith('x_2026_race: c odds'))?.severity, 'medium');
  assert.equal(f.find((x) => x.title.startsWith('x_2026_qualifying: a odds'))?.severity, 'high');
});

test('best bets: outside the race session, and not exactly 3', () => {
  const d = cleanDocs();
  d.qualifying.entities.a = { ...line('a'), bestBet: true };
  delete d.race.entities.c.bestBet;
  const t = titles(run(d));
  assert.ok(t.includes('high x_2026_qualifying: a is a best bet outside the race session'));
  assert.ok(t.includes('medium x_2026_race: 2 best bet(s), expected 3'));
});

test('coverage: missing drivers/constructors, unknown and legacy entities', () => {
  const d = cleanDocs();
  delete d.race.entities.t1;
  delete d.qualifying.entities.c;
  d.race.entities.zz = line('zz');
  d.race.entities.old = { entityId: 'old', entityKind: 'driver', line: 5, withOdds: 1.9, againstOdds: 1.9 };
  const t = titles(run(d));
  assert.ok(t.includes('high x_2026_race: no line for constructor t1'));
  assert.ok(t.includes('high x_2026_qualifying: no line for driver c'));
  assert.ok(t.includes('medium x_2026_race: zz is not an active driver or constructor'));
  assert.ok(t.includes('high x_2026_race: old has no predictedLo/predictedHi'));
});

test('freshness: stale lines and edits after lock, only while the race is live', () => {
  const stale = cleanDocs();
  stale.race.updatedAt = Date.parse('2026-09-01T00:00:00Z');
  assert.ok(titles(run(stale)).includes('high x_2026_race: lines are older than the last completed race'));
  const late = cleanDocs();
  late.qualifying.updatedAt = Date.parse('2026-09-12T15:00:00Z');
  assert.ok(titles(run(late, { now: Date.parse('2026-09-12T16:00:00Z') })).includes('high x_2026_qualifying: lines changed after the session locked'));
  assert.deepEqual(run(stale, { race: race({ status: 'completed' }) }), []);
});

test('empty docs matter only when lines are expected', () => {
  assert.ok(titles(run({})).includes('high x_2026_qualifying: no lines posted'));
  assert.deepEqual(run({}, { expectLines: false }), []);
});
