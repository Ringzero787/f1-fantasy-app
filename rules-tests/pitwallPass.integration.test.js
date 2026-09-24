// Pit Wall Pass grants (F-068), run against the Firestore emulator by `npm run test:rules`.
// Exercises passStore with the Admin SDK exactly as the Stripe webhook and the admin op call it.
// Auth claims are not stamped here (no auth emulator): stampClaim is unit-covered through pass.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('needs FIRESTORE_EMULATOR_HOST (run via npm run test:rules)');
const app = admin.apps.find((a) => a && a.name === 'pw-pass') || admin.initializeApp({ projectId: 'demo-uc-pw-pass' }, 'pw-pass');
const db = app.firestore();
const store = require('../functions/lib/pitwall/passStore.js');
const { seasonExpiry } = require('../functions/lib/pitwall/pass.js');

// passStore writes Firestore only; the auth claim is stamped by the onUserPassWritten trigger,
// so these cases need no auth emulator.
const pass = async (uid) => (await db.doc(`users/${uid}`).get()).data()?.pass;
const league = async (id) => (await db.doc(`leagues/${id}`).get()).data();

test('a Stripe grant writes the pass, marks every league the buyer owns Pro, and replaying the event changes nothing', async () => {
  await db.doc('leagues/LA').set({ name: 'A', ownerId: 'buyer' });
  await db.doc('leagues/LB').set({ name: 'B', ownerId: 'buyer' });
  await db.doc('leagues/LC').set({ name: 'C', ownerId: 'someone-else' });
  const first = await store.grantPass(db, 'buyer', '2026', 'stripe', 'evt_100', 1000);
  assert.equal(first.expiresAt, seasonExpiry('2026'));
  assert.equal((await pass('buyer')).source, 'stripe');
  assert.equal((await league('LA')).pro, true);
  assert.equal((await league('LB')).proUntil, seasonExpiry('2026'));
  assert.equal((await league('LC')).pro, undefined);
  // Stripe retries the same event: the grant record makes it a no-op
  const again = await store.grantPass(db, 'buyer', '2026', 'stripe', 'evt_100', 99_000);
  assert.equal(again.grantedAt, 1000);
  assert.equal((await pass('buyer')).grantedAt, 1000);
});

test('a refund revokes the pass and un-Pros the leagues', async () => {
  await db.doc('leagues/LR').set({ name: 'R', ownerId: 'refunder' });
  await store.grantPass(db, 'refunder', '2026', 'stripe', 'evt_200', 1000);
  assert.equal((await league('LR')).pro, true);
  await store.revokePass(db, 'refunder', 'charge.refunded', 2000);
  assert.equal(await pass('refunder'), undefined);
  assert.equal((await league('LR')).pro, false);
  assert.deepEqual((await db.doc('users/refunder').get()).data().pwRevoked, { at: 2000, reason: 'charge.refunded' });
});

test('a trial is one per user ever, and is refused while a pass is already active', async () => {
  const now = Date.UTC(2026, 8, 24);
  const trial = await store.grantTrial(db, 'trialer', '2026', now);
  assert.equal(trial.expiresAt, now + 7 * 86400000);
  assert.equal(await store.grantTrial(db, 'trialer', '2026', now + 1000), null, 'a second trial is refused');
  // a buyer who already holds a pass gets no trial
  await store.grantPass(db, 'holder', '2026', 'stripe', 'evt_300', now);
  assert.equal(await store.grantTrial(db, 'holder', '2026', now), null);
});

test('buying while holding a longer trial keeps the longer expiry, and the sweep clears what has expired', async () => {
  const now = Date.UTC(2026, 8, 24);
  await db.doc('users/mixed').set({ pass: { tier: 'pitwall', season: '2027', expiresAt: seasonExpiry('2027'), source: 'grant', grantedAt: 0 } });
  await store.grantPass(db, 'mixed', '2026', 'stripe', 'evt_400', now);
  assert.equal((await pass('mixed')).expiresAt, seasonExpiry('2027'), 'a shorter purchase never cuts an existing pass short');

  await db.doc('leagues/LE').set({ name: 'E', ownerId: 'goner' });
  await store.grantPass(db, 'goner', '2026', 'stripe', 'evt_500', now);
  // these cases share one emulator database, so assert on this user rather than a global count
  await store.expirePasses(db, seasonExpiry('2026') - 1);
  assert.ok(await pass('goner'), 'a pass that has not expired survives the sweep');
  await store.expirePasses(db, seasonExpiry('2027') + 1);
  assert.equal(await pass('goner'), undefined);
  assert.equal((await league('LE')).pro, false);
});
