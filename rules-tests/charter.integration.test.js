// Charter purchase writes (F-175 slice 2), run against the Firestore emulator by `npm run test:rules`.
// The real Admin SDK, real transactions, real FieldValue.delete inside a merge, and the real
// FieldPath query on a map key — the parts the unit test's fake cannot prove.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('needs FIRESTORE_EMULATOR_HOST (run via npm run test:rules)');
const app = admin.apps.find((a) => a && a.name === 'charter') || admin.initializeApp({ projectId: 'demo-uc-charter' }, 'charter');
const db = app.firestore();
const store = require('../functions/lib/charter/charterStore.js');
const passStore = require('../functions/lib/pitwall/passStore.js');
const { seasonExpiry } = require('../functions/lib/pitwall/pass.js');

const NOW = Date.parse('2027-03-01T12:00:00Z');
const END = seasonExpiry('2027');
const data = async (p) => (await db.doc(p).get()).data();

async function seed(id) {
  const owner = `${id}-owner`, amy = `${id}-amy`, pat = `${id}-pat`;
  await db.doc(`leagues/${id}`).set({ ownerId: owner, name: id, isPublic: false, settings: { requireApproval: false, scoring: 'std' } });
  await db.doc(`leagues/${id}2`).set({ ownerId: owner, name: `${id} second` });
  await db.doc(`leagues/${id}/members/${owner}`).set({ status: 'approved' });
  await db.doc(`leagues/${id}/members/${amy}`).set({ status: 'approved' });
  await db.doc(`leagues/${id}/members/${pat}`).set({ status: 'pending' });
  await db.doc(`users/${owner}`).set({ pass: { tier: 'pitwall', season: '2027', expiresAt: END - 86400000, source: 'play' } });
  await db.doc(`users/${amy}`).set({ pass: { tier: 'pitwall', season: '2027', expiresAt: END, source: 'stripe' }, displayName: 'Amy' });
  return { owner, amy, pat };
}

test('grant charters one league, gives the owner and approved members access, never writes a pass, and a replay changes nothing', async () => {
  const { owner, amy, pat } = await seed('CA');
  const amyPass = JSON.stringify((await data(`users/${amy}`)).pass);
  const r = await store.grantCharter(db, { leagueId: 'CA', buyerId: owner, season: '2027', source: 'play', ref: 'purA', now: NOW });
  assert.equal(r.applied, true);
  const L = await data('leagues/CA');
  assert.equal(L.chartered, true);
  assert.equal(L.isPublic, true);
  assert.deepEqual(L.settings, { requireApproval: true, scoring: 'std' });
  assert.equal(L.proUntil, END);
  assert.equal((await data('leagues/CA2')).pro, undefined, 'the other league the buyer owns is untouched');
  assert.equal((await data(`users/${amy}`)).charterAccess.leagues.CA, END);
  assert.equal((await data(`users/${owner}`)).charterAccess.leagues.CA, END);
  assert.equal(await data(`users/${pat}`), undefined);
  assert.equal(JSON.stringify((await data(`users/${amy}`)).pass), amyPass);
  const again = await store.grantCharter(db, { leagueId: 'CA', buyerId: owner, season: '2027', source: 'play', ref: 'purA', now: NOW + 9 });
  assert.equal(again.replay, true);
  assert.equal((await data('leagues/CA')).charter.purchasedAt, NOW);
  assert.deepEqual(await store.grantCharter(db, { leagueId: 'CA', buyerId: amy, season: '2027', source: 'play', ref: 'purX', now: NOW }), { applied: false, reason: 'not-owner' });
});

