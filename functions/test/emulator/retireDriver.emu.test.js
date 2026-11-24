// F-155: scripts/setDriverSeat.js retiring a held driver end to end against the REAL Firestore
// emulator — the retirement, one transaction per holding team written with set + mergeFields on a
// team doc that carries a `constructor` object (a write shape the SDK refuses with update(): #305),
// the refusals, and a re-run.
//
// Run with `npm --prefix functions run test:emulator`; CI runs it through scripts/ops/run-rules-tests.sh.
// Never against a real project: without FIRESTORE_EMULATOR_HOST it skips, and the project is a pinned
// demo- id of its own (each emulator file clears its whole project between cases).
const test = require('node:test');
const assert = require('node:assert/strict');

const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = 'demo-f155-retire';
if (!EMU) {
  test('retire with refund on the Firestore emulator', { skip: 'FIRESTORE_EMULATOR_HOST is not set — run `npm run test:emulator`' }, () => {});
  return;
}
if (!PROJECT.startsWith('demo-')) throw new Error(`refusing to run: project ${PROJECT} is not a demo- project`);

const admin = require('firebase-admin');
const app = admin.initializeApp({ projectId: PROJECT }, 'f155-retire');
const db = app.firestore();
const { Timestamp } = admin.firestore;
const { run } = require('../../scripts/setDriverSeat.js');

const DESIRED = {
  retire: 'ocon',
  refundHolders: true,
  add: { id: 'newbie', name: 'New Driver', shortName: 'NEW', number: 99, constructorId: 'haas', price: 150, previousPrice: 150, tier: 'B', fantasyPoints: 0, seasonPoints: 0, isActive: true },
};
const quiet = { log: () => {}, warn: () => {} };

