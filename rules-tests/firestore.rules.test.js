// Firestore rules tests (F-056). Run with the emulator:
//   npm run test:rules
// Every "shipped client" case replays the exact writes league.service.ts makes in
// released builds (2.2.x, 2.3.x) so a rules change can never lock players out.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, writeBatch, collection, query, where, limit, increment, serverTimestamp } = require('firebase/firestore');

let env;
const OWNER = 'owner1', ALICE = 'alice', BOB = 'bob', MALLORY = 'mallory';

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-uc-rules',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') },
  });
});
test.after(async () => { await env.cleanup(); });
test.beforeEach(async () => { await env.clearFirestore(); });

const db = (uid) => env.authenticatedContext(uid).firestore();

const leagueData = (ownerId, extra = {}) => ({
  name: 'Paddock Pals', description: null, ownerId, ownerName: 'Owner', inviteCode: 'ABC12345', isPublic: false,
  maxMembers: 22, memberCount: 1, seasonId: '2026', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  settings: { allowLateJoin: true, lockDeadline: 'qualifying' }, ...extra,
});
const ownerMember = (leagueId, uid) => ({ leagueId, userId: uid, displayName: 'Owner', role: 'owner', totalPoints: 0, rank: 1, joinedAt: serverTimestamp() });
const joinMember = (leagueId, uid, status = 'approved', rank = 2) => ({ leagueId, userId: uid, displayName: 'Player', role: 'member', status, totalPoints: 0, rank, joinedAt: serverTimestamp() });

/** Seed a league with its owner member, bypassing rules. */
async function seedLeague(id = 'L1', extra = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const a = ctx.firestore();
    await setDoc(doc(a, 'leagues', id), leagueData(OWNER, extra));
    await setDoc(doc(a, 'leagues', id, 'members', OWNER), { ...ownerMember(id, OWNER), totalPoints: 500 });
  });
}
async function seedMember(id, uid, data = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'leagues', id, 'members', uid), { ...joinMember(id, uid), totalPoints: 120, ...data });
  });
}

// ── shipped client flows must keep working ─────────────────────────────────
test('shipped: createLeague batch (league + owner member)', async () => {
  const d = db(OWNER);
  const batch = writeBatch(d);
  batch.set(doc(d, 'leagues', 'NEW'), leagueData(OWNER));
  batch.set(doc(d, 'leagues', 'NEW', 'members', OWNER), ownerMember('NEW', OWNER));
  await assertSucceeds(batch.commit());
});

test('step B: join and leave work; the client can no longer write memberCount (the server owns it)', async () => {
  await seedLeague();
  const d = db(ALICE);
  await assertSucceeds(setDoc(doc(d, 'leagues', 'L1', 'members', ALICE), joinMember('L1', ALICE)));
  await assertFails(updateDoc(doc(d, 'leagues', 'L1'), { memberCount: increment(1), updatedAt: serverTimestamp() }));
  await assertSucceeds(deleteDoc(doc(d, 'leagues', 'L1', 'members', ALICE)));
  await assertFails(updateDoc(doc(d, 'leagues', 'L1'), { memberCount: increment(-1), updatedAt: serverTimestamp() }));
});

test('shipped: approval leagues take a pending member; owner approves and bumps the count', async () => {
  await seedLeague('L1', { settings: { allowLateJoin: true, lockDeadline: 'qualifying', requireApproval: true } });
  await assertSucceeds(setDoc(doc(db(ALICE), 'leagues', 'L1', 'members', ALICE), joinMember('L1', ALICE, 'pending', 0)));
  const o = db(OWNER);
  await assertSucceeds(updateDoc(doc(o, 'leagues', 'L1', 'members', ALICE), { status: 'approved', rank: 2 }));
  await assertSucceeds(updateDoc(doc(o, 'leagues', 'L1'), { memberCount: increment(1), updatedAt: serverTimestamp() }));
});

