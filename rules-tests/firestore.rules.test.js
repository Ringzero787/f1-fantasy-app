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

test('shipped: joinLeague then memberCount +1; leave then -1', async () => {
  await seedLeague();
  const d = db(ALICE);
  await assertSucceeds(setDoc(doc(d, 'leagues', 'L1', 'members', ALICE), joinMember('L1', ALICE)));
  await assertSucceeds(updateDoc(doc(d, 'leagues', 'L1'), { memberCount: increment(1), updatedAt: serverTimestamp() }));
  await assertSucceeds(deleteDoc(doc(d, 'leagues', 'L1', 'members', ALICE)));
  await assertSucceeds(updateDoc(doc(d, 'leagues', 'L1'), { memberCount: increment(-1), updatedAt: serverTimestamp() }));
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

test('known residual: a non-member can nudge memberCount down by one (never below 0) — same shape as a real leaver', async () => {
  await seedLeague('L1', { memberCount: 3 });
  const outsider = doc(db(MALLORY), 'leagues', 'L1');
  await assertSucceeds(updateDoc(outsider, { memberCount: increment(-1), updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(outsider, { memberCount: increment(-2), updatedAt: serverTimestamp() }));
});

test('a drifted count never strands a leaver: the decrement to 0 is allowed', async () => {
  await seedLeague('L1', { memberCount: 1 }); await seedMember('L1', ALICE);
  const d = db(ALICE);
  await assertSucceeds(deleteDoc(doc(d, 'leagues', 'L1', 'members', ALICE)));
  await assertSucceeds(updateDoc(doc(d, 'leagues', 'L1'), { memberCount: increment(-1), updatedAt: serverTimestamp() }));
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
  // one slot of slack for a released client racing the server recount at the last free slot, no more
  await assertSucceeds(updateDoc(doc(d, 'leagues', 'L1'), { memberCount: increment(1), updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(d, 'leagues', 'L1'), { memberCount: increment(1), updatedAt: serverTimestamp() }));
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

// ── fantasyTeams: best-race fields are server-owned (F-054) and the queries shipped clients run ──
test('fantasyTeams: owner edits metadata, never the server-owned fields; shipped queries still run', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'fantasyTeams', 'T1'), { userId: ALICE, leagueId: null, name: 'Apex', drivers: [], constructor: null, budget: 1000, totalSpent: 0, totalPoints: 0 });
  });
  const d = db(ALICE);
  await assertSucceeds(updateDoc(doc(d, 'fantasyTeams', 'T1'), { name: 'Apex Two' }));
  await assertFails(updateDoc(doc(d, 'fantasyTeams', 'T1'), { bestRacePoints: 999, bestRaceId: 'x' }));
  await assertFails(updateDoc(doc(d, 'fantasyTeams', 'T1'), { totalPoints: 999 }));
  await assertFails(updateDoc(doc(d, 'fantasyTeams', 'T1'), { budget: 5000 }));
  await assertSucceeds(getDocs(query(collection(d, 'fantasyTeams'), where('userId', '==', ALICE))));
  // F-059 step B / F-112: the global team-name query is refused now; 2.3.2+ asks checkTeamNameAvailable
  // and config/app.minVersion is raised to 2.3.2 in the same deploy (functions/scripts/setAppVersionGate.js)
  await assertFails(getDocs(query(collection(d, 'fantasyTeams'), where('name', '==', 'Apex'), limit(1))));
});

// ── F-105: creating a league cannot hand yourself the paid features ──
// `allow create: if isAuthenticated()` constrained nothing, so a signed-in player could mint a
// league with `pro: true` (which is what startLeagueTrial checks before granting a Pit Wall pass
// trial), with `maxMembers` set past the league-expansion IAP, or owned by somebody else. The
// F-068 guard only covered UPDATE.
const newLeague = (over = {}) => ({ ...leagueData(ALICE), memberCount: 1, maxMembers: 22, ...over });

test('F-105 league create: the shape a shipped client writes still works', async () => {
  const d = db(ALICE);
  await assertSucceeds(setDoc(doc(d, 'leagues', 'LA'), newLeague()));
  // the Grid screen always sends the default; the legacy screen sends a chosen number
  await assertSucceeds(setDoc(doc(d, 'leagues', 'LB'), newLeague({ maxMembers: 2 })));
  await assertSucceeds(setDoc(doc(d, 'leagues', 'LC'), newLeague({ maxMembers: 22 })));
  // and the batch a real client commits: league + its owner member
  const batch = writeBatch(d);
  batch.set(doc(d, 'leagues', 'LD'), newLeague());
  batch.set(doc(d, 'leagues', 'LD', 'members', ALICE), ownerMember('LD', ALICE));
  await assertSucceeds(batch.commit());
});

test('F-105 league create: Pro cannot be switched on at creation', async () => {
  const d = db(ALICE);
  await assertFails(setDoc(doc(d, 'leagues', 'P1'), newLeague({ pro: true })));
  await assertFails(setDoc(doc(d, 'leagues', 'P2'), newLeague({ pro: true, proUntil: 99999999999 })));
  await assertFails(setDoc(doc(d, 'leagues', 'P3'), newLeague({ proUntil: 99999999999 })));
  // explicitly off, or absent, is the honest starting state
  await assertSucceeds(setDoc(doc(d, 'leagues', 'P4'), newLeague({ pro: false })));
  await assertSucceeds(setDoc(doc(d, 'leagues', 'P5'), newLeague({ pro: false, proUntil: null })));
});

test('F-105 league create: capacity beyond the free tier is the IAP, not a field', async () => {
  const d = db(ALICE);
  await assertFails(setDoc(doc(d, 'leagues', 'M1'), newLeague({ maxMembers: 23 })));
  await assertFails(setDoc(doc(d, 'leagues', 'M2'), newLeague({ maxMembers: 100 })));
  await assertFails(setDoc(doc(d, 'leagues', 'M3'), newLeague({ maxMembers: 999999 })));
  await assertFails(setDoc(doc(d, 'leagues', 'M4'), newLeague({ maxMembers: 1 })));
  await assertFails(setDoc(doc(d, 'leagues', 'M5'), newLeague({ maxMembers: '22' })));
  await assertFails(setDoc(doc(d, 'leagues', 'M6'), newLeague({ maxMembers: 22.5 })));
});

test('F-105 league create: you cannot create a league for somebody else, or pre-filled', async () => {
  const d = db(ALICE);
  await assertFails(setDoc(doc(d, 'leagues', 'O1'), newLeague({ ownerId: BOB })));
  await assertFails(setDoc(doc(d, 'leagues', 'O2'), newLeague({ memberCount: 0 })));
  await assertFails(setDoc(doc(d, 'leagues', 'O3'), newLeague({ memberCount: 22 })));
});

test('F-105 league create: and the IAP path still gets you there', async () => {
  // create free, then applyLeagueExpansion (a function, Admin SDK) raises it — the owner-update
  // rule has always allowed capacity to grow, it just must not start there.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const a = ctx.firestore();
    await setDoc(doc(a, 'leagues', 'LX'), newLeague());
    await setDoc(doc(a, 'leagues', 'LX', 'members', ALICE), ownerMember('LX', ALICE));
    // what the callable writes
    await setDoc(doc(a, 'leagues', 'LX'), { maxMembers: 42 }, { merge: true });
  });
  const after = await getDoc(doc(db(ALICE), 'leagues', 'LX'));
  assert.equal(after.data().maxMembers, 42);
});