test('refund clears that league and every member\'s access through the map-key query, keeps passes, and a refunded receipt never charters again', async () => {
  const { owner, amy } = await seed('CB');
  await store.grantCharter(db, { leagueId: 'CB', buyerId: owner, season: '2027', source: 'play', ref: 'purB', now: NOW });
  // a former member who left still holds access: only the map-key query finds them
  await db.doc('users/CB-gone').set({ charterAccess: { leagues: { CB: END, OTHER: END } } });
  assert.equal(await store.clearCharter(db, { leagueId: 'CB', ref: 'someone-else', reason: 'refund', now: NOW }), false);
  assert.equal(await store.clearCharter(db, { leagueId: 'CB', ref: 'purB', reason: 'refund', now: NOW }), true);
  const L = await data('leagues/CB');
  assert.equal(L.charter, undefined);
  assert.equal(L.chartered, undefined);
  assert.equal(L.isPublic, false);
  assert.deepEqual(L.settings, { requireApproval: false, scoring: 'std' });
  assert.equal(L.pro, true, "the owner's own pass keeps it Pro");
  assert.equal(L.proUntil, END - 86400000);
  assert.deepEqual((await data(`users/${amy}`)).charterAccess.leagues, {});
  assert.equal((await data(`users/${amy}`)).pass.source, 'stripe');
  assert.deepEqual((await data('users/CB-gone')).charterAccess.leagues, { OTHER: END });
  assert.deepEqual(await store.grantCharter(db, { leagueId: 'CB', buyerId: owner, season: '2027', source: 'play', ref: 'purB', now: NOW }), { applied: false, reason: 'refunded' });
});

test('a refund retried after a partial failure still removes access; it never strips a newer charter\'s members', async () => {
  const { owner, amy } = await seed('CC');
  await store.grantCharter(db, { leagueId: 'CC', buyerId: owner, season: '2027', source: 'stripe', ref: 'stripe:pi_C', now: NOW });
  await store.clearCharter(db, { leagueId: 'CC', ref: 'stripe:pi_C', reason: 'charge.refunded', now: NOW });
  // simulate the access sweep having failed after the league transaction committed
  await db.doc(`users/${amy}`).set({ charterAccess: { leagues: { CC: END } } }, { merge: true });
  assert.equal(await store.clearCharter(db, { leagueId: 'CC', ref: 'stripe:pi_C', reason: 'charge.refunded', now: NOW }), false, 'nothing left on the league');
  assert.deepEqual((await data(`users/${amy}`)).charterAccess.leagues, {}, 'but the retry finished the sweep');
  // the owner charters again with a new payment; a late retry of the old refund must not touch it
  await store.grantCharter(db, { leagueId: 'CC', buyerId: owner, season: '2027', source: 'stripe', ref: 'stripe:pi_D', now: NOW + 1 });
  assert.equal(await store.clearCharter(db, { leagueId: 'CC', ref: 'stripe:pi_C', reason: 'charge.refunded', now: NOW + 2 }), false);
  assert.equal((await data(`users/${amy}`)).charterAccess.leagues.CC, END);
  assert.equal((await data('leagues/CC')).chartered, true);
});

test('revoking the owner\'s pass leaves a chartered league Pro; expiry clears only ended charters', async () => {
  const { owner, amy } = await seed('CD');
  await store.grantCharter(db, { leagueId: 'CD', buyerId: owner, season: '2027', source: 'apple', ref: 'purD', now: NOW });
  await passStore.revokePass(db, owner, 'test', NOW);
  assert.equal((await data('leagues/CD')).pro, true);
  assert.equal((await data('leagues/CD')).proUntil, END);
  assert.equal((await data('leagues/CD2')).pro, false);
  assert.equal((await data(`users/${amy}`)).charterAccess.leagues.CD, END);
  assert.equal(await store.expireCharters(db, NOW), 0);
  assert.ok((await store.expireCharters(db, END + 1)) >= 1);
  const L = await data('leagues/CD');
  assert.equal(L.chartered, undefined);
  assert.equal(L.pro, false, 'no pass and no charter left');
  assert.deepEqual((await data(`users/${amy}`)).charterAccess.leagues, {});
});

test('parallel replays of one purchase naming different leagues charter exactly one', async () => {
  const { owner } = await seed('CE');
  await db.doc('leagues/CF').set({ ownerId: owner, name: 'CF' });
  await db.doc('leagues/CG').set({ ownerId: owner, name: 'CG' });
  const results = await Promise.all(['CE', 'CF', 'CG'].map((leagueId, k) =>
    store.grantCharter(db, { leagueId, buyerId: owner, season: '2027', source: 'play', ref: 'purE', now: NOW + k })));
  const chartered = [];
  for (const id of ['CE', 'CF', 'CG']) if ((await data(`leagues/${id}`)).chartered === true) chartered.push(id);
  assert.equal(chartered.length, 1, `one purchase chartered ${chartered.join(', ')}`);
  for (const r of results) { assert.equal(r.applied, true); assert.equal(r.leagueId, chartered[0]); }
});