test('shipped: owner promotes, demotes, re-ranks, removes, renames and expands', async () => {
  await seedLeague(); await seedMember('L1', ALICE);
  const o = db(OWNER);
  await assertSucceeds(updateDoc(doc(o, 'leagues', 'L1'), { coAdminIds: [ALICE], updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(o, 'leagues', 'L1', 'members', ALICE), { role: 'admin' }));
  await assertSucceeds(updateDoc(doc(o, 'leagues', 'L1', 'members', ALICE), { role: 'member' }));
  await assertSucceeds(updateDoc(doc(o, 'leagues', 'L1', 'members', ALICE), { rank: 2 }));
  await assertSucceeds(updateDoc(doc(o, 'leagues', 'L1'), { name: 'New Name', updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(o, 'leagues', 'L1'), { maxMembers: 42, updatedAt: serverTimestamp() }));
  await assertSucceeds(deleteDoc(doc(o, 'leagues', 'L1', 'members', ALICE)));
  await assertSucceeds(updateDoc(doc(o, 'leagues', 'L1'), { memberCount: increment(-1), updatedAt: serverTimestamp() }));
});

test('shipped: members read standings; a member fixes their own display name', async () => {
  await seedLeague(); await seedMember('L1', ALICE);
  const d = db(ALICE);
  await assertSucceeds(getDocs(collection(d, 'leagues', 'L1', 'members')));
  await assertSucceeds(updateDoc(doc(d, 'leagues', 'L1', 'members', ALICE), { displayName: 'Alice V.' }));
});

// ── what F-056 closes ──────────────────────────────────────────────────────
test('cannot insert someone else into a league', async () => {
  await seedLeague();
  await assertFails(setDoc(doc(db(MALLORY), 'leagues', 'L1', 'members', BOB), joinMember('L1', BOB)));
  await assertFails(setDoc(doc(db(MALLORY), 'leagues', 'L1', 'members', MALLORY), { ...joinMember('L1', MALLORY), userId: BOB }));
});

test('cannot join with points, a forged rank snapshot, an owner/admin role, or extra fields', async () => {
  await seedLeague();
  const m = (extra) => setDoc(doc(db(MALLORY), 'leagues', 'L1', 'members', MALLORY), { ...joinMember('L1', MALLORY), ...extra });
  await assertFails(m({ totalPoints: 9999 }));
  await assertFails(m({ previousRank: 10, previousRankRaceId: 'baku_2026' }));
  await assertFails(m({ lastRacePoints: 300 }));
  await assertFails(m({ role: 'owner' }));
  await assertFails(m({ role: 'admin' }));
  await assertFails(m({ leagueId: 'OTHER' }));
});

test('cannot join a full league or skip the approval queue', async () => {
  await seedLeague('FULL', { maxMembers: 1, memberCount: 1 });
  await assertFails(setDoc(doc(db(ALICE), 'leagues', 'FULL', 'members', ALICE), joinMember('FULL', ALICE)));
  await seedLeague('GATED', { settings: { requireApproval: true } });
  await assertFails(setDoc(doc(db(ALICE), 'leagues', 'GATED', 'members', ALICE), joinMember('GATED', ALICE, 'approved')));
  await assertFails(setDoc(doc(db(ALICE), 'leagues', 'NOPE', 'members', ALICE), joinMember('NOPE', ALICE)));
});

test('a member cannot edit their own points, rank, role, status or movement fields', async () => {
  await seedLeague(); await seedMember('L1', ALICE, { status: 'pending' });
  const ref = doc(db(ALICE), 'leagues', 'L1', 'members', ALICE);
  await assertFails(updateDoc(ref, { totalPoints: 9999 }));
  await assertFails(updateDoc(ref, { rank: 1 }));
  await assertFails(updateDoc(ref, { role: 'admin' }));
  await assertFails(updateDoc(ref, { status: 'approved' }));
  await assertFails(updateDoc(ref, { previousRank: 9, previousRankRaceId: 'baku_2026' }));
  await assertFails(updateDoc(ref, { lastRacePoints: 400 }));
});

test('the owner cannot rewrite points, or mint or remove the owner role', async () => {
  await seedLeague(); await seedMember('L1', ALICE);
  const o = db(OWNER);
  await assertFails(updateDoc(doc(o, 'leagues', 'L1', 'members', ALICE), { totalPoints: 9999 }));
  await assertFails(updateDoc(doc(o, 'leagues', 'L1', 'members', OWNER), { totalPoints: 9999 }));
  await assertFails(updateDoc(doc(o, 'leagues', 'L1', 'members', ALICE), { role: 'owner' }));
  await assertFails(updateDoc(doc(o, 'leagues', 'L1', 'members', OWNER), { role: 'member' }));
});

test('league doc: no ownership transfer, no shrinking capacity, no count games', async () => {
  await seedLeague(); await seedMember('L1', ALICE);
  await assertFails(updateDoc(doc(db(OWNER), 'leagues', 'L1'), { ownerId: MALLORY }));
  await assertFails(updateDoc(doc(db(OWNER), 'leagues', 'L1'), { maxMembers: 5 }));
  const outsider = doc(db(MALLORY), 'leagues', 'L1');
  await assertFails(updateDoc(outsider, { memberCount: increment(1), updatedAt: serverTimestamp() }));   // not a member
  await assertFails(updateDoc(outsider, { updatedAt: serverTimestamp() }));                          // no free writes
  await assertFails(updateDoc(outsider, { memberCount: 40, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(outsider, { name: 'pwned' }));
  await assertFails(updateDoc(doc(db(ALICE), 'leagues', 'L1'), { memberCount: increment(-1), updatedAt: serverTimestamp() })); // still a member
  await assertFails(updateDoc(doc(db(ALICE), 'leagues', 'L1'), { memberCount: increment(5), updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db(ALICE), 'leagues', 'L1'), { maxMembers: 999 }));
});

test('step B: the memberCount residual is closed — no non-owner can write a league document', async () => {
  await seedLeague('L1', { memberCount: 3 }); await seedMember('L1', ALICE);
  await assertFails(updateDoc(doc(db(MALLORY), 'leagues', 'L1'), { memberCount: increment(-1), updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db(ALICE), 'leagues', 'L1'), { memberCount: increment(1), updatedAt: serverTimestamp() }));
});

test('a pending member reads (so released clients can detect pending) but has no write privileges', async () => {
  await seedLeague('L1', { settings: { requireApproval: true } });
  await seedMember('L1', ALICE, { status: 'pending', totalPoints: 0, rank: 0 });
  const d = db(ALICE);
  await assertSucceeds(getDocs(query(collection(d, 'leagues', 'L1', 'members'), where('status', '==', 'pending'))));
  await assertFails(updateDoc(doc(d, 'leagues', 'L1'), { memberCount: increment(1), updatedAt: serverTimestamp() }));
  await assertFails(addDoc(collection(d, 'leagues', 'L1', 'messages'), { senderId: ALICE, text: 'hi' }));
  await assertFails(addDoc(collection(d, 'leagues', 'L1', 'invites'), { email: 'x@example.com', status: 'pending', sentBy: ALICE, createdAt: 'now' }));
});

test('approved members chat and invite (both invite shapes released clients send); count cannot pass capacity', async () => {
  await seedLeague('L1', { maxMembers: 2, memberCount: 2 }); await seedMember('L1', ALICE);
  const d = db(ALICE);
  await assertSucceeds(addDoc(collection(d, 'leagues', 'L1', 'messages'), { senderId: ALICE, text: 'hi' }));
  await assertSucceeds(addDoc(collection(d, 'leagues', 'L1', 'invites'), { email: 'x@example.com', status: 'pending', sentBy: ALICE, createdAt: 'now' }));
  await assertSucceeds(addDoc(collection(d, 'leagues', 'L1', 'invites'), { email: 'y@example.com', status: 'pending', createdAt: serverTimestamp(), expiresAt: new Date() }));
  await assertFails(updateDoc(doc(d, 'leagues', 'L1'), { memberCount: increment(1), updatedAt: serverTimestamp() })); // server-owned in step B
});

test('owner updates still work on a legacy member doc without role or status; bad join ranks are refused', async () => {
  await seedLeague();
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'leagues', 'L1', 'members', BOB), { leagueId: 'L1', userId: BOB, totalPoints: 40 }); });
  await assertSucceeds(updateDoc(doc(db(OWNER), 'leagues', 'L1', 'members', BOB), { rank: 2 }));
  await assertFails(setDoc(doc(db(ALICE), 'leagues', 'L1', 'members', ALICE), joinMember('L1', ALICE, 'approved', -1)));
  await assertFails(setDoc(doc(db(ALICE), 'leagues', 'L1', 'members', ALICE), joinMember('L1', ALICE, 'approved', 'first')));
});