// ── F-104: a leagueId has to be something doc() can take ──
// `db.collection('leagues').doc(id)` throws synchronously on an id containing a slash, and
// nothing validated this field — so any signed-in player could create a team with
// `leagueId: "a/b"` and reject every autoLockTeams run from then on: no lineup lock, no ace
// freeze, for everyone, until someone found the document. Checked on update too, because
// leagueId is not a denied key (syncTeam writes it on every sync) and a create-only rule would
// leave the hole open to anyone who created a team properly and then edited it.
const pristine = (over = {}) => ({
  userId: ALICE, name: 'Apex', drivers: [], constructor: null,
  budget: 1000, totalSpent: 0, totalPoints: 0, leagueId: null, ...over,
});

test('F-104 leagueId: a usable id, null, or absent — on create', async () => {
  const d = db(ALICE);
  await assertSucceeds(setDoc(doc(d, 'fantasyTeams', 'ok1'), pristine({ leagueId: 'aBc123XyZ0aBc123XyZ0' })));
  await assertSucceeds(setDoc(doc(d, 'fantasyTeams', 'ok2'), pristine({ leagueId: null })));
  await assertSucceeds(setDoc(doc(d, 'fantasyTeams', 'ok3'), pristine({ leagueId: 'L1' })));
  const { leagueId, ...noField } = pristine();
  await assertSucceeds(setDoc(doc(d, 'fantasyTeams', 'ok4'), noField));
});

test('F-104 leagueId: the shapes that crash doc() are refused on create', async () => {
  const d = db(ALICE);
  // the one that stops the sweep for everybody
  await assertFails(setDoc(doc(d, 'fantasyTeams', 'bad1'), pristine({ leagueId: 'a/b' })));
  // a path that escapes the collection entirely
  await assertFails(setDoc(doc(d, 'fantasyTeams', 'bad2'), pristine({ leagueId: '../leagues/L1' })));
  await assertFails(setDoc(doc(d, 'fantasyTeams', 'bad3'), pristine({ leagueId: '' })));
  await assertFails(setDoc(doc(d, 'fantasyTeams', 'bad4'), pristine({ leagueId: '.' })));
  // Firestore reserves ids matching `__…__` and throws on them as it does on a slash. This one
  // passed the first version of the rule — underscores were allowed anywhere — and RE2 has no
  // negative lookahead, so the rule requires an alphanumeric first character instead.
  await assertFails(setDoc(doc(d, 'fantasyTeams', 'bad5'), pristine({ leagueId: '__proto__' })));
  await assertFails(setDoc(doc(d, 'fantasyTeams', 'bad5b'), pristine({ leagueId: '__name__' })));
  await assertFails(setDoc(doc(d, 'fantasyTeams', 'bad5c'), pristine({ leagueId: '_leading' })));
  await assertFails(setDoc(doc(d, 'fantasyTeams', 'bad6'), pristine({ leagueId: 42 })));
  await assertFails(setDoc(doc(d, 'fantasyTeams', 'bad7'), pristine({ leagueId: { id: 'L1' } })));
  await assertFails(setDoc(doc(d, 'fantasyTeams', 'bad8'), pristine({ leagueId: 'x'.repeat(65) })));
});

test('F-104 leagueId: and refused on UPDATE, which a create-only rule would have missed', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'fantasyTeams', 'T9'), pristine({ leagueId: 'aBc123XyZ0aBc123XyZ0' }));
  });
  const d = db(ALICE);
  await assertFails(updateDoc(doc(d, 'fantasyTeams', 'T9'), { leagueId: 'a/b' }));
  await assertFails(updateDoc(doc(d, 'fantasyTeams', 'T9'), { leagueId: '' }));
  await assertFails(updateDoc(doc(d, 'fantasyTeams', 'T9'), { leagueId: 7 }));
  // riding along with an innocent field is still refused
  await assertFails(updateDoc(doc(d, 'fantasyTeams', 'T9'), { name: 'Apex Two', leagueId: 'a/b' }));
  // and the shipped client keeps working: syncTeam writes leagueId unchanged on every sync
  await assertSucceeds(updateDoc(doc(d, 'fantasyTeams', 'T9'), { leagueId: 'aBc123XyZ0aBc123XyZ0', name: 'Apex Two' }));
  await assertSucceeds(updateDoc(doc(d, 'fantasyTeams', 'T9'), { leagueId: null }));
});

// ── F-095/F-098: the ace is frozen for every session that scores with it ──
// Three sessions score with the ace applied — qualifying, the sprint, the race — and each
// is scored minutes after it ends from a live read, so each had a window to watch the
// session and then point the ace at its winner. The freeze runs from the first of them to
// the failsafe ceiling, with ONE gap: qualifying scored, race not yet started. These cases
// have to prove the gap opens, that it opens on the scoring and not on a clock, and that
// nothing else opens the freeze.
const HOUR = 60 * 60 * 1000;
const at = (offsetMs) => new Date(Date.now() + offsetMs);
const QUALI_MARK = 'quali_round_9';
const SPRINT_MARK = 'sprint_round_9';