// ── slice 3: membership, approval cap, Rank Up ──
const members = require('../functions/lib/charter/memberStore.js');
const { weekId } = require('../functions/lib/charter/rankUp.js');
const NOW3 = Date.now();

async function chartered(id) {
  const s = await seed(id);
  await store.grantCharter(db, { leagueId: id, buyerId: s.owner, season: '2027', source: 'play', ref: `pur_${id}`, now: NOW3 });
  return s;
}
/** What the member trigger does for one write, run directly. */
async function write(leagueId, uid, after) {
  const ref = db.doc(`leagues/${leagueId}/members/${uid}`);
  const before = (await ref.get()).data();
  if (after === null) await ref.delete(); else await ref.set(after);
  return members.syncCharterMember(db, leagueId, uid, before, after ?? undefined, NOW3);
}

test('slice 3: access follows approval; leaving, removal and rejection take it; the owner keeps it', async () => {
  const { owner, amy, pat } = await chartered('M1');
  const access = async (uid) => (await data(`users/${uid}`))?.charterAccess?.leagues?.M1;
  assert.equal(await access(pat), undefined, 'pending: no access');
  await members.approve(db, 'M1', pat, owner, NOW3);
  // the trigger receives the before/after of approve()'s own write
  const r = await members.syncCharterMember(db, 'M1', pat, { status: 'pending' }, { status: 'approved' }, NOW3);
  assert.equal(r.change.approvedNow, true);
  assert.equal(await access(pat), END);
  await write('M1', amy, null); // Amy leaves
  assert.equal(await access(amy), undefined);
  assert.equal((await data(`users/${amy}`)).pass.source, 'stripe', 'her own pass stays');
  await write('M1', owner, null);
  assert.equal(await access(owner), END, 'the owner keeps access while chartered');
  await db.doc('leagues/M1/members/newbie').set({ status: 'pending' });
  await write('M1', 'newbie', null); // rejected request
  assert.equal(await access('newbie'), undefined);
});

test('slice 3: approval is the owner\'s, and stops at 22 approved in a chartered league', async () => {
  const { owner, amy } = await chartered('M2');
  await db.doc('leagues/M2/members/req').set({ status: 'pending' });
  await assert.rejects(members.approve(db, 'M2', 'req', amy, NOW3), (e) => e.reason === 'not-owner');
  await assert.rejects(members.approve(db, 'M2', amy, owner, NOW3), (e) => e.reason === 'not-pending');
  // fill to 22 approved: owner + amy + 20
  for (let k = 0; k < 20; k += 1) await db.doc(`leagues/M2/members/f${k}`).set({ status: 'approved' });
  await assert.rejects(members.approve(db, 'M2', 'req', owner, NOW3), (e) => e.reason === 'full');
  await db.doc('leagues/M2/members/f0').delete();
  await members.approve(db, 'M2', 'req', owner, NOW3);
  assert.equal((await data('leagues/M2/members/req')).status, 'approved');
});