test('a league with settings: null still accepts joins', async () => {
  await seedLeague('L1', { settings: null });
  await assertSucceeds(setDoc(doc(db(ALICE), 'leagues', 'L1', 'members', ALICE), joinMember('L1', ALICE)));
});

test('unauthenticated users get nothing', async () => {
  await seedLeague();
  const anon = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anon, 'leagues', 'L1')));
  await assertFails(setDoc(doc(anon, 'leagues', 'L1', 'members', 'x'), joinMember('L1', 'x')));
});

// ── fantasyTeams (F-059 step B): queries are scoped like gets ──
async function seedTeams() {
  await seedLeague(); await seedMember('L1', ALICE); await seedMember('L1', BOB);
  await env.withSecurityRulesDisabled(async (ctx) => {
    const a = ctx.firestore();
    const t = (userId, leagueId, name) => ({ userId, leagueId, name, drivers: [], constructor: null, budget: 1000, totalSpent: 0, totalPoints: 0 });
    await setDoc(doc(a, 'fantasyTeams', 'T-alice'), t(ALICE, 'L1', 'Apex'));
    await setDoc(doc(a, 'fantasyTeams', 'T-alice-solo'), t(ALICE, null, 'Solo'));
    await setDoc(doc(a, 'fantasyTeams', 'T-bob'), t(BOB, 'L1', 'Late Brakers'));
    await setDoc(doc(a, 'fantasyTeams', 'T-mallory'), t(MALLORY, null, 'Outsider'));
  });
}