/**
 * A weekend stamped as autoLockTeams stamps it. `fromMs` is the first scoring session,
 * `raceMs` lights out; the freeze ends 24h after the race, as the sweep writes it.
 */
const weekend = (fromMs, raceMs, over = {}) => ({
  isSeasonLocked: false, seasonLockRacesRemaining: 0, canModify: false, nextUnlockTime: null,
  aceFreezeFrom: at(fromMs), aceLockTime: at(raceMs), aceLockUntil: at(raceMs + 24 * HOUR),
  aceQualiKey: QUALI_MARK, aceSprintKey: null, ...over,
});
/** The same weekend with a sprint, as the sweep stamps one. */
const sprintWeekend = (fromMs, raceMs) => weekend(fromMs, raceMs, { aceSprintKey: SPRINT_MARK });
const aceTeam = (over = {}) => ({
  userId: ALICE, leagueId: null, name: 'Apex', drivers: [], constructor: null,
  budget: 1000, totalSpent: 0, totalPoints: 0, aceDriverId: 'norris', aceConstructorId: null,
  isLocked: true, scoredRaces: [],
  lockStatus: weekend(-HOUR, HOUR),
  ...over,
});
const seedTeam = async (data) => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'fantasyTeams', 'T1'), data);
  });
};
const moveAce = () => updateDoc(doc(db(ALICE), 'fantasyTeams', 'T1'), { aceDriverId: 'piastri' });

test('F-098 ace: free before the weekend\'s first scoring session', async () => {
  await seedTeam(aceTeam({ lockStatus: weekend(HOUR, 20 * HOUR) }));
  await assertSucceeds(moveAce());
});

test('F-098 ace: frozen through qualifying, until qualifying is actually scored', async () => {
  // Q3 is over, the ace is still pointed at whoever it was pointed at, and the scorer has
  // not run yet. This is the hole: set the ace to the pole-sitter and those points double.
  await seedTeam(aceTeam({ lockStatus: weekend(-HOUR, 20 * HOUR), scoredRaces: [] }));
  await assertFails(moveAce());
});

test('F-098 ace: frozen through the sprint on a sprint weekend', async () => {
  // Sprint on Saturday morning, qualifying hours later, race on Sunday. The freeze starts
  // at the sprint, and qualifying has certainly not been scored yet.
  await seedTeam(aceTeam({ lockStatus: weekend(-HOUR, 30 * HOUR), scoredRaces: [] }));
  await assertFails(moveAce());
  // and still frozen between the sprint being scored and qualifying starting
  await seedTeam(aceTeam({ lockStatus: weekend(-2 * HOUR, 30 * HOUR), scoredRaces: ['sprint_round_9'] }));
  await assertFails(moveAce());
});

test('F-098 ace: once qualifying is scored the ace moves again, right up to lights out', async () => {
  // The designed window, and the reason the gap keys off scoredRaces rather than a clock.
  await seedTeam(aceTeam({ lockStatus: weekend(-5 * HOUR, HOUR), scoredRaces: [QUALI_MARK] }));
  const d = db(ALICE);
  await assertSucceeds(updateDoc(doc(d, 'fantasyTeams', 'T1'), { aceDriverId: 'piastri' }));
  await assertSucceeds(updateDoc(doc(d, 'fantasyTeams', 'T1'), { aceDriverId: null, aceConstructorId: 'mclaren' }));
});

test('F-098 ace: a qualifying key from another race does not open the gap', async () => {
  await seedTeam(aceTeam({ lockStatus: weekend(-5 * HOUR, HOUR), scoredRaces: ['quali_round_8', 'round_8'] }));
  await assertFails(moveAce());
});

test('F-098 ace: when qualifying is never scored on the day, the gap never opens', async () => {
  // An unmapped driver leaves qualifying to be folded in at race time, with the ace read
  // live then — so staying frozen is the correct answer, not an over-strict one.
  await seedTeam(aceTeam({ lockStatus: weekend(-5 * HOUR, HOUR), scoredRaces: [] }));
  await assertFails(moveAce());
});

test('F-098 ace: a scoredRaces that is not a list denies nothing beyond the ace', async () => {
  // Pins the behaviour rather than catching a regression: the quality gate expected
  // `hasAny` on a non-list to error, and an error denies the WHOLE update — a rename
  // included — but the emulator accepts it and this case passes with or without the
  // `is list` guard the rule now carries. Keeping both: the guard says what the two
  // client predicates already do explicitly (a non-array is "not scored"), and this
  // pins that a malformed field cannot make someone's team unwritable.
  await seedTeam(aceTeam({ lockStatus: weekend(-5 * HOUR, HOUR), scoredRaces: QUALI_MARK }));
  const d = db(ALICE);
  await assertSucceeds(updateDoc(doc(d, 'fantasyTeams', 'T1'), { name: 'Apex Two' }));
  await assertFails(moveAce());
});

test('F-098 ace: on a sprint weekend the gap needs the sprint scored too', async () => {
  // The sprint can miss its own scoring run exactly as qualifying can, and is then
  // folded into race scoring from a live ace read. Opening the gap on qualifying alone
  // would hand the player a known sprint result to point the ace at.
  await seedTeam(aceTeam({ lockStatus: sprintWeekend(-5 * HOUR, HOUR), scoredRaces: [QUALI_MARK] }));
  await assertFails(moveAce());
  // both scored: the gap opens as usual
  await seedTeam(aceTeam({ lockStatus: sprintWeekend(-5 * HOUR, HOUR), scoredRaces: [QUALI_MARK, SPRINT_MARK] }));
  await assertSucceeds(moveAce());
  // and a weekend with no sprint asks nothing of the sprint marker
  await seedTeam(aceTeam({ lockStatus: weekend(-5 * HOUR, HOUR), scoredRaces: [QUALI_MARK] }));
  await assertSucceeds(moveAce());
});

test('F-098 ace: an explicit null freeze start falls back to the race, it does not unfreeze', async () => {
  // `get(k, default)` returns the default only when the key is ABSENT. createTeamSecure
  // and the rescue script both write a present null, and reading that as "no freeze"
  // left those teams completely open — worse than before this feature existed.
  await seedTeam(aceTeam({ lockStatus: weekend(-5 * HOUR, -HOUR, { aceFreezeFrom: null }) }));
  await assertFails(moveAce());
  // still free before the race, though: the fallback is the race start, not "always on"
  await seedTeam(aceTeam({ lockStatus: weekend(-5 * HOUR, HOUR, { aceFreezeFrom: null }) }));
  await assertSucceeds(moveAce());
});