test('slice 3: Rank Up once a week per member, moves the league count, never touches points', async () => {
  const { owner, amy, pat } = await chartered('M3');
  await db.doc(`leagues/M3/members/${owner}`).set({ status: 'approved', totalPoints: 300 });
  await db.doc(`leagues/M3/members/${amy}`).set({ status: 'approved', totalPoints: 200 });
  const before = JSON.stringify([(await data(`leagues/M3/members/${owner}`)), (await data(`leagues/M3/members/${amy}`))]);
  const r = await members.giveRankUp(db, 'M3', owner, amy, NOW3);
  assert.deepEqual(r, { weekId: weekId(NOW3), count: 1 });
  await assert.rejects(members.giveRankUp(db, 'M3', owner, amy, NOW3), (e) => e.reason === 'already-given');
  await assert.rejects(members.giveRankUp(db, 'M3', amy, amy, NOW3), (e) => e.reason === 'self');
  await assert.rejects(members.giveRankUp(db, 'M3', amy, pat, NOW3), (e) => e.reason === 'target-not-member');
  await assert.rejects(members.giveRankUp(db, 'M3', pat, amy, NOW3), (e) => e.reason === 'not-member');
  assert.equal((await members.giveRankUp(db, 'M3', amy, owner, NOW3)).count, 2);
  assert.equal(JSON.stringify([(await data(`leagues/M3/members/${owner}`)), (await data(`leagues/M3/members/${amy}`))]), before, 'points unchanged');
  // next week the owner may give again and the count restarts
  const next = NOW3 + 7 * 86400e3;
  assert.deepEqual(await members.giveRankUp(db, 'M3', owner, amy, next), { weekId: weekId(next), count: 1 });
  // parallel second gifts: exactly one wins
  await db.doc('leagues/M3/members/x').set({ status: 'approved' });
  const both = await Promise.allSettled([members.giveRankUp(db, 'M3', 'x', amy, next), members.giveRankUp(db, 'M3', 'x', owner, next)]);
  assert.equal(both.filter((b) => b.status === 'fulfilled').length, 1);
  // an unchartered league has no Rank Up
  await db.doc('leagues/M3x').set({ ownerId: owner });
  await db.doc(`leagues/M3x/members/${owner}`).set({ status: 'approved' });
  await db.doc(`leagues/M3x/members/${amy}`).set({ status: 'approved' });
  await assert.rejects(members.giveRankUp(db, 'M3x', owner, amy, NOW3), (e) => e.reason === 'not-chartered');
});

test('slice 3: search points are the approved members\' totals, set at grant and kept in step', async () => {
  const s = await seed('M4');
  await db.doc(`leagues/M4/members/${s.owner}`).set({ status: 'approved', totalPoints: 100 });
  await db.doc(`leagues/M4/members/${s.amy}`).set({ status: 'approved', totalPoints: 50 });
  await db.doc(`leagues/M4/members/${s.pat}`).set({ status: 'pending', totalPoints: 999 });
  await store.grantCharter(db, { leagueId: 'M4', buyerId: s.owner, season: '2027', source: 'play', ref: 'pur_M4', now: NOW3 });
  assert.equal((await data('leagues/M4')).searchPoints, 150);
  await write('M4', s.amy, { status: 'approved', totalPoints: 80 }); // a race scored: no recount per member write
  assert.equal((await data('leagues/M4')).searchPoints, 150);
  await members.recomputeSearchPoints(db, 'M4', NOW3); // what charter-onRaceResult does once per race
  assert.equal((await data('leagues/M4')).searchPoints, 180);
  await write('M4', s.amy, null);
  assert.equal((await data('leagues/M4')).searchPoints, 100);
});

test('slice 3: a late or retried "approved" event cannot give access back to someone who left', async () => {
  const { owner } = await chartered('M5');
  await db.doc('leagues/M5/members/late').set({ status: 'pending' });
  await members.approve(db, 'M5', 'late', owner, NOW3);
  await members.syncCharterMember(db, 'M5', 'late', { status: 'pending' }, { status: 'approved' }, NOW3);
  assert.equal((await data('users/late')).charterAccess.leagues.M5, END);
  await write('M5', 'late', null); // leaves
  assert.equal((await data('users/late')).charterAccess.leagues.M5, undefined);
  // the approval event is delivered again, after the leave
  await members.syncCharterMember(db, 'M5', 'late', { status: 'pending' }, { status: 'approved' }, NOW3);
  assert.equal((await data('users/late')).charterAccess.leagues.M5, undefined, 'access follows the member as they are now');
});

test('slice 3: two approvals racing for the last of 22 places: one wins', async () => {
  const { owner, amy } = await chartered('M6');
  for (let k = 0; k < 19; k += 1) await db.doc(`leagues/M6/members/f${k}`).set({ status: 'approved' });
  await db.doc('leagues/M6/members/r1').set({ status: 'pending' });
  await db.doc('leagues/M6/members/r2').set({ status: 'pending' });
  // owner + amy + 19 = 21 approved
  const both = await Promise.allSettled([members.approve(db, 'M6', 'r1', owner, NOW3), members.approve(db, 'M6', 'r2', owner, NOW3)]);
  assert.equal(both.filter((b) => b.status === 'fulfilled').length, 1);
  assert.equal(both.find((b) => b.status === 'rejected').reason.reason, 'full');
  void amy;
});
