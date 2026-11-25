// F-176: the one-call lineup save, run against the Firestore emulator by `npm run test:rules`.
// The real transaction and the real write: the `constructor` key and a REPLACED driverStreaks map
// in one set(), which is the part a fake cannot prove (update() 500s on `constructor`; set-merge
// would keep stale streak keys).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('needs FIRESTORE_EMULATOR_HOST (run via npm run test:rules)');
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-uc-lineup' });
const db = admin.firestore();
const { applyLineupTx } = require('../functions/lib/teams/teamOperations.js');

const clock = { completedRaceCount: 10, racesLeft: 14 };
const held = (id, extra = {}) => ({ driverId: id, name: id, shortName: id.toUpperCase(), constructorId: 'mcl', purchasePrice: 200, currentPrice: 200, pointsScored: 40, racesHeld: 2, contractLength: 3, addedAtRace: 8, ...extra });

async function seed(teamId, extra = {}) {
  await db.doc('drivers/ver').set({ id: 'ver', name: 'Verstappen', price: 250, constructorId: 'rbr' });
  await db.doc('drivers/nor').set({ id: 'nor', name: 'Norris', price: 180, constructorId: 'mcl' });
  await db.doc('drivers/pia').set({ id: 'pia', name: 'Piastri', price: 300, constructorId: 'mcl', shortName: 'PIA' });
  await db.doc('drivers/exp').set({ id: 'exp', name: 'Expensive', price: 5000, constructorId: 'mcl' });
  await db.doc('constructors/mcl').set({ name: 'McLaren', price: 320 });
  await db.doc('constructors/fer').set({ name: 'Ferrari', price: 400 });
  await db.doc(`fantasyTeams/${teamId}`).set({
    userId: 'u1', name: 'Team', isLocked: false,
    drivers: [held('ver'), held('ham'), held('nor', { racesHeld: 0, pointsScored: 0 })],
    constructor: { constructorId: 'mcl', name: 'McLaren', purchasePrice: 300, currentPrice: 300, pointsScored: 25, racesHeld: 1, contractLength: 3 },
    budget: 500, totalSpent: 900, totalPoints: 1000, lockedPoints: 50, aceDriverId: 'ver', aceConstructorId: 'mcl',
    driverStreaks: { stale: { held: 3, atRace: 7 } },
    ...extra,
  });
}
const data = async (p) => (await db.doc(p).get()).data();

test('one call: two sales, a constructor swap and a buy land in one write', async () => {
  await seed('T1');
  const r = await applyLineupTx('T1', 'u1', {
    sellDrivers: ['ver', 'nor'], sellConstructor: false, buyConstructor: { id: 'fer', contractLength: 3 }, buyDrivers: [{ id: 'pia', contractLength: 4 }],
  }, clock, null);
  const t = await data('fantasyTeams/T1');
  // ver: return 243 (fee 7); nor: 180 (grace); mcl: 320 at 1 of 3 -> fee 19, return 301; fer -400; pia -300
  assert.equal(t.budget, 500 + 243 + 180 + 301 - 400 - 300);
  assert.equal(r.newBudget, t.budget);
  assert.equal(t.constructor.constructorId, 'fer', 'the constructor key is written as data');
  assert.equal(typeof t.constructor, 'object');
  assert.deepEqual(t.drivers.map((d) => d.driverId), ['ham', 'pia']);
  assert.equal(t.lockedPoints, 50 + 40 + 25, 'ver and mcl banked');
  assert.equal(t.totalPoints, 1000 - 65, 'the sum the tables show is unchanged');
  assert.equal(t.aceDriverId, null);
  assert.equal(t.aceConstructorId, null);
  assert.deepEqual(t.driverStreaks, { ver: { held: 2, atRace: 10 } }, 'replaced: the stale entry is gone');
  assert.equal(t.racesSinceTransfer, 0);
  assert.equal(r.team.lockedPoints, t.lockedPoints, 'the reply is the team as written');
});

test('all or nothing: a refusal at the last step writes nothing', async () => {
  await seed('T2');
  const before = JSON.stringify(await data('fantasyTeams/T2'));
  await assert.rejects(applyLineupTx('T2', 'u1', {
    sellDrivers: ['ver'], sellConstructor: false, buyConstructor: null, buyDrivers: [{ id: 'exp' }],
  }, clock, null), /Cannot afford Expensive/);
  assert.equal(JSON.stringify(await data('fantasyTeams/T2')), before);
});

test('owner and lock checks are the single moves\' own', async () => {
  await seed('T3');
  await assert.rejects(applyLineupTx('T3', 'someone-else', { sellDrivers: ['ver'], sellConstructor: false, buyConstructor: null, buyDrivers: [] }, clock, null), /Not your team/);
  await seed('T4', { isLocked: true });
  await assert.rejects(applyLineupTx('T4', 'u1', { sellDrivers: ['ver'], sellConstructor: false, buyConstructor: null, buyDrivers: [] }, clock, null), /Team is locked/);
  // a live weekend the team was not stamped for (F-118)
  await seed('T5');
  const live = { aceLockTime: admin.firestore.Timestamp.fromMillis(Date.now()) };
  await assert.rejects(applyLineupTx('T5', 'u1', { sellDrivers: ['ver'], sellConstructor: false, buyConstructor: null, buyDrivers: [] }, clock, live), /already under way/);
});

test('selling only the constructor clears it and banks its points', async () => {
  await seed('T6');
  await applyLineupTx('T6', 'u1', { sellDrivers: [], sellConstructor: true, buyConstructor: null, buyDrivers: [] }, clock, null);
  const t = await data('fantasyTeams/T6');
  assert.equal(t.constructor, null);
  assert.equal(t.lockedPoints, 75);
  assert.deepEqual(t.driverStreaks, { stale: { held: 3, atRace: 7 } }, 'no driver sold: streaks untouched');
});