test('F-095 ace: once the race has started the ace is frozen', async () => {
  await seedTeam(aceTeam({ lockStatus: weekend(-5 * HOUR, -HOUR), scoredRaces: [QUALI_MARK] }));
  const d = db(ALICE);
  await assertFails(updateDoc(doc(d, 'fantasyTeams', 'T1'), { aceDriverId: 'piastri' }));
  await assertFails(updateDoc(doc(d, 'fantasyTeams', 'T1'), { aceDriverId: null }));
  await assertFails(updateDoc(doc(d, 'fantasyTeams', 'T1'), { aceConstructorId: 'mclaren' }));
  // the ace rode along with an otherwise innocent write — still refused
  await assertFails(updateDoc(doc(d, 'fantasyTeams', 'T1'), { name: 'Apex Two', aceDriverId: 'piastri' }));
  // and the rest of the document is untouched by this clause
  await assertSucceeds(updateDoc(doc(d, 'fantasyTeams', 'T1'), { name: 'Apex Two' }));
  // re-writing the SAME ace is not a change, so it is not blocked — shipped clients
  // send the whole metadata object on every sync and must not start failing.
  await assertSucceeds(updateDoc(doc(d, 'fantasyTeams', 'T1'), { aceDriverId: 'norris', name: 'Apex Three' }));
});

test('F-095 ace: "no ace" spelled as null and spelled as absent are the same ace', async () => {
  // Scoring deletes the ace fields outright when a weekend ends without one
  // (FieldValue.delete in calculatePoints), and the app's sync sends an explicit null for
  // the same state. Comparing affectedKeys would make that innocent difference a change
  // and refuse the whole update — a rename included — for anyone racing without an ace.
  await seedTeam({
    userId: ALICE, leagueId: null, name: 'Apex', drivers: [], constructor: null,
    budget: 1000, totalSpent: 0, totalPoints: 0, isLocked: true, scoredRaces: [],
    lockStatus: weekend(-5 * HOUR, -HOUR),
  });
  const d = db(ALICE);
  await assertSucceeds(updateDoc(doc(d, 'fantasyTeams', 'T1'), { aceDriverId: null, aceConstructorId: null, name: 'Apex Two' }));
  // and the other way about: a null on the server, a field the client simply omits
  await seedTeam(aceTeam({ aceDriverId: null, lockStatus: weekend(-5 * HOUR, -HOUR) }));
  await assertSucceeds(updateDoc(doc(d, 'fantasyTeams', 'T1'), { name: 'Apex Two' }));
  await assertFails(moveAce());
});

test('F-095 ace: the freeze is a window, so a stamp nobody cleared expires', async () => {
  // Last race's weekend, long past its end. Nothing unlocked this team — a season-locked
  // team is never touched by the unlock sweep — and its ace must still be free.
  await seedTeam(aceTeam({ lockStatus: { ...weekend(-80 * HOUR, -72 * HOUR), isSeasonLocked: true } }));
  await assertSucceeds(moveAce());
});

test('F-095 ace: clearing the lock does not open the window — only time does', async () => {
  // The freeze does not consult isLocked, so the callables that clear it (seasonLockTeam
  // then earlyUnlockTeam) buy nothing mid-race.
  await seedTeam(aceTeam({ isLocked: false, lockStatus: { ...weekend(-5 * HOUR, -HOUR), canModify: true } }));
  await assertFails(moveAce());
});

test('F-095 ace: a half-written window freezes nothing', async () => {
  // Fail open rather than shut: a start with no end, or an end with no start, is not a
  // window, and must not strand a player.
  await seedTeam(aceTeam({ lockStatus: { ...weekend(-5 * HOUR, -HOUR), aceLockUntil: null } }));
  await assertSucceeds(moveAce());
  await seedTeam(aceTeam({ lockStatus: { ...weekend(-5 * HOUR, -HOUR), aceFreezeFrom: null, aceLockTime: null } }));
  await assertSucceeds(moveAce());
});

test('F-098 ace: a weekend stamped before the freeze start existed still holds from the race', async () => {
  // What F-095 stamped, and what the Bahrain backfill put on 75 live teams: no
  // aceFreezeFrom, no aceQualiKey. It must still freeze from lights out, and must not
  // freeze before it.
  const f095 = (raceMs) => ({
    isSeasonLocked: false, seasonLockRacesRemaining: 0, canModify: false, nextUnlockTime: null,
    aceLockTime: at(raceMs), aceLockUntil: at(raceMs + 24 * HOUR),
  });
  await seedTeam(aceTeam({ lockStatus: f095(-HOUR) }));
  await assertFails(moveAce());
  await seedTeam(aceTeam({ lockStatus: f095(HOUR) }));
  await assertSucceeds(moveAce());
});

test('F-095 ace: documents written before the fields existed are unaffected', async () => {
  await seedTeam({ userId: ALICE, leagueId: null, name: 'Apex', drivers: [], constructor: null, budget: 1000, totalSpent: 0, totalPoints: 0, aceDriverId: 'norris', isLocked: true });
  await assertSucceeds(moveAce());
  await seedTeam(aceTeam({ lockStatus: { isSeasonLocked: false, canModify: false } }));
  await assertSucceeds(moveAce());
});

test('F-095 ace: the window itself is not the owner\'s to move', async () => {
  await seedTeam(aceTeam({ lockStatus: weekend(-5 * HOUR, -HOUR) }));
  const d = db(ALICE);
  await assertFails(updateDoc(doc(d, 'fantasyTeams', 'T1'), { 'lockStatus.aceFreezeFrom': at(HOUR) }));
  await assertFails(updateDoc(doc(d, 'fantasyTeams', 'T1'), { 'lockStatus.aceLockUntil': at(-HOUR) }));
  await assertFails(updateDoc(doc(d, 'fantasyTeams', 'T1'), { 'lockStatus.aceQualiKey': 'quali_elsewhere' }));
  await assertFails(updateDoc(doc(d, 'fantasyTeams', 'T1'), { isLocked: false }));
  // nor can the owner claim qualifying was scored to open the gap early
  await assertFails(updateDoc(doc(d, 'fantasyTeams', 'T1'), { scoredRaces: [QUALI_MARK] }));
  await assertFails(updateDoc(doc(d, 'fantasyTeams', 'T1'), { scoredRaces: [QUALI_MARK], aceDriverId: 'piastri' }));
});

