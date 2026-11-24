// Runs against the compiled output: `npm --prefix functions run build && node --test functions/test`.
//
// F-175 slice 2: buying a Charter. One league, one season, every approved member reads Pit Wall —
// and never through the personal pass (BUILD.md, "The entitlement trap").
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// ── a fake Firestore with deep merge, transactions and the two query shapes charterStore uses ──
const admin = require('firebase-admin');
const DELETE = Symbol('delete');
class FakeFieldPath { constructor(...segments) { this.segments = segments; } }
const stub = (obj, key, value) => { try { obj[key] = value; } catch { /* fallthrough */ } if (obj[key] !== value) Object.defineProperty(obj, key, { value, configurable: true, writable: true }); };
if (!admin.firestore.FieldValue) stub(admin.firestore, 'FieldValue', {});
stub(admin.firestore.FieldValue, 'delete', () => DELETE);
stub(admin.firestore, 'FieldPath', FakeFieldPath);

const store = require('../lib/charter/charterStore.js');
const passStore = require('../lib/pitwall/passStore.js');
const C = require('../lib/charter/charter.js');
const S = require('../lib/pitwall/stripe.js');
const G = require('../lib/purchases/productGuards.js');
const P = require('../lib/pitwall/pass.js');

const isMap = (v) => v && typeof v === 'object' && !Array.isArray(v) && v !== DELETE;
function deepMerge(base, patch) {
  const out = { ...(base ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === DELETE) delete out[k];
    else if (isMap(v) && isMap(out[k])) out[k] = deepMerge(out[k], v);
    else if (isMap(v)) out[k] = deepMerge({}, v);
    else out[k] = v;
  }
  return out;
}
const getPath = (obj, segs) => segs.reduce((o, s) => (o == null ? undefined : o[s]), obj);

function fakeDb(seed = {}) {
  const docs = new Map(Object.entries(seed));
  const writes = [];
  const apply = (p, v, o) => { writes.push(p); docs.set(p, o?.merge ? deepMerge(docs.get(p), v) : deepMerge({}, v)); };
  const ref = (p) => ({
    path: p,
    id: p.split('/').pop(),
    get: async () => ({ exists: docs.has(p), id: p.split('/').pop(), data: () => docs.get(p), ref: ref(p) }),
    set: async (v, o) => apply(p, v, o),
    collection: (name) => coll(`${p}/${name}`),
  });
  const snapOf = (hits) => ({ empty: !hits.length, size: hits.length, docs: hits.map(([p, d]) => ({ id: p.split('/').pop(), ref: ref(p), data: () => d })) });
  const children = (prefix) => [...docs.entries()].filter(([p]) => p.startsWith(`${prefix}/`) && !p.slice(prefix.length + 1).includes('/'));
  const coll = (prefix) => ({
    doc: (id) => ref(`${prefix}/${id}`),
    get: async () => snapOf(children(prefix)),
    where: (field, op, value) => {
      const segs = field instanceof FakeFieldPath ? field.segments : String(field).split('.');
      const test = (d) => {
        const v = getPath(d, segs);
        if (op === '==') return v === value;
        if (op === '>') return typeof v === 'number' && v > value;
        if (op === '<=') return typeof v === 'number' && v <= value;
        throw new Error(`op ${op}`);
      };
      const q = { get: async () => snapOf(children(prefix).filter(([, d]) => test(d))), limit: () => q };
      return q;
    },
  });
  return {
    docs, writes,
    doc: ref,
    collection: coll,
    batch: () => { const ops = []; return { set: (r, v, o) => ops.push(() => apply(r.path, v, o)), delete: (r) => ops.push(() => docs.delete(r.path)), commit: async () => ops.forEach((f) => f()) }; },
    runTransaction: async (fn) => fn({ get: (r) => r.get(), set: (r, v, o) => apply(r.path, v, o) }),
  };
}

