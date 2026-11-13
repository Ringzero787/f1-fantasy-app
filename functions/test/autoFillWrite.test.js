// F-141. Runs against the compiled output: `npm --prefix functions run build && node --test functions/test`.
//
// The lock-time auto-fill (F-044) never filled a single team in production. Its write was
// tx.update({ constructor: … }), and the Firestore SDK expands update() keys into a plain object
// where `constructor` is Object.prototype.constructor — it throws "AssertionError: Can't merge
// current value into a nested object" before anything is sent. The unit tests passed because
// they only ever tested the plan, never the write. These push the real payload through the real
// SDK's write path, offline: the assertion fires inside commit() before any RPC, so a payload
// that gets as far as the network is one the SDK accepted.
const test = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const { planAutoFill, autoFillWrite } = require('../lib/teams/autoFill.js');

const C = (id, price, form, constructorId = 'x') => ({ id, name: id, shortName: id.slice(0, 3).toUpperCase(), constructorId, price, form });
const CTX = {
  drivers: [C('hadjar', 89, 35), C('lawson', 202, 33), C('gasly', 178, 30), C('hulkenberg', 65, 17), C('alonso', 86, 9), C('stroll', 5, 2)],
  constructors: [C('red_bull', 300, 60), C('aston_martin', 9, 13)],
  completedRaceCount: 20,
  formRaceIds: [],
};
// The shape of 90 of the 94 production teams on 2026-11-13: played all season, roster emptied by
// contract expiry, constructor field present but null.
const EMPTY_TEAM = { drivers: [], constructor: null, budget: 1000, totalSpent: 0, scoredRaces: ['mexico_2026', 'brazil_2026'], isLocked: false };

// An unreachable emulator host: nothing can be written, and a payload the SDK accepts fails
// later with a connection error instead of the assertion.
function offlineDb() {
  return new admin.firestore.Firestore({ projectId: 'f141-offline', host: '127.0.0.1:9', ssl: false, preferRest: true });
}

async function commitOutcome(db, apply) {
  const batch = db.batch();
  apply(batch, db.doc('fantasyTeams/t1'));
  try {
    await Promise.race([batch.commit(), new Promise((_, reject) => setTimeout(() => reject(new Error('reached the network')), 3000))]);
    return 'committed';
  } catch (e) {
    return e && e.code === 'ERR_ASSERTION' ? `assertion: ${e.message}` : 'accepted by the SDK';
  }
}

test('a team that needs a constructor gets one in the plan (the case that always failed)', () => {
  const plan = planAutoFill(EMPTY_TEAM, CTX);
  assert.ok(plan, 'an incomplete team that has played must get a plan');
  assert.equal(plan.drivers.length, 5);
  assert.ok(plan.constructor, 'the plan must include a constructor');
});

test('the auto-fill write passes the real SDK write path with a constructor in it', async () => {
  const db = offlineDb();
  const plan = planAutoFill(EMPTY_TEAM, CTX);
  const { data, options } = autoFillWrite(EMPTY_TEAM, plan, 'las_vegas_2026');
  assert.ok('constructor' in data, 'the payload under test must carry the constructor');
  const outcome = await commitOutcome(db, (b, ref) => b.set(ref, data, options));
  await db.terminate();
  assert.notEqual(outcome.slice(0, 9), 'assertion', `the SDK rejected the auto-fill write: ${outcome}`);
});

test('control: the old update() shape is still rejected, so the test above can tell them apart', async () => {
  const db = offlineDb();
  const plan = planAutoFill(EMPTY_TEAM, CTX);
  const { data } = autoFillWrite(EMPTY_TEAM, plan, 'las_vegas_2026');
  const outcome = await commitOutcome(db, (b, ref) => b.update(ref, data));
  await db.terminate();
  assert.match(outcome, /^assertion: Can't merge current value into a nested object/);
});

test('the write replaces each field whole and names every field it writes', () => {
  const plan = planAutoFill(EMPTY_TEAM, CTX);
  const { data, options } = autoFillWrite({ ...EMPTY_TEAM, totalSpent: 40 }, plan, 'las_vegas_2026');
  assert.deepEqual([...options.mergeFields].sort(), Object.keys(data).sort());
  assert.ok(options.mergeFields.includes('lastAutoFill'), 'lastAutoFill is the only record that a fill happened');
  assert.equal(data.totalSpent, Math.round(40 + plan.cost));
  assert.equal(data.budget, plan.budget);
  assert.equal(data.lastAutoFill.raceId, 'las_vegas_2026');
  assert.equal(data.lastAutoFill.constructorId, plan.filledConstructorId);
});

test('a team that already has a constructor keeps it: written back unchanged, nothing bought', () => {
  const owned = { constructorId: 'aston_martin', name: 'aston_martin', purchasePrice: 9, currentPrice: 9 };
  const team = { ...EMPTY_TEAM, constructor: owned };
  const plan = planAutoFill(team, CTX);
  const { data } = autoFillWrite(team, plan, 'las_vegas_2026');
  // the plan carries the owned constructor (read in the same transaction), so the write is a no-op for it
  assert.deepEqual(data.constructor, owned);
  assert.equal(data.lastAutoFill.constructorId, null);
});

test('autoFillTeamTx writes through autoFillWrite with set(), never update()', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src', 'teams', 'autoFill.ts'), 'utf8');
  const body = src.slice(src.indexOf('export async function autoFillTeamTx'));
  assert.match(body, /autoFillWrite\(/);
  assert.doesNotMatch(body, /tx\.update\(/, 'tx.update() with a `constructor` key throws inside the SDK (F-141)');
});