// ── F-062 race results and F-029 race snapshots: server-written, league-readable ──
test('race results: league members read them, outsiders do not, nobody on a client writes them or raceWins', async () => {
  await seedLeague(); await seedMember('L1', ALICE);
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'leagues', 'L1', 'raceResults', 'round_9'), { raceId: 'round_9', season: '2026', winners: [ALICE], entries: [], estimated: false });
  });
  await assertSucceeds(getDoc(doc(db(ALICE), 'leagues', 'L1', 'raceResults', 'round_9')));
  await assertSucceeds(getDocs(collection(db(OWNER), 'leagues', 'L1', 'raceResults')));
  await assertFails(getDoc(doc(db(MALLORY), 'leagues', 'L1', 'raceResults', 'round_9')));
  for (const uid of [OWNER, ALICE, MALLORY]) {
    await assertFails(setDoc(doc(db(uid), 'leagues', 'L1', 'raceResults', 'round_9'), { winners: [uid] }));
    await assertFails(setDoc(doc(db(uid), 'leagues', 'L1', 'raceResults', 'forged'), { winners: [uid] }));
    await assertFails(deleteDoc(doc(db(uid), 'leagues', 'L1', 'raceResults', 'round_9')));
  }
  await assertFails(updateDoc(doc(db(ALICE), 'leagues', 'L1', 'members', ALICE), { raceWins: 9 }));
  await assertFails(updateDoc(doc(db(OWNER), 'leagues', 'L1', 'members', ALICE), { raceWins: 9 }));
  await assertFails(setDoc(doc(db(BOB), 'leagues', 'L1', 'members', BOB), { ...joinMember('L1', BOB), raceWins: 3 }));
});

test('race snapshots: the owner and the league read them; solo snapshots are private; no client writes', async () => {
  await seedLeague(); await seedMember('L1', ALICE);
  await env.withSecurityRulesDisabled(async (ctx) => {
    const a = ctx.firestore();
    await setDoc(doc(a, 'fantasyTeams', 'tA', 'raceSnapshots', 'round_9'), { teamId: 'tA', userId: ALICE, leagueId: 'L1', raceId: 'round_9', phases: {} });
    await setDoc(doc(a, 'fantasyTeams', 'tSolo', 'raceSnapshots', 'round_9'), { teamId: 'tSolo', userId: BOB, leagueId: null, raceId: 'round_9', phases: {} });
  });
  await assertSucceeds(getDoc(doc(db(ALICE), 'fantasyTeams', 'tA', 'raceSnapshots', 'round_9')));
  await assertSucceeds(getDoc(doc(db(OWNER), 'fantasyTeams', 'tA', 'raceSnapshots', 'round_9')));
  await assertFails(getDoc(doc(db(MALLORY), 'fantasyTeams', 'tA', 'raceSnapshots', 'round_9')));
  await assertSucceeds(getDoc(doc(db(BOB), 'fantasyTeams', 'tSolo', 'raceSnapshots', 'round_9')));
  await assertFails(getDoc(doc(db(ALICE), 'fantasyTeams', 'tSolo', 'raceSnapshots', 'round_9')));
  await assertFails(setDoc(doc(db(ALICE), 'fantasyTeams', 'tA', 'raceSnapshots', 'round_9'), { phases: { race: { points: 999 } } }, { merge: true }));
  await assertFails(setDoc(doc(db(ALICE), 'fantasyTeams', 'tA', 'raceSnapshots', 'forged'), { userId: ALICE, leagueId: 'L1' }));
  await assertFails(deleteDoc(doc(db(ALICE), 'fantasyTeams', 'tA', 'raceSnapshots', 'round_9')));
});

