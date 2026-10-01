// node --test newgame/functions/scripts/ — race schedule repair planning.
// Pure plan objects only; no Firestore.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toIso, planScheduleFix, hasChanges, isRepairable, seedRaces } = require('./fixRaceSchedules');

const ts = (iso) => ({ toDate: () => new Date(iso) });

test('toIso accepts Firestore Timestamps, Dates, ISO strings and _seconds', () => {
  assert.equal(toIso(ts('2026-10-11T12:00:00.000Z')), '2026-10-11T12:00:00.000Z');
  assert.equal(toIso(new Date('2026-10-11T12:00:00Z')), '2026-10-11T12:00:00.000Z');
  assert.equal(toIso('2026-10-11T12:00:00Z'), '2026-10-11T12:00:00.000Z');
  assert.equal(toIso({ _seconds: Date.parse('2026-10-11T12:00:00Z') / 1000 }), '2026-10-11T12:00:00.000Z');
  assert.equal(toIso(null), null);
  assert.equal(toIso(undefined), null);
  assert.equal(toIso('not a date'), null);
});

test('a matching race plans no changes', () => {
  const race = { hasSprint: false, schedule: { qualifying: ts('2026-09-25T12:00:00Z'), race: ts('2026-09-26T11:00:00Z') } };
  const seed = { hasSprint: false, schedule: { qualifying: '2026-09-25T12:00:00.000Z', race: '2026-09-26T11:00:00.000Z' } };
  const plan = planScheduleFix(race, seed);
  assert.deepEqual(plan.sets, {});
  assert.deepEqual(plan.deletes, []);
  assert.equal(plan.hasSprint, undefined);
  assert.equal(hasChanges(plan), false);
});

test('shifted times are planned as sets (the R18-R24 off-by-one)', () => {
  const race = { hasSprint: true, schedule: { qualifying: ts('2026-10-03T08:00:00Z'), race: ts('2026-10-04T07:00:00Z') } };
  const seed = { hasSprint: true, schedule: { qualifying: '2026-10-10T14:00:00.000Z', race: '2026-10-11T12:00:00.000Z' } };
  const plan = planScheduleFix(race, seed);
  assert.deepEqual(plan.sets, {
    qualifying: '2026-10-10T14:00:00.000Z',
    race: '2026-10-11T12:00:00.000Z',
  });
  assert.equal(hasChanges(plan), true);
});

// The reason this script exists instead of re-running tlSeedRaces: a merge
// write cannot remove a key, so the stray sprint/fp keys would survive.
test('keys absent from the seed are planned for deletion', () => {
  const race = {
    hasSprint: true,
    schedule: { fp1: ts('2026-10-23T17:30:00Z'), sprint: ts('2026-10-10T09:00:00Z'), sprintQualifying: ts('2026-10-09T12:30:00Z') },
  };
  const seed = { hasSprint: false, schedule: { fp1: '2026-10-23T17:30:00.000Z' } };
  const plan = planScheduleFix(race, seed);
  assert.deepEqual(plan.sets, {});
  assert.deepEqual(plan.deletes, ['sprint', 'sprintQualifying']);
  assert.equal(plan.hasSprint, false);
  assert.equal(hasChanges(plan), true);
});

test('hasSprint is only planned when it actually differs', () => {
  const same = planScheduleFix({ hasSprint: true, schedule: {} }, { hasSprint: true, schedule: {} });
  assert.equal(same.hasSprint, undefined);
  const flip = planScheduleFix({ hasSprint: true, schedule: {} }, { hasSprint: false, schedule: {} });
  assert.equal(flip.hasSprint, false);
  // Missing vs explicit false must not register as a change.
  const absent = planScheduleFix({ schedule: {} }, { hasSprint: false, schedule: {} });
  assert.equal(absent.hasSprint, undefined);
});

test('completed races are not repairable; everything else is', () => {
  assert.equal(isRepairable({ status: 'completed' }), false);
  assert.equal(isRepairable({ status: 'upcoming' }), true);
  assert.equal(isRepairable({ status: 'in_progress' }), true);
  assert.equal(isRepairable({}), true);
});

test('the bundled seed file is self-consistent and matches the real 2026 sprint calendar', () => {
  const races = seedRaces();
  assert.ok(races.length >= 20, 'seed file should hold a full season');
  // The six 2026 sprints: China, Miami, Canada, Silverstone, Zandvoort, Singapore.
  const sprints = races.filter((r) => r.hasSprint === true).map((r) => r.id).sort();
  assert.deepEqual(sprints, [
    'britain_2026', 'canada_2026', 'china_2026', 'miami_2026', 'netherlands_2026', 'singapore_2026',
  ]);
  for (const r of races) {
    const sc = r.schedule || {};
    const raceAt = toIso(sc.race);
    assert.ok(raceAt, `${r.id} has no race time`);
    // No session may fall after its own race — the corruption that made
    // Singapore's sprint land six days after its grand prix.
    for (const [k, v] of Object.entries(sc)) {
      if (k === 'race') continue;
      assert.ok(toIso(v) <= raceAt, `${r.id}: ${k} (${toIso(v)}) is after the race (${raceAt})`);
    }
    // A sprint round runs one practice session and carries both sprint keys.
    if (r.hasSprint) {
      assert.ok(sc.sprint && sc.sprintQualifying, `${r.id}: sprint round missing sprint keys`);
      assert.ok(!sc.fp2 && !sc.fp3, `${r.id}: sprint weekends run FP1 only`);
    } else {
      assert.ok(!sc.sprint && !sc.sprintQualifying, `${r.id}: non-sprint round carries sprint keys`);
    }
  }
});
