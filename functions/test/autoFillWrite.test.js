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
const { planAutoFill, autoFillWrite, autoFillTeamTx } = require('../lib/teams/autoFill.js');

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
// later with a connection error instead of the assertion. Emulator mode also skips the Google
// credential lookup, which otherwise fails first on a machine with no credentials (CI).
// node --test runs each file in its own process, so this does not leak into other files.
// Emulator mode alone still looks up Google credentials on the REST transport, which fails
// first on a machine that has none (CI), so the client also gets a fixed, offline token.
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:9';
function offlineAuth() {
  const { OAuth2Client } = require('google-auth-library');
  const auth = new OAuth2Client();
  auth.setCredentials({ access_token: 'owner', expiry_date: Date.now() + 3600e3 });
  return auth;
}
function offlineDb() {
  return new admin.firestore.Firestore({ projectId: 'f141-offline', preferRest: true, auth: offlineAuth() });
}

// 'assertion: …' when the SDK refuses the payload, 'network' when it got as far as sending it
// (connection refused, or still trying when the timer fires), and the error itself otherwise —
// so a payload rejected for some other reason does not pass as accepted.
async function commitOutcome(apply) {
  const db = offlineDb();
  let timer;
  try {
    const batch = db.batch();
    apply(batch, db.doc('fantasyTeams/t1'));
    await Promise.race([
      batch.commit(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('still sending'), { offlineTimeout: true })), 3000); }),
    ]);
    return 'committed';
  } catch (e) {
    if (e && e.code === 'ERR_ASSERTION') return `assertion: ${e.message}`;
    if (e && (e.offlineTimeout || /ECONNREFUSED|fetch failed|UNAVAILABLE|connect/i.test(`${e.message} ${e.cause && e.cause.code}`) || e.code === 14)) return 'network';
    return `other: ${e && e.message}`;
  } finally {
    clearTimeout(timer);
    await db.terminate().catch(() => {});
  }
}

test('a team that needs a constructor gets one in the plan (the case that always failed)', () => {
  const plan = planAutoFill(EMPTY_TEAM, CTX);
  assert.ok(plan, 'an incomplete team that has played must get a plan');
  assert.equal(plan.drivers.length, 5);
  assert.ok(plan.constructor, 'the plan must include a constructor');
});

test('the auto-fill write passes the real SDK write path with a constructor in it', async () => {
  const plan = planAutoFill(EMPTY_TEAM, CTX);
  const { data, options } = autoFillWrite(EMPTY_TEAM, plan, 'las_vegas_2026');
  assert.ok('constructor' in data, 'the payload under test must carry the constructor');
  const outcome = await commitOutcome((b, ref) => b.set(ref, data, options));
  assert.equal(outcome, 'network', `the SDK did not accept the auto-fill write: ${outcome}`);
});

test('control: the old update() shape is still rejected, so the test above can tell them apart', async () => {
  const plan = planAutoFill(EMPTY_TEAM, CTX);
  const { data } = autoFillWrite(EMPTY_TEAM, plan, 'las_vegas_2026');
  const outcome = await commitOutcome((b, ref) => b.update(ref, data));
  assert.match(outcome, /^assertion: Can't merge current value into a nested object/);
});

// A stand-in for db.runTransaction that serves one team document and records the writes.
function recordingDb(teamData) {
  const calls = [];
  const ref = { path: 'fantasyTeams/t1' };
  const db = {
    runTransaction: async (fn) => fn({
      get: async (r) => ({ exists: teamData !== null, data: () => teamData, ref: r }),
      set: (r, data, options) => calls.push({ op: 'set', r, data, options }),
      update: (r, data) => calls.push({ op: 'update', r, data }),
    }),
  };
  return { db, ref, calls };
}

test('autoFillTeamTx sets the planned payload with mergeFields on the team it read', async () => {
  const { db, ref, calls } = recordingDb(EMPTY_TEAM);
  const plan = await autoFillTeamTx(db, ref, CTX, 'las_vegas_2026');
  assert.ok(plan && plan.constructor, 'the fill must buy a constructor for this team');
  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.equal(call.op, 'set', 'update() with a `constructor` key throws inside the SDK (F-141)');
  assert.equal(call.r, ref);
  assert.deepEqual([...call.options.mergeFields].sort(), Object.keys(call.data).sort());
  assert.deepEqual(call.data.constructor, plan.constructor);
  assert.deepEqual(call.data.drivers, plan.drivers);
  assert.equal(call.data.lastAutoFill.raceId, 'las_vegas_2026');
});

test('autoFillTeamTx writes nothing for a missing, locked or complete team', async () => {
  for (const team of [null, { ...EMPTY_TEAM, isLocked: true }]) {
    const { db, ref, calls } = recordingDb(team);
    assert.equal(await autoFillTeamTx(db, ref, CTX, 'las_vegas_2026'), null);
    assert.equal(calls.length, 0);
  }
  const full = { ...EMPTY_TEAM, drivers: CTX.drivers.slice(0, 5).map((d) => ({ driverId: d.id })), constructor: { constructorId: 'red_bull' } };
  const { db, ref, calls } = recordingDb(full);
  assert.equal(await autoFillTeamTx(db, ref, CTX, 'las_vegas_2026'), null);
  assert.equal(calls.length, 0);
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

test('source guard: autoFillTeamTx writes through autoFillWrite, never tx.update()', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src', 'teams', 'autoFill.ts'), 'utf8');
  const start = src.indexOf('export async function autoFillTeamTx');
  assert.notEqual(start, -1, 'autoFillTeamTx moved: rewrite this guard with it');
  const next = src.indexOf('\nexport ', start + 1);
  const body = src.slice(start, next === -1 ? undefined : next);
  assert.match(body, /autoFillWrite\(/);
  assert.doesNotMatch(body, /tx\.update\(/, 'tx.update() with a `constructor` key throws inside the SDK (F-141)');
});