// ── F-106 Moonshot: calls are the owner's until lock, then the league's; quotes are server-only; models are readable ──
const moonshot = (userId, leagueId, status, lockAt) => ({ id: 'm', seasonId: '2026', leagueId, teamId: 'tA', userId, raceId: 'singapore_2026', roundNumber: 19, driverId: 'norris', predictionType: 'PODIUM', predictionTarget: null, stakeCurrency: 'POINTS', stakeAmount: 100, modelProbability: 0.43, rewardBand: 'BOLD', multiplier: 1.25, potentialReward: 125, status, lockAt, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
test('moonshots: the owner sees their own call before lock; the league only after lock and never a cancelled one; nobody writes', async () => {
  await seedLeague(); await seedMember('L1', ALICE); await seedMember('L1', BOB);
  const past = new Date(Date.now() - 60_000), future = new Date(Date.now() + 86_400_000);
  await env.withSecurityRulesDisabled(async (ctx) => {
    const a = ctx.firestore();
    await setDoc(doc(a, 'moonshots', 'open'), moonshot(ALICE, 'L1', 'CONFIRMED', future));
    await setDoc(doc(a, 'moonshots', 'locked'), moonshot(ALICE, 'L1', 'CONFIRMED', past));
    await setDoc(doc(a, 'moonshots', 'cancelled'), moonshot(ALICE, 'L1', 'CANCELLED', past));
    await setDoc(doc(a, 'moonshots', 'solo'), moonshot(ALICE, null, 'CONFIRMED', past));
  });
  await assertSucceeds(getDoc(doc(db(ALICE), 'moonshots', 'open')));
  await assertSucceeds(getDoc(doc(db(ALICE), 'moonshots', 'cancelled')));
  await assertFails(getDoc(doc(db(BOB), 'moonshots', 'open')));          // a rival's call is hidden until lock
  await assertSucceeds(getDoc(doc(db(BOB), 'moonshots', 'locked')));     // then the league sees it
  await assertSucceeds(getDoc(doc(db(OWNER), 'moonshots', 'locked')));
  await assertFails(getDoc(doc(db(BOB), 'moonshots', 'cancelled')));     // a cancelled call is the owner's business
  await assertFails(getDoc(doc(db(BOB), 'moonshots', 'solo')));          // no league, no audience
  await assertFails(getDoc(doc(db(MALLORY), 'moonshots', 'locked')));    // not in the league
  await assertFails(getDocs(query(collection(db(MALLORY), 'moonshots'), where('leagueId', '==', 'L1'))));
  await assertSucceeds(getDocs(query(collection(db(ALICE), 'moonshots'), where('userId', '==', ALICE))));
  await assertFails(setDoc(doc(db(ALICE), 'moonshots', 'forged'), moonshot(ALICE, 'L1', 'HIT', past)));
  await assertFails(updateDoc(doc(db(ALICE), 'moonshots', 'open'), { multiplier: 8, potentialReward: 800 }));
  await assertFails(updateDoc(doc(db(ALICE), 'moonshots', 'locked'), { status: 'CANCELLED' }));
  await assertFails(deleteDoc(doc(db(ALICE), 'moonshots', 'open')));
});

test('moonshot quotes are server-only; models are readable by any player and written by nobody', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const a = ctx.firestore();
    await setDoc(doc(a, 'moonshotQuotes', 'q1'), { uid: ALICE, teamId: 'tA', multiplier: 1.25, used: false });
    await setDoc(doc(a, 'moonshotModels', 'singapore_2026'), { raceId: 'singapore_2026', season: '2026', round: 19, drivers: {}, positionsCount: 22 });
    await setDoc(doc(a, 'moonshotTokens', 'tA_2026'), { teamId: 'tA', userId: ALICE, seasonId: '2026', used: 1 });
  });
  await assertFails(getDoc(doc(db(ALICE), 'moonshotQuotes', 'q1')));
  await assertFails(updateDoc(doc(db(ALICE), 'moonshotQuotes', 'q1'), { multiplier: 8 }));
  await assertSucceeds(getDoc(doc(db(ALICE), 'moonshotModels', 'singapore_2026')));
  await assertSucceeds(getDoc(doc(db(MALLORY), 'moonshotModels', 'singapore_2026')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'moonshotModels', 'singapore_2026')));
  await assertFails(setDoc(doc(db(ALICE), 'moonshotModels', 'singapore_2026'), { drivers: { norris: { positions: [1] } } }, { merge: true }));
  await assertSucceeds(getDoc(doc(db(ALICE), 'moonshotTokens', 'tA_2026')));      // my own token count
  await assertFails(getDoc(doc(db(BOB), 'moonshotTokens', 'tA_2026')));
  await assertFails(updateDoc(doc(db(ALICE), 'moonshotTokens', 'tA_2026'), { used: 0 }));
});

// ── F-107 Moonshot settlement: the Moonshot columns are server-owned; the league feed is read-only ──
test('moonshot settlement: a team cannot write its own moonshotPoints or stats; the league reads its activity feed', async () => {
  await seedLeague(); await seedMember('L1', ALICE);
  await env.withSecurityRulesDisabled(async (ctx) => {
    const a = ctx.firestore();
    await setDoc(doc(a, 'fantasyTeams', 'tA'), { userId: ALICE, leagueId: 'L1', name: 'Alice Racing', budget: 500, totalPoints: 120, lockedPoints: 0, moonshotPoints: 500, drivers: [], scoredRaces: [] });
    await setDoc(doc(a, 'leagues', 'L1', 'activity', 'm1_settled'), { type: 'MOONSHOT_HIT', userId: ALICE, teamId: 'tA', raceId: 'singapore_2026', adjustmentAmount: 500 });
  });
  const fresh = { userId: BOB, leagueId: 'L1', name: 'Bob Racing', budget: 1000, totalSpent: 0, totalPoints: 0, drivers: [], constructor: null };
  await assertSucceeds(setDoc(doc(db(BOB), 'fantasyTeams', 'tB'), fresh));
  await assertSucceeds(setDoc(doc(db(BOB), 'fantasyTeams', 'tB0'), { ...fresh, moonshotPoints: 0 }));
  await assertFails(setDoc(doc(db(BOB), 'fantasyTeams', 'tB1'), { ...fresh, moonshotPoints: 100000 }));          // minted on create
  await assertFails(setDoc(doc(db(BOB), 'fantasyTeams', 'tB2'), { ...fresh, moonshotStats: { pointsWon: 0 } }));
  await assertSucceeds(updateDoc(doc(db(ALICE), 'fantasyTeams', 'tA'), { name: 'Alice Racing II' }));
  await assertFails(updateDoc(doc(db(ALICE), 'fantasyTeams', 'tA'), { moonshotPoints: 5000 }));
  await assertFails(updateDoc(doc(db(ALICE), 'fantasyTeams', 'tA'), { moonshotStats: { hit: 99 } }));
  await assertSucceeds(getDoc(doc(db(ALICE), 'leagues', 'L1', 'activity', 'm1_settled')));
  await assertSucceeds(getDoc(doc(db(OWNER), 'leagues', 'L1', 'activity', 'm1_settled')));
  await assertFails(getDoc(doc(db(MALLORY), 'leagues', 'L1', 'activity', 'm1_settled')));
  await assertFails(setDoc(doc(db(ALICE), 'leagues', 'L1', 'activity', 'forged'), { type: 'MOONSHOT_HIT', userId: ALICE, adjustmentAmount: 9999 }));
  await assertFails(deleteDoc(doc(db(ALICE), 'leagues', 'L1', 'activity', 'm1_settled')));
});

// ── F-111 live positions: any signed-in client reads the server sweep's document; nobody writes it ──
test('live positions: signed-in read, no anonymous read, no client write', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'races', 'singapore_2026', 'live', 'positions'), { raceId: 'singapore_2026', sessionKey: 2, byDriver: { hadjar: 4 }, source: 'openf1' });
  });
  await assertSucceeds(getDoc(doc(db(ALICE), 'races', 'singapore_2026', 'live', 'positions')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'races', 'singapore_2026', 'live', 'positions')));
  await assertFails(setDoc(doc(db(ALICE), 'races', 'singapore_2026', 'live', 'positions'), { byDriver: { hadjar: 1 } }, { merge: true }));
});

