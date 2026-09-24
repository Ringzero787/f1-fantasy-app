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
  // released builds check team-name uniqueness with this global query; it must keep working until F-059
  await assertSucceeds(getDocs(query(collection(d, 'fantasyTeams'), where('name', '==', 'Apex'), limit(1))));
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
