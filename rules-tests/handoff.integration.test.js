// Pit Wall sign-in handoff (F-075), run against the Firestore emulator by `npm run test:rules`.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('needs FIRESTORE_EMULATOR_HOST (run via npm run test:rules)');
const app = admin.apps.find((a) => a && a.name === 'pw-handoff') || admin.initializeApp({ projectId: 'demo-uc-pw-handoff' }, 'pw-handoff');
const db = app.firestore();
const { createHandoff, redeemHandoff, takeRateSlot, deleteOldHandoffs } = require('../functions/lib/pitwall/handoffStore.js');
const { hashHandoffCode } = require('../functions/lib/pitwall/handoffCore.js');

test('a code redeems once, for the right user, and the database never holds the code itself', async () => {
  const now = Date.now();
  const code = await createHandoff(db, 'user-1', 'profile', now);
  const all = await db.collection('pw_handoffs').get();
  assert.ok(all.docs.every((d) => d.id !== code && !JSON.stringify(d.data()).includes(code)));
  assert.equal((await db.doc(`pw_handoffs/${hashHandoffCode(code)}`).get()).data().uid, 'user-1');
  assert.equal(await redeemHandoff(db, code, now + 1000), 'user-1');
  assert.equal(await redeemHandoff(db, code, now + 2000), null); // reuse
});

test('an expired or unknown code redeems nothing', async () => {
  const now = Date.now();
  const code = await createHandoff(db, 'user-2', null, now);
  assert.equal(await redeemHandoff(db, code, now + 60_000), null);
  assert.equal(await redeemHandoff(db, 'A'.repeat(43), now), null);
});

test('two redeems racing for the same code: exactly one wins', async () => {
  const now = Date.now();
  const code = await createHandoff(db, 'user-3', 'profile', now);
  const results = await Promise.all(Array.from({ length: 6 }, () => redeemHandoff(db, code, now + 500)));
  assert.equal(results.filter((r) => r === 'user-3').length, 1);
  assert.equal(results.filter((r) => r === null).length, 5);
});

test('the rate limit holds under concurrency and old rows are cleaned up', async () => {
  const now = Date.now();
  const got = await Promise.all(Array.from({ length: 8 }, () => takeRateSlot(db, 'uid_racer', now, { windowMs: 60_000, max: 5 })));
  assert.equal(got.filter(Boolean).length, 5);
  assert.equal(await takeRateSlot(db, 'uid_racer', now + 61_000, { windowMs: 60_000, max: 5 }), true);
  await db.doc('pw_handoffs/ancient').set({ uid: 'x', createdAt: now - 3 * 24 * 3600 * 1000, expiresAt: 0, used: false });
  assert.ok((await deleteOldHandoffs(db, now)) >= 1);
  assert.equal((await db.doc('pw_handoffs/ancient').get()).exists, false);
});