// ── F-112: a join awaiting approval reads the member list and nothing else; lists are the owner's or one league's ──
test('pending members read no league content; approved members do; team and notification lists are scoped', async () => {
  await seedLeague(); await seedMember('L1', ALICE); await seedMember('L1', BOB, { status: 'pending' });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const a = ctx.firestore();
    await setDoc(doc(a, 'leagues', 'L1', 'raceResults', 'r1'), { raceId: 'r1', entries: [] });
    await setDoc(doc(a, 'leagues', 'L1', 'activity', 'x'), { type: 'MOONSHOT_HIT', userId: ALICE });
    await setDoc(doc(a, 'leagues', 'L1', 'messages', 'm1'), { senderId: ALICE, text: 'hi' });
    await setDoc(doc(a, 'leagues', 'L1', 'announcements', 'n1'), { text: 'welcome' });
    await setDoc(doc(a, 'leagues', 'L1', 'invites', 'i1'), { email: 'friend@example.com', status: 'sent', sentBy: OWNER });
    await setDoc(doc(a, 'fantasyTeams', 'tA'), { userId: ALICE, leagueId: 'L1', name: 'Alice Racing', budget: 500, totalPoints: 10, drivers: [] });
    await setDoc(doc(a, 'fantasyTeams', 'tM'), { userId: MALLORY, leagueId: null, name: 'Solo', budget: 500, totalPoints: 10, drivers: [] });
    await setDoc(doc(a, 'notifications', 'n-alice'), { userId: ALICE, read: false, title: 'x' });
    await setDoc(doc(a, 'notifications', 'n-bob'), { userId: BOB, read: false, title: 'y' });
  });
  for (const path of [['raceResults', 'r1'], ['activity', 'x'], ['messages', 'm1'], ['announcements', 'n1'], ['invites', 'i1']]) {
    await assertSucceeds(getDoc(doc(db(ALICE), 'leagues', 'L1', ...path)));
    await assertFails(getDoc(doc(db(BOB), 'leagues', 'L1', ...path)));       // pending
  }
  await assertSucceeds(getDoc(doc(db(BOB), 'leagues', 'L1', 'members', ALICE)));   // the member list still tells a pending joiner where they stand
  // lists: the shipped queries (own teams; one league's teams; own notifications) pass, a sweep of the collection does not
  await assertSucceeds(getDocs(query(collection(db(ALICE), 'fantasyTeams'), where('userId', '==', ALICE))));
  await assertSucceeds(getDocs(query(collection(db(ALICE), 'fantasyTeams'), where('leagueId', '==', 'L1'))));
  await assertFails(getDocs(collection(db(ALICE), 'fantasyTeams')));
  await assertFails(getDocs(query(collection(db(MALLORY), 'fantasyTeams'), where('leagueId', '==', 'L1'))));
  await assertSucceeds(getDocs(query(collection(db(ALICE), 'notifications'), where('userId', '==', ALICE), where('read', '==', false))));
  await assertFails(getDocs(collection(db(ALICE), 'notifications')));
});

// ── F-075 Pit Wall: handoff codes and the worker's collections are Admin SDK only ──
test('pit wall server collections: no client can read or write them, signed in or not', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const a = ctx.firestore();
    await setDoc(doc(a, 'pw_handoffs', 'h1'), { uid: ALICE, expiresAt: 9e15, used: false });
    await setDoc(doc(a, 'pw_handoff_limits', `uid_${ALICE}`), { windowStart: 0, count: 1 });
    await setDoc(doc(a, 'pw_jobs', 'j1'), { kind: 'projections', status: 'queued' });
    await setDoc(doc(a, 'pw_runs', 'r1'), { ok: true });
  });
  const anon = env.unauthenticatedContext().firestore();
  for (const [col, id] of [['pw_handoffs', 'h1'], ['pw_handoff_limits', `uid_${ALICE}`], ['pw_jobs', 'j1'], ['pw_runs', 'r1']]) {
    for (const d of [db(ALICE), db(OWNER), anon]) {
      await assertFails(getDoc(doc(d, col, id)));
      await assertFails(getDocs(collection(d, col)));
      await assertFails(setDoc(doc(d, col, id), { used: false, uid: ALICE }, { merge: true }));
      await assertFails(setDoc(doc(d, col, 'forged'), { uid: ALICE, expiresAt: 9e15, used: false }));
      await assertFails(deleteDoc(doc(d, col, id)));
    }
  }
});

// ── F-073: the Ace is the one team field a client writes directly ──
test('an owner may set the ace, but not smuggle roster, budget, points or lock state alongside it', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'fantasyTeams', 'T1'), {
      userId: ALICE, leagueId: 'L1', name: 'Late Brakers', drivers: [{ driverId: 'norris', currentPrice: 300 }],
      constructor: { constructorId: 'mercedes' }, budget: 40, totalSpent: 960, totalPoints: 1200, isLocked: false,
    });
  });
  const mine = doc(db(ALICE), 'fantasyTeams', 'T1');
  await assertSucceeds(updateDoc(mine, { aceDriverId: 'norris' }));
  await assertSucceeds(updateDoc(mine, { aceDriverId: null }));
  await assertSucceeds(updateDoc(mine, { aceConstructorId: 'mercedes' }));
  // the same write may not carry anything that decides money, points or the lock
  for (const extra of [{ drivers: [] }, { budget: 999 }, { totalPoints: 99999 }, { isLocked: false, lockStatus: {} }, { constructor: null }, { totalSpent: 0 }, { scoredRaces: [] }, { lockedPoints: 0 }]) {
    await assertFails(updateDoc(mine, { aceDriverId: 'norris', ...extra }));
  }
  // and nobody else may touch the team at all
  await assertFails(updateDoc(doc(db(MALLORY), 'fantasyTeams', 'T1'), { aceDriverId: 'norris' }));
  await assertFails(updateDoc(doc(db(OWNER), 'fantasyTeams', 'T1'), { aceDriverId: 'norris' }));
});

// ── F-068 Pit Wall Pass: the paywall is in the rules, not only the UI ──
const withPass = (uid, expiresAtMs) => env.authenticatedContext(uid, { pw: Math.floor(expiresAtMs / 1000) }).firestore();