async function clearEmulator() {
  const res = await fetch(`http://${EMU}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  assert.equal(res.status, 200, `emulator reset failed: ${res.status}`);
}

const entry = (driverId, extra = {}) => ({ driverId, name: driverId, purchasePrice: 100, currentPrice: 110, pointsScored: 0, racesHeld: 0, contractLength: 3, ...extra });

async function seed() {
  await clearEmulator();
  await db.doc('drivers/ocon').set({ name: 'Esteban Ocon', constructorId: 'haas', price: 120, isActive: true });
  await db.doc('drivers/gasly').set({ name: 'Pierre Gasly', constructorId: 'alpine', price: 165, isActive: true });
  const teams = {
    // roster + ace + a constructor object (the #305 write shape) + streak entries
    tA: { userId: 'u1', name: 'A', budget: 10, totalSpent: 990, totalPoints: 0, lockedPoints: 0, racesSinceTransfer: 0, drivers: [entry('ocon'), entry('gasly')],
      constructor: { constructorId: 'haas', purchasePrice: 90 }, aceDriverId: 'ocon', driverStreaks: { ocon: { held: 1, atRace: 0 }, gasly: { held: 2, atRace: 0 } } },
    // roster, `constructor: null`, points to bank
    tB: { userId: 'u2', name: 'B', budget: 0, totalSpent: 100, totalPoints: 40, lockedPoints: 5, racesSinceTransfer: 3, drivers: [entry('ocon', { pointsScored: 12 })], constructor: null },
    // only a lockout entry
    tC: { userId: 'u3', name: 'C', budget: 1000, totalSpent: 0, drivers: [], driverLockouts: { ocon: 2, norris: 4 } },
    // an old roster entry keyed by `id`, no driverId
    tE: { userId: 'u5', name: 'E', budget: 0, totalSpent: 100, drivers: [{ id: 'ocon', purchasePrice: 100, currentPrice: 100 }], constructor: null },
    // not a holder
    tD: { userId: 'u4', name: 'D', budget: 835, totalSpent: 165, drivers: [entry('gasly')], constructor: { constructorId: 'alpine' } },
  };
  for (const [id, t] of Object.entries(teams)) await db.doc(`fantasyTeams/${id}`).set({ ...t, isLocked: false, updatedAt: Timestamp.fromMillis(0) });
}

const team = async (id) => (await db.doc(`fantasyTeams/${id}`).get()).data();

test.after(() => app.delete());

test('the dry run writes nothing and reports every holder', async () => {
  await seed();
  const s = await run(db, DESIRED, { apply: false, ...quiet });
  assert.equal(s.holders, 4);
  assert.equal((await db.doc('drivers/ocon').get()).data().isActive, true);
  assert.equal((await team('tA')).drivers.length, 2);
  assert.equal((await db.doc('drivers/newbie').get()).exists, false);
});

test('the apply retires him, refunds every holder at his current price and touches nobody else', async () => {
  await seed();
  const s = await run(db, DESIRED, { apply: true, ...quiet });
  assert.deepEqual([s.refunded, s.refundTotal, s.failed.length], [4, 360, 0]);
  const ocon = (await db.doc('drivers/ocon').get()).data();
  assert.deepEqual([ocon.isActive, ocon.retiredFor], [false, 'newbie']);
  assert.equal((await db.doc('drivers/newbie').get()).data().price, 150);

  const a = await team('tA');
  assert.deepEqual(a.drivers.map((d) => d.driverId), ['gasly']);
  assert.equal(a.budget, 130);
  assert.equal(a.totalSpent, 890);
  assert.equal(a.aceDriverId, null);
  assert.deepEqual(a.driverStreaks, { gasly: { held: 2, atRace: 0 } });
  assert.deepEqual(a.constructor, { constructorId: 'haas', purchasePrice: 90 }, 'the constructor object is untouched');
  assert.ok(a.updatedAt.toMillis() > 0);

  const b = await team('tB');
  assert.deepEqual([b.drivers.length, b.budget, b.totalPoints, b.lockedPoints], [0, 120, 28, 17]);
  assert.equal(b.racesSinceTransfer, 3, 'a forced sale is not the player\'s transfer');
  assert.equal(b.constructor, null);

  const c = await team('tC');
  assert.deepEqual([c.budget, c.driverLockouts], [1000, { norris: 4 }]);

  const e = await team('tE');
  assert.deepEqual([e.drivers, e.budget, e.totalSpent], [[], 120, 0], 'matched on id');

  const d = await team('tD');
  assert.equal(d.updatedAt.toMillis(), 0, 'a team that never held him is not written');
});

test('a re-run finds nothing left to refund', async () => {
  await seed();
  await run(db, DESIRED, { apply: true, ...quiet });
  const again = await run(db, DESIRED, { apply: true, ...quiet });
  assert.deepEqual([again.holders, again.refunded], [0, 0]);
  assert.equal((await team('tA')).budget, 130, 'refunded once');
});

test('a locked team is skipped while every other holder is still written; the run reports it and a re-run finishes', async () => {
  await seed();
  await db.doc('fantasyTeams/tB').set({ isLocked: true }, { merge: true });
  await assert.rejects(run(db, DESIRED, { apply: true, ...quiet }), /tB: locked/);
  assert.equal((await team('tB')).drivers.length, 1, 'the locked team is untouched');
  assert.equal((await team('tA')).budget, 130, 'the others are written');
  assert.equal((await team('tE')).budget, 120);
  await db.doc('fantasyTeams/tB').set({ isLocked: false }, { merge: true });
  const again = await run(db, DESIRED, { apply: true, ...quiet });
  assert.deepEqual([again.holders, again.refunded], [1, 1]);
  assert.equal((await team('tB')).budget, 120);
});

test('a weekend that goes live mid-run stops the loop before the next team', async () => {
  await seed();
  // the marker appears after the start check, before the retirement: every refund transaction sees it
  const afterRead = () => db.doc('config/lockState').set({ raceId: 'australia_2027', aceLockUntil: Timestamp.fromMillis(Date.now() + 3600e3) });
  await assert.rejects(run(db, DESIRED, { apply: true, afterRead, ...quiet }), /weekend went live/);
  for (const id of ['tA', 'tB', 'tE']) assert.equal((await team(id)).drivers.some((d) => d.driverId === 'ocon' || d.id === 'ocon'), true, `${id} not written`);
});

test('refused before anything is written: refundHolders off, or a live weekend', async () => {
  await seed();
  await assert.rejects(run(db, { ...DESIRED, refundHolders: false }, { apply: true, ...quiet }), /refundHolders is false/);
  await db.doc('config/lockState').set({ raceId: 'australia_2027', aceLockUntil: Timestamp.fromMillis(Date.now() + 3600e3) });
  await assert.rejects(run(db, DESIRED, { apply: true, ...quiet }), /race weekend is live/);
  assert.equal((await db.doc('drivers/ocon').get()).data().isActive, true);
  assert.equal((await team('tA')).drivers.length, 2);
});

test('a team that buys him between the first read and the retirement is refunded too (holders re-read after the commit)', async () => {
  await seed();
  const afterRead = () => db.doc('fantasyTeams/late').set({ userId: 'u9', name: 'Late', budget: 880, totalSpent: 120, isLocked: false, drivers: [entry('ocon', { purchasePrice: 120 })] });
  const s = await run(db, DESIRED, { apply: true, afterRead, ...quiet });
  assert.deepEqual(s.notInBackup, ['late']);
  const late = await team('late');
  assert.deepEqual([late.drivers.length, late.budget], [0, 1000]);
});

test('a new driver with no price opens at seasons/<current>.newcomerPrice; none there refuses', async () => {
  await seed();
  const { price, previousPrice, tier, ...noPrice } = DESIRED.add;
  const desired = { ...DESIRED, add: noPrice };
  await assert.rejects(run(db, desired, { apply: false, ...quiet }), /no newcomer price/);
  await db.doc('config/app').set({ currentSeason: '2027' });
  await db.doc('seasons/2027').set({ newcomerPrice: 150 });
  await run(db, desired, { apply: true, ...quiet });
  const n = (await db.doc('drivers/newbie').get()).data();
  assert.deepEqual([n.price, n.previousPrice, n.tier], [150, 150, 'B']);
});

test('a re-run on a driver already retired keeps his retiredAt', async () => {
  await seed();
  await run(db, DESIRED, { apply: true, ...quiet });
  const first = (await db.doc('drivers/ocon').get()).data().retiredAt.toMillis();
  await new Promise((r) => setTimeout(r, 20));
  await run(db, DESIRED, { apply: true, ...quiet });
  assert.equal((await db.doc('drivers/ocon').get()).data().retiredAt.toMillis(), first);
});

test('retiring with no replacement (add: null) and no holders', async () => {
  await seed();
  for (const id of ['tA', 'tB', 'tC', 'tE']) await db.doc(`fantasyTeams/${id}`).delete();
  const s = await run(db, { retire: 'ocon', refundHolders: false, add: null }, { apply: true, ...quiet });
  assert.equal(s.holders, 0);
  const ocon = (await db.doc('drivers/ocon').get()).data();
  assert.deepEqual([ocon.isActive, ocon.retiredFor], [false, null]);
});