const NOW = Date.parse('2027-03-01T12:00:00Z');
const END_2027 = P.seasonExpiry('2027');
const seedLeague = (extra = {}) => ({
  'leagues/L1': { ownerId: 'owner', name: 'Pit Lane', isPublic: false, settings: { requireApproval: false, scoring: 'std' }, ...extra },
  'leagues/L1/members/owner': { status: 'approved' },
  'leagues/L1/members/amy': { status: 'approved' },
  'leagues/L1/members/bob': {},
  'leagues/L1/members/pat': { status: 'pending' },
  'leagues/L2': { ownerId: 'owner', name: 'Second', pro: false },
  'users/owner': { pass: { tier: 'pitwall', season: '2027', expiresAt: END_2027 - 86400000, source: 'play' } },
  'users/amy': { pass: { tier: 'pitwall', season: '2027', expiresAt: END_2027, source: 'stripe' } },
});

// ── products ──
test('one id everywhere, on the known list; the pass and the charter are different products', () => {
  assert.equal(G.CHARTER_PRODUCT_ID, 'pitwall.charter.season');
  assert.equal(C.CHARTER_PRODUCT, G.CHARTER_PRODUCT_ID);
  assert.equal(S.CHARTER_PRODUCT_ID, G.CHARTER_PRODUCT_ID);
  assert.ok(G.isKnownProduct('pitwall.charter.season'));
  assert.notEqual(G.CHARTER_PRODUCT_ID, G.PASS_PRODUCT_ID);
  assert.equal(S.CHARTER_AMOUNT_CENTS, C.CHARTER_PRICE_CENTS);
  assert.equal(S.CHARTER_AMOUNT_CENTS, 3999);
});

test('validatePurchase: the pass branch grants the pass, the charter branch charters, Amazon is refused, the store echo is checked', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'purchases', 'validatePurchase.ts'), 'utf8');
  assert.match(src, /productId === CHARTER_PRODUCT_ID && isAmazon/);
  assert.match(src, /if \(productId === PASS_PRODUCT\) \{\s*const pass = await grantPass/);
  // the charter branch never reaches grantPass
  const charterFn = src.slice(src.indexOf('async function applyCharter'));
  assert.doesNotMatch(charterFn, /grantPass|revokePass/);
  assert.match(charterFn, /grantCharter\(db/);
  // a Play token for one product cannot answer for the other: the URL names the product and the echo is compared
  assert.match(src, /answered !== productId/);
  assert.match(src, /expectedProductId: productId/);
});