test('paid payloads need the pass claim; the free look and timing frames need only a sign-in', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const a = ctx.firestore();
    for (const c of ['pw_pages', 'pw_entities', 'pw_projections']) await setDoc(doc(a, c, '2026_17'), { round: 17 });
    for (const c of ['pw_public', 'pw_public_timing', 'pw_news']) await setDoc(doc(a, c, '2026_17'), { round: 17 });
  });
  const free = db(ALICE);
  const paid = withPass(ALICE, Date.now() + 86400000);
  const expired = withPass(BOB, Date.now() - 1000);
  const anon = env.unauthenticatedContext().firestore();
  for (const c of ['pw_public', 'pw_public_timing', 'pw_news']) {
    await assertSucceeds(getDoc(doc(free, c, '2026_17')));
    await assertSucceeds(getDoc(doc(paid, c, '2026_17')));
    await assertFails(getDoc(doc(anon, c, '2026_17')));
  }
  for (const c of ['pw_pages', 'pw_entities', 'pw_projections']) {
    await assertSucceeds(getDoc(doc(paid, c, '2026_17')));
    await assertFails(getDoc(doc(free, c, '2026_17')));     // signed in, no pass
    await assertFails(getDoc(doc(expired, c, '2026_17')));  // pass ran out
    await assertFails(getDoc(doc(anon, c, '2026_17')));
    await assertFails(setDoc(doc(paid, c, '2026_17'), { round: 99 }));  // nobody writes payloads
  }
  // a forged claim shape buys nothing
  await assertFails(getDoc(doc(env.authenticatedContext(MALLORY, { pw: 'forever' }).firestore(), 'pw_pages', '2026_17')));
  await assertFails(getDoc(doc(env.authenticatedContext(MALLORY, { pw: true }).firestore(), 'pw_pages', '2026_17')));
});

test('a user cannot write their own pass, trial flag or revocation record', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', ALICE), { email: 'a@example.com', displayName: 'Alice' });
  });
  const d = db(ALICE);
  await assertSucceeds(updateDoc(doc(d, 'users', ALICE), { displayName: 'Alice B' }));
  const forever = { tier: 'pitwall', season: '2026', expiresAt: 9e15, source: 'grant', grantedAt: 0 };
  await assertFails(updateDoc(doc(d, 'users', ALICE), { pass: forever }));
  await assertFails(updateDoc(doc(d, 'users', ALICE), { pwTrialUsed: false }));
  await assertFails(updateDoc(doc(d, 'users', ALICE), { pwRevoked: null }));
  await assertFails(setDoc(doc(db(BOB), 'users', BOB), { pass: forever }));
  await assertFails(setDoc(doc(db(BOB), 'users', BOB), { pwTrialUsed: false }));
  await assertSucceeds(setDoc(doc(db(BOB), 'users', BOB), { displayName: 'Bob' }));
  await assertFails(updateDoc(doc(db(MALLORY), 'users', ALICE), { pass: forever }));
  await assertFails(getDoc(doc(db(MALLORY), 'users', ALICE)));
});

test('a league owner cannot stamp League Pro on their own league', async () => {
  await seedLeague();
  await assertFails(updateDoc(doc(db(OWNER), 'leagues', 'L1'), { pro: true }));
  await assertFails(updateDoc(doc(db(OWNER), 'leagues', 'L1'), { pro: true, proUntil: 9e15 }));
  await assertSucceeds(updateDoc(doc(db(OWNER), 'leagues', 'L1'), { name: 'Renamed' }));
  await seedMember('L1', ALICE);
  await assertFails(updateDoc(doc(db(ALICE), 'leagues', 'L1'), { pro: true }));
  // grant records are closed entirely
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'pw_grants', 'evt_1'), { uid: ALICE }); });
  await assertFails(getDoc(doc(db(ALICE), 'pw_grants', 'evt_1')));
  await assertFails(setDoc(doc(db(ALICE), 'pw_grants', 'evt_2'), { uid: ALICE }));
});

// ── F-071 the wire: reading history and ratings are the reader's own, and nobody else's ──
test('a reader keeps their own wire history; nobody else, admin included, can read it', async () => {
  const mine = doc(db(ALICE), 'users', ALICE, 'pitwall', 'wire');
  await assertSucceeds(setDoc(mine, { read: { k1: 1 }, liked: { k1: 1 }, updatedAt: 1 }));
  await assertSucceeds(getDoc(mine));
  // only the two maps and the stamp: the document is not a place to park other data
  await assertFails(setDoc(mine, { read: {}, liked: {}, updatedAt: 1, notes: 'x' }));
  await assertFails(setDoc(mine, { read: 'k1', liked: {}, updatedAt: 1 }));
  // one document, by name
  await assertFails(setDoc(doc(db(ALICE), 'users', ALICE, 'pitwall', 'other'), { read: {}, liked: {}, updatedAt: 1 }));
  // another reader, and an admin, get nothing
  await assertFails(getDoc(doc(db(MALLORY), 'users', ALICE, 'pitwall', 'wire')));
  await assertFails(setDoc(doc(db(MALLORY), 'users', ALICE, 'pitwall', 'wire'), { read: {}, liked: {}, updatedAt: 1 }));
  const adminDb = env.authenticatedContext('admin-1', { admin: true }).firestore();
  await assertFails(getDoc(doc(adminDb, 'users', ALICE, 'pitwall', 'wire')));
});

test('a league document is readable by that league\'s members and owner, by nobody else, and written by nobody', async () => {
  const L = 'league-pw';
  await env.withSecurityRulesDisabled(async (ctx) => {
    const a = ctx.firestore();
    await setDoc(doc(a, 'leagues', L), leagueData(OWNER));
    await setDoc(doc(a, 'leagues', L, 'members', ALICE), joinMember(L, ALICE));
    await setDoc(doc(a, 'pw_leagues', `${L}_2026_18`), { leagueId: L, round: 18, ownership: { a: 50 }, teams: [] });
  });
  await assertSucceeds(getDoc(doc(db(ALICE), 'pw_leagues', `${L}_2026_18`)));   // member
  await assertSucceeds(getDoc(doc(db(OWNER), 'pw_leagues', `${L}_2026_18`)));   // owner
  await assertFails(getDoc(doc(db(MALLORY), 'pw_leagues', `${L}_2026_18`)));    // signed in, another league
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'pw_leagues', `${L}_2026_18`)));
  await assertFails(setDoc(doc(db(OWNER), 'pw_leagues', `${L}_2026_18`), { leagueId: L, ownership: { a: 100 } }));
});
