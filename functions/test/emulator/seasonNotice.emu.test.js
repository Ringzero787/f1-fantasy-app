// F-155: scripts/sendSeasonNotice.js against the REAL Firestore emulator — test accounts left out,
// the ledger, the marker the rollover reads, a re-run that sends nobody anything twice. Push is
// stubbed: nothing leaves the machine. Run with `npm --prefix functions run test:emulator`.
const test = require('node:test');
const assert = require('node:assert/strict');

const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = 'demo-f155-notice';
if (!EMU) {
  test('season notice on the Firestore emulator', { skip: 'FIRESTORE_EMULATOR_HOST is not set — run `npm run test:emulator`' }, () => {});
  return;
}
if (!PROJECT.startsWith('demo-')) throw new Error(`refusing to run: project ${PROJECT} is not a demo- project`);

const admin = require('firebase-admin');
const app = admin.initializeApp({ projectId: PROJECT }, 'f155-notice');
const db = app.firestore();
const { run } = require('../../scripts/sendSeasonNotice.js');
const { noticeSentMs } = require('../../lib/season/offseasonNotice.js');

const quiet = { log: () => {} };
const tok = (n) => `ExponentPushToken[${n}]`;

async function seed() {
  const res = await fetch(`http://${EMU}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  assert.equal(res.status, 200);
  await db.doc('users/a').set({ email: 'a@x', pushToken: tok('a') });
  await db.doc('users/b').set({ email: 'b@x', pushToken: null });
  await db.doc('users/t').set({ email: 't@x', pushToken: tok('t'), testAccount: true });
}
const inboxOf = async (uid) => (await db.collection('notifications').where('userId', '==', uid).get()).docs.map((d) => d.data());

test.after(() => app.delete());

test('dry run and the placeholder day send nothing', async () => {
  await seed();
  const pushes = [];
  await run(db, { apply: false, resetDay: 'Monday 14 December', push: async (m) => { pushes.push(...m); return m.length; }, ...quiet });
  await assert.rejects(run(db, { apply: true, push: async () => 0, ...quiet }), /set RESET_DAY/);
  assert.equal(pushes.length, 0);
  assert.equal((await db.collection('notifications').get()).size, 0);
  assert.equal(noticeSentMs((await db.doc('seasons/2026').get()).data() || {}), null);
});

test('apply: inbox for every real user, push for the token holder, nothing for the test account, the marker stamped; a re-run sends nothing', async () => {
  await seed();
  const pushes = [];
  const push = async (m) => { pushes.push(...m); return m.length; };
  await run(db, { apply: true, resetDay: 'Monday 14 December', push, ...quiet });
  assert.equal((await inboxOf('a')).length, 1);
  assert.equal((await inboxOf('b')).length, 1);
  assert.equal((await inboxOf('t')).length, 0);
  assert.deepEqual(pushes.map((p) => p.to), [tok('a')]);
  assert.match((await inboxOf('a'))[0].body, /Monday 14 December/);
  const season = (await db.doc('seasons/2026').get()).data();
  assert.ok(noticeSentMs(season) > 0);
  assert.deepEqual([season.resetNotice.inbox, season.resetNotice.push], [2, 1]);
  const first = noticeSentMs(season);

  await db.doc('users/c').set({ email: 'c@x' });
  await run(db, { apply: true, resetDay: 'Monday 14 December', push, ...quiet });
  assert.equal((await inboxOf('a')).length, 1, 'never twice');
  assert.equal((await inboxOf('c')).length, 1, 'a player who joined since gets it');
  assert.equal(pushes.length, 1);
  const again = (await db.doc('seasons/2026').get()).data();
  assert.equal(noticeSentMs(again), first, 'the gate counts from the first send');
  assert.equal(again.resetNotice.inbox, 3);
});
