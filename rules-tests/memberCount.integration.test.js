// Server-owned memberCount (F-059), run against the Firestore emulator by `npm run test:rules`.
// Exercises reconcileMemberCount with the Admin SDK exactly as the two triggers call it.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('needs FIRESTORE_EMULATOR_HOST (run via npm run test:rules)');
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-uc-rules' });
const db = admin.firestore();
const { reconcileMemberCount } = require('../functions/lib/leagues/memberCount.js');

async function league(id, memberCount, members) {
  await db.doc(`leagues/${id}`).set({ name: id, ownerId: 'o', maxMembers: 22, memberCount });
  for (const [uid, data] of Object.entries(members)) await db.doc(`leagues/${id}/members/${uid}`).set({ userId: uid, ...data });
}
const count = async (id) => (await db.doc(`leagues/${id}`).get()).data().memberCount;

test('corrects a count a released client double-incremented', async () => {
  await league('mc1', 4, { o: { role: 'owner' }, a: { status: 'approved' }, b: { status: 'approved' } });
  assert.equal(await reconcileMemberCount('mc1'), 3);
  assert.equal(await count('mc1'), 3);
});

test('pending requests do not count; approval does', async () => {
  await league('mc2', 1, { o: { role: 'owner' }, p: { status: 'pending' } });
  assert.equal(await reconcileMemberCount('mc2'), 1);
  await db.doc('leagues/mc2/members/p').update({ status: 'approved' });
  assert.equal(await reconcileMemberCount('mc2'), 2);
  assert.equal(await count('mc2'), 2);
});

test('undoes a forged count in either direction and leaves a correct one untouched', async () => {
  await league('mc3', 0, { o: { role: 'owner' }, a: { status: 'approved' } });
  assert.equal(await reconcileMemberCount('mc3'), 2);
  await db.doc('leagues/mc3').update({ memberCount: 22 });
  assert.equal(await reconcileMemberCount('mc3'), 2);
  const before = (await db.doc('leagues/mc3').get()).updateTime.toMillis();
  assert.equal(await reconcileMemberCount('mc3'), 2);            // already right → no write, so the triggers cannot loop
  assert.equal((await db.doc('leagues/mc3').get()).updateTime.toMillis(), before);
});

test('a deleted league is ignored', async () => {
  assert.equal(await reconcileMemberCount('does-not-exist'), null);
});