test('fantasyTeams: owner edits metadata, never the server-owned fields', async () => {
  await seedTeams();
  const d = db(ALICE);
  await assertSucceeds(updateDoc(doc(d, 'fantasyTeams', 'T-alice'), { name: 'Apex Two' }));
  await assertFails(updateDoc(doc(d, 'fantasyTeams', 'T-alice'), { bestRacePoints: 999, bestRaceId: 'x' }));
  await assertFails(updateDoc(doc(d, 'fantasyTeams', 'T-alice'), { totalPoints: 999 }));
  await assertFails(updateDoc(doc(d, 'fantasyTeams', 'T-alice'), { budget: 5000 }));
});

test('fantasyTeams queries the app runs still work: own teams, league teams, a league-mate\'s team', async () => {
  await seedTeams();
  const d = db(ALICE);
  const teams = collection(d, 'fantasyTeams');
  const own = await assertSucceeds(getDocs(query(teams, where('userId', '==', ALICE))));
  assert.equal(own.size, 2);                                                   // league team + solo team
  const inLeague = await assertSucceeds(getDocs(query(teams, where('leagueId', '==', 'L1'))));
  assert.equal(inLeague.size, 2);
  await assertSucceeds(getDocs(query(teams, where('userId', '==', BOB), where('leagueId', '==', 'L1'), limit(1))));   // member team view
  await assertSucceeds(getDocs(query(teams, where('userId', '==', ALICE), where('leagueId', '==', 'L1'), limit(1)))); // createTeam's own check
  await assertSucceeds(getDoc(doc(d, 'fantasyTeams', 'T-bob')));
});

test('fantasyTeams: no more reading strangers\' teams', async () => {
  await seedTeams();
  const m = collection(db(MALLORY), 'fantasyTeams');
  await assertFails(getDocs(m));                                                               // bulk scrape
  await assertFails(getDocs(query(m, where('name', '==', 'Apex'), limit(1))));                 // the old global name probe
  await assertFails(getDocs(query(m, where('userId', '==', ALICE))));                          // someone else's teams
  await assertFails(getDocs(query(m, where('leagueId', '==', 'L1'))));                         // a league she is not in
  await assertFails(getDocs(query(m, where('userId', '==', BOB), where('leagueId', '==', 'L1'), limit(1))));
  await assertFails(getDoc(doc(db(MALLORY), 'fantasyTeams', 'T-bob')));
  await assertSucceeds(getDocs(query(m, where('userId', '==', MALLORY))));                     // her own still fine
});