test('charterStore and the webhook charter branches never call grantPass or revokePass', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'src', 'charter', 'charterStore.ts'), 'utf8');
  assert.doesNotMatch(s.replace(/^\s*\*.*$/gm, '').replace(/\/\/.*$/gm, ''), /grantPass\(|revokePass\(/);
  const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'pitwall', 'index.ts'), 'utf8');
  const charterArm = idx.slice(idx.indexOf("action.kind === 'charter'"), idx.indexOf("} else {\n      console.log('[pw] stripe webhook ignored"));
  assert.doesNotMatch(charterArm.replace(/\/\/.*$/gm, ''), /grantPass\(|revokePass\(/);
  assert.match(charterArm, /grantCharter\(db/);
  assert.match(charterArm, /clearCharter\(db/);
});

// ── decisions ──
test('grant decision: owner only, one per season, replay is a no-op, renewal for next season allowed', () => {
  const d = (league, ref = 'r1', season = '2027') => C.charterGrantDecision({ league, buyerId: 'owner', season, ref, now: NOW }).kind + (C.charterGrantDecision({ league, buyerId: 'owner', season, ref, now: NOW }).reason ? ':' + C.charterGrantDecision({ league, buyerId: 'owner', season, ref, now: NOW }).reason : '');
  assert.equal(d(null), 'refuse:no-league');
  assert.equal(d({ ownerId: 'someone' }), 'refuse:not-owner');
  assert.equal(d({ ownerId: 'owner' }), 'grant');
  const live = { ownerId: 'owner', chartered: true, charter: { season: '2027', expiresAt: END_2027, ref: 'r1' } };
  assert.equal(d(live, 'r1'), 'replay');
  assert.equal(d(live, 'r2'), 'refuse:already-chartered');
  assert.equal(d({ ...live, charter: { ...live.charter, season: '2026', expiresAt: NOW + 1000, ref: 'old' } }, 'r2'), 'grant', 'a live 2026 charter does not block buying 2027');
  assert.equal(d({ ...live, charter: { ...live.charter, expiresAt: NOW - 1 } }, 'r2'), 'grant', 'an expired charter does not block');
});

test('access goes to the owner and approved members; pending members get nothing', () => {
  assert.deepEqual(C.charterMemberIds('owner', [{ id: 'amy', status: 'approved' }, { id: 'pat', status: 'pending' }, { id: 'bob' }, { id: 'owner', status: 'approved' }]), ['owner', 'amy', 'bob']);
  assert.deepEqual(C.charterMemberIds('owner', []), ['owner'], 'an owner with no member document still gets access');
});

test('league patch: public, approval on, Pro until the charter ends; nothing about a pass', () => {
  const c = C.newCharter('2027', 'owner', 'play', 'r1', NOW, END_2027);
  const p = C.charterLeaguePatch(c);
  assert.deepEqual(p, { charter: c, chartered: true, isPublic: true, settings: { requireApproval: true }, pro: true, proUntil: END_2027 });
  assert.ok(!('pass' in p));
});

test('owner Pro: a pass and a charter never shorten each other', () => {
  const chartered = { chartered: true, charter: { expiresAt: END_2027 } };
  assert.deepEqual(C.ownerProPatch(chartered, END_2027 - 5, NOW), { pro: true, proUntil: END_2027 });
  assert.deepEqual(C.ownerProPatch(chartered, null, NOW), { pro: true, proUntil: END_2027 }, 'revoking the pass leaves a chartered league Pro');
  assert.deepEqual(C.ownerProPatch({}, END_2027, NOW), { pro: true, proUntil: END_2027 });
  assert.deepEqual(C.ownerProPatch({}, null, NOW), { pro: false });
});

// ── Stripe ──
test('checkout: a charter is $39.99 with the league in metadata on the session AND the payment; the pass is unchanged', () => {
  const ch = S.checkoutSessionParams({ uid: 'owner', season: '2027', product: 'pitwall.charter.season', leagueId: 'L1' }, 's', 'c');
  assert.equal(ch['line_items[0][price_data][unit_amount]'], '3999');
  assert.equal(ch['line_items[0][price_data][product_data][description]'], 'Pit Wall for every player in one league, for the season.');
  for (const k of ['metadata', 'payment_intent_data[metadata]']) {
    assert.equal(ch[`${k}[product]`], 'pitwall.charter.season');
    assert.equal(ch[`${k}[leagueId]`], 'L1');
    assert.equal(ch[`${k}[uid]`], 'owner');
  }
  assert.throws(() => S.checkoutSessionParams({ uid: 'owner', season: '2027', product: 'pitwall.charter.season' }, 's', 'c'));
  const pass = S.checkoutSessionParams({ uid: 'u', season: '2027' }, 's', 'c');
  assert.equal(pass['line_items[0][price_data][unit_amount]'], '1499');
  assert.equal(pass['metadata[product]'], 'pitwall.pass.season');
  assert.ok(!('metadata[leagueId]' in pass));
});

test('webhook: a paid charter charters; a full refund or a dispute unchartered; a pass refund still revokes the pass', () => {
  const meta = { uid: 'owner', season: '2027', product: 'pitwall.charter.season', leagueId: 'L1' };
  const sess = { payment_status: 'paid', metadata: meta, payment_intent: 'pi_1', amount_subtotal: 3999, amount_total: 4359, currency: 'usd' };
  const paid = S.webhookAction({ id: 'evt1', type: 'checkout.session.completed', data: { object: sess } });
  assert.deepEqual(paid, { kind: 'charter', uid: 'owner', season: '2027', leagueId: 'L1', ref: 'stripe:pi_1' });
  const async = S.webhookAction({ id: 'evt2', type: 'checkout.session.async_payment_succeeded', data: { object: sess } });
  assert.equal(async.ref, paid.ref, 'both success events key on the payment, so the second is a replay');
  assert.equal(S.webhookAction({ id: 'evt3', type: 'checkout.session.completed', data: { object: { ...sess, amount_subtotal: 1499 } } }).kind, 'ignore', 'a charter at the wrong price is not granted');
  assert.equal(S.webhookAction({ id: 'evt4', type: 'checkout.session.completed', data: { object: { ...sess, currency: 'eur' } } }).kind, 'ignore');
  assert.equal(S.webhookAction({ type: 'charge.refunded', data: { object: { refunded: false, metadata: { uid: 'u', product: 'pitwall.pass.season' } } } }).kind, 'ignore', 'a partial pass refund keeps the pass');
  assert.deepEqual(S.webhookAction({ type: 'charge.refunded', data: { object: { refunded: true, metadata: meta, payment_intent: 'pi_1' } } }), { kind: 'uncharter', leagueId: 'L1', ref: 'stripe:pi_1', reason: 'charge.refunded' });
  assert.equal(S.webhookAction({ type: 'charge.refunded', data: { object: { refunded: false, metadata: meta, payment_intent: 'pi_1' } } }).kind, 'ignore', 'a partial refund keeps the charter');
  assert.deepEqual(S.webhookAction({ type: 'charge.dispute.created', data: { object: { payment_intent: 'pi_1', metadata: {} } } }), { kind: 'uncharter', leagueId: null, ref: 'stripe:pi_1', reason: 'charge.dispute.created' });
  assert.deepEqual(S.webhookAction({ type: 'charge.refunded', data: { object: { refunded: true, metadata: { uid: 'u', product: 'pitwall.pass.season' } } } }), { kind: 'revoke', uid: 'u', reason: 'charge.refunded' });
  assert.equal(S.webhookAction({ id: 'e', type: 'checkout.session.completed', data: { object: { payment_status: 'paid', metadata: { uid: 'u', season: '2027', product: 'pitwall.pass.season' } } } }).kind, 'grant');
});

// ── grant and clear against a fake Firestore ──
test('grant: charters that league only, gives the owner and approved members access, never writes a pass', async () => {
  const db = fakeDb(seedLeague());
  const before = { owner: JSON.stringify(db.docs.get('users/owner').pass), amy: JSON.stringify(db.docs.get('users/amy').pass) };
  const r = await store.grantCharter(db, { leagueId: 'L1', buyerId: 'owner', season: '2027', source: 'play', ref: 'pur1', now: NOW });
  assert.equal(r.applied, true);
  assert.equal(r.members, 3);
  const L1 = db.docs.get('leagues/L1');
  assert.equal(L1.chartered, true);
  assert.equal(L1.charter.expiresAt, END_2027);
  assert.equal(L1.isPublic, true);
  assert.deepEqual(L1.settings, { requireApproval: true, scoring: 'std' }, 'other settings kept');
  assert.equal(L1.pro, true);
  assert.equal(L1.proUntil, END_2027);
  assert.equal(db.docs.get('leagues/L2').pro, false, 'a second league the buyer owns is not made Pro');
  for (const u of ['owner', 'amy', 'bob']) assert.equal(db.docs.get(`users/${u}`).charterAccess.leagues.L1, END_2027, u);
  assert.equal(db.docs.get('users/pat'), undefined, 'pending member: no access');
  assert.equal(JSON.stringify(db.docs.get('users/owner').pass), before.owner);
  assert.equal(JSON.stringify(db.docs.get('users/amy').pass), before.amy);
  assert.equal(db.docs.get('users/bob').pass, undefined);
  assert.equal(db.docs.get('charter_grants/pur1').leagueId, 'L1');
});

test('grant: a replay writes nothing new; a non-owner is refused and recorded; a bad league id is recorded', async () => {
  const db = fakeDb(seedLeague());
  await store.grantCharter(db, { leagueId: 'L1', buyerId: 'owner', season: '2027', source: 'play', ref: 'pur1', now: NOW });
  const snapshot = JSON.stringify(db.docs.get('leagues/L1'));
  const again = await store.grantCharter(db, { leagueId: 'L1', buyerId: 'owner', season: '2027', source: 'play', ref: 'pur1', now: NOW + 5000 });
  assert.equal(again.replay, true);
  assert.equal(JSON.stringify(db.docs.get('leagues/L1')), snapshot);
  const second = await store.grantCharter(db, { leagueId: 'L1', buyerId: 'owner', season: '2027', source: 'apple', ref: 'pur2', now: NOW });
  assert.deepEqual(second, { applied: false, reason: 'already-chartered' });
  assert.equal(db.docs.get('charter_grants/pur2').refused, 'already-chartered');

  const db2 = fakeDb(seedLeague());
  assert.deepEqual(await store.grantCharter(db2, { leagueId: 'L1', buyerId: 'amy', season: '2027', source: 'play', ref: 'x', now: NOW }), { applied: false, reason: 'not-owner' });
  assert.equal(db2.docs.get('leagues/L1').chartered, undefined);
  assert.deepEqual(await store.grantCharter(db2, { leagueId: '../L1', buyerId: 'owner', season: '2027', source: 'play', ref: 'y', now: NOW }), { applied: false, reason: 'no-league' });
  assert.equal(db2.docs.get('charter_grants/y').refused, 'no-league');
});

test('refund: clears that league and its members\' access, keeps every personal pass, falls back to the owner\'s own Pro; never re-grants', async () => {
  const db = fakeDb(seedLeague());
  await store.grantCharter(db, { leagueId: 'L1', buyerId: 'owner', season: '2027', source: 'play', ref: 'pur1', now: NOW });
  assert.equal(await store.clearCharter(db, { leagueId: 'L1', ref: 'other', reason: 'refund', now: NOW }), false, 'a different purchase cannot clear it');
  assert.equal(db.docs.get('leagues/L1').chartered, true);
  assert.equal(await store.clearCharter(db, { leagueId: 'L1', ref: 'pur1', reason: 'store refund', now: NOW }), true);
  const L1 = db.docs.get('leagues/L1');
  assert.equal(L1.charter, undefined);
  assert.equal(L1.chartered, undefined);
  assert.equal(L1.isPublic, false);
  assert.equal(L1.settings.requireApproval, false);
  assert.equal(L1.pro, true, "the owner's own pass still makes their league Pro");
  assert.equal(L1.proUntil, db.docs.get('users/owner').pass.expiresAt);
  for (const u of ['owner', 'amy', 'bob']) assert.deepEqual(db.docs.get(`users/${u}`).charterAccess.leagues, {}, u);
  assert.equal(db.docs.get('users/amy').pass.source, 'stripe', 'a member keeps the pass they bought');
  assert.ok(db.docs.has('leagues/L1/members/amy'), 'members stay in the league');
  assert.ok(db.docs.get('charter_grants/pur1').clearedAt);
  assert.deepEqual(await store.grantCharter(db, { leagueId: 'L1', buyerId: 'owner', season: '2027', source: 'play', ref: 'pur1', now: NOW }), { applied: false, reason: 'refunded' }, 'a replayed refunded receipt does not charter again');
});

test('refund with no owner pass: Pro goes; expiry sweep clears only ended charters', async () => {
  const seed = seedLeague();
  delete seed['users/owner'];
  const db = fakeDb(seed);
  await store.grantCharter(db, { leagueId: 'L1', buyerId: 'owner', season: '2027', source: 'stripe', ref: 'stripe:pi_1', now: NOW });
  assert.equal(await store.expireCharters(db, NOW), 0, 'not ended yet');
  assert.equal(await store.expireCharters(db, END_2027 + 1), 1);
  const L1 = db.docs.get('leagues/L1');
  assert.equal(L1.pro, false);
  assert.equal(L1.proUntil, undefined);
  assert.equal(L1.chartered, undefined);
});

test('personal pass: revoking it leaves a chartered league Pro; granting it does not shorten the charter', async () => {
  const db = fakeDb(seedLeague());
  await store.grantCharter(db, { leagueId: 'L1', buyerId: 'owner', season: '2027', source: 'play', ref: 'pur1', now: NOW });
  await passStore.revokePass(db, 'owner', 'test', NOW);
  assert.equal(db.docs.get('leagues/L1').pro, true);
  assert.equal(db.docs.get('leagues/L1').proUntil, END_2027);
  assert.equal(db.docs.get('leagues/L1').chartered, true, 'revokePass does not touch the charter');
  assert.equal(db.docs.get('leagues/L2').pro, false);
  assert.equal(db.docs.get('users/amy').charterAccess.leagues.L1, END_2027, 'members keep access');
  await passStore.markOwnedLeaguesPro(db, 'owner', { expiresAt: END_2027 - 1000 }, NOW);
  assert.equal(db.docs.get('leagues/L1').proUntil, END_2027);
  assert.equal(db.docs.get('leagues/L2').proUntil, END_2027 - 1000);
});

test('one purchase charters one league: a replay naming another league gets the first one', async () => {
  const seed = seedLeague();
  seed['leagues/L3'] = { ownerId: 'owner', name: 'Third' };
  const db = fakeDb(seed);
  await store.grantCharter(db, { leagueId: 'L1', buyerId: 'owner', season: '2027', source: 'play', ref: 'pur1', now: NOW });
  const r = await store.grantCharter(db, { leagueId: 'L3', buyerId: 'owner', season: '2027', source: 'play', ref: 'pur1', now: NOW + 1 });
  assert.equal(r.applied, true);
  assert.equal(r.leagueId, 'L1');
  assert.equal(r.replay, true);
  assert.equal(db.docs.get('leagues/L3').chartered, undefined, 'the other league is not chartered');
  assert.equal(db.docs.get('charter_grants/pur1').leagueId, 'L1');
});

test('a league over 22 players is not chartered', async () => {
  const seed = seedLeague();
  for (let k = 0; k < 21; k += 1) seed[`leagues/L1/members/m${k}`] = { status: 'approved' };
  const db = fakeDb(seed);
  assert.equal(C.CHARTER_MEMBER_CAP, 22);
  assert.deepEqual(await store.grantCharter(db, { leagueId: 'L1', buyerId: 'owner', season: '2027', source: 'play', ref: 'big', now: NOW }), { applied: false, reason: 'too-large' });
  assert.equal(db.docs.get('leagues/L1').chartered, undefined);
  assert.equal(C.charterGrantDecision({ league: { ownerId: 'o' }, buyerId: 'o', season: '2027', ref: 'r', now: NOW, memberCount: 22 }).kind, 'grant');
});

test('a refund that arrives before its grant stops the grant', async () => {
  const db = fakeDb(seedLeague());
  assert.equal(await store.clearCharter(db, { leagueId: 'L1', ref: 'stripe:pi_9', reason: 'charge.refunded', now: NOW }), false);
  assert.ok(db.docs.get('charter_grants/stripe:pi_9').clearedAt);
  assert.deepEqual(await store.grantCharter(db, { leagueId: 'L1', buyerId: 'owner', season: '2027', source: 'stripe', ref: 'stripe:pi_9', now: NOW + 1 }), { applied: false, reason: 'refunded' });
  await store.markRefunded(db, 'stripe:pi_10', 'charge.dispute.created', NOW);
  assert.deepEqual(await store.grantCharter(db, { leagueId: 'L1', buyerId: 'owner', season: '2027', source: 'stripe', ref: 'stripe:pi_10', now: NOW + 1 }), { applied: false, reason: 'refunded' });
});

test("a charter never shortens Pro the owner's own pass already gives", async () => {
  const seed = seedLeague();
  seed['users/owner'] = { pass: { tier: 'pitwall', season: '2028', expiresAt: END_2027 + 365 * 86400000 } };
  const db = fakeDb(seed);
  await store.grantCharter(db, { leagueId: 'L1', buyerId: 'owner', season: '2027', source: 'play', ref: 'p', now: NOW });
  assert.equal(db.docs.get('leagues/L1').proUntil, END_2027 + 365 * 86400000);
  assert.equal(db.docs.get('leagues/L1').charter.expiresAt, END_2027);
});

test('validatePurchase: refunded purchases and non-test accounts in the sandbox do not charter', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'purchases', 'validatePurchase.ts'), 'utf8');
  const fn = src.slice(src.indexOf('async function applyCharter'));
  assert.match(fn, /record\.status === 'refunded'\) return \{ applied: false, reason: 'refunded' \}/);
  assert.match(fn, /testPurchase && \(await db\.doc\(`users\/\$\{userId\}`\)\.get\(\)\)\.data\(\)\?\.testAccount === true/);
  assert.match(fn, /const target = typeof record\.leagueId === 'string' \? record\.leagueId : leagueId/);
});
