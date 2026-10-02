/**
 * Granting a pass again after it was revoked.
 *
 * `pw_grants` holds one record per reference so a retried Stripe webhook cannot extend a pass it
 * already created. The record outlived the thing it stood for: revoking deleted the pass and left
 * the record, so every later grant for the same reference took the idempotency branch, wrote
 * nothing, and reported success to whoever asked. A support grant after a revoke did nothing. So
 * would a repurchase after a refund, which is exactly what the refund work is about to create.
 *
 * Found live: a pass was granted, revoked to test a real purchase, and the grant afterwards
 * reported "granted until 2027-01-31" while `users/{uid}.pass` stayed null.
 *
 * A fake Firestore, because the behaviour under test is the transaction's branching, not Firestore.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../lib/pitwall/passStore.js');

const DELETE = Symbol('delete');

function fakeDb() {
  const docs = new Map();
  const mk = (path) => ({
    path,
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path), ref: mk(path) }),
    set: async (v, o) => applySet(path, v, o),
  });
  const applySet = (path, value, opts) => {
    const base = opts?.merge ? { ...(docs.get(path) ?? {}) } : {};
    for (const [k, v] of Object.entries(value)) { if (v === DELETE) delete base[k]; else base[k] = v; }
    docs.set(path, base);
  };
  const db = {
    docs,
    doc: (path) => mk(path),
    collection: (name) => ({
      doc: (id) => mk(`${name}/${id}`),
      where: (field, _op, value) => ({
        get: async () => {
          const hits = [...docs.entries()].filter(([p, d]) => p.startsWith(`${name}/`) && d[field] === value);
          return { empty: hits.length === 0, docs: hits.map(([p]) => ({ ref: mk(p) })) };
        },
      }),
    }),
    batch: () => {
      const ops = [];
      return { set: (ref, v, o) => ops.push(() => applySet(ref.path, v, o)), delete: (ref) => ops.push(() => docs.delete(ref.path)), commit: async () => ops.forEach((f) => f()) };
    },
    runTransaction: async (fn) => fn({
      get: async (ref) => ref.get(),
      set: (ref, v, o) => applySet(ref.path, v, o),
    }),
  };
  return db;
}

// revokePass reaches for admin.firestore.FieldValue.delete(); stand in for it.
const admin = require('firebase-admin');
if (!admin.firestore.FieldValue) admin.firestore.FieldValue = {};
admin.firestore.FieldValue.delete = () => DELETE;

const UID = 'u1';

test('a grant after a revoke actually grants, instead of reporting success and writing nothing', async () => {
  const db = fakeDb();
  await store.grantPass(db, UID, '2026', 'grant', `admin_2026_${UID}`);
  assert.ok(db.docs.get(`users/${UID}`).pass, 'first grant writes a pass');

  await store.revokePass(db, UID, 'testing a real purchase');
  assert.equal(db.docs.get(`users/${UID}`).pass, undefined, 'revoke removes it');

  await store.grantPass(db, UID, '2026', 'grant', `admin_2026_${UID}`);
  assert.ok(db.docs.get(`users/${UID}`).pass, 'the grant after a revoke must write a pass');
  assert.equal(db.docs.get(`users/${UID}`).pass.season, '2026');
});

test('revoking takes the idempotency records with it', async () => {
  const db = fakeDb();
  await store.grantPass(db, UID, '2026', 'grant', `admin_2026_${UID}`);
  assert.ok(db.docs.has(`pw_grants/admin_2026_${UID}`));
  await store.revokePass(db, UID, 'refund');
  assert.equal(db.docs.has(`pw_grants/admin_2026_${UID}`), false, 'a record that outlives its pass blocks the next grant');
});

test('a retried reference still cannot grant twice while the pass is there', async () => {
  // The thing the record exists for, which must keep working.
  const db = fakeDb();
  const first = await store.grantPass(db, UID, '2026', 'stripe', 'evt_1', 1000);
  const again = await store.grantPass(db, UID, '2026', 'stripe', 'evt_1', 9999);
  assert.equal(again.grantedAt, first.grantedAt, 'a replayed webhook must not re-date the pass');
  assert.equal(again.expiresAt, first.expiresAt);
});

test('another user is untouched by a revoke', async () => {
  const db = fakeDb();
  await store.grantPass(db, UID, '2026', 'grant', `admin_2026_${UID}`);
  await store.grantPass(db, 'u2', '2026', 'grant', 'admin_2026_u2');
  await store.revokePass(db, UID, 'support');
  assert.ok(db.docs.get('users/u2').pass, 'u2 keeps their pass');
  assert.ok(db.docs.has('pw_grants/admin_2026_u2'), 'and their grant record');
});

test('a grant record left behind by an older revoke does not block a grant', async () => {
  // The live state, reproduced directly rather than through revokePass: the record is there and the
  // pass is not, because it was revoked before revokePass cleaned records up. Any deployment that
  // revoked a pass before this fix has users sitting exactly like this, and the fix to revokePass
  // does nothing for them — only the grant side can.
  const db = fakeDb();
  db.docs.set(`pw_grants/admin_2026_${UID}`, { uid: UID, season: '2026', source: 'grant', at: 1 });
  db.docs.set(`users/${UID}`, { pwRevoked: { at: 2, reason: 'testing a real purchase' } });

  const pass = await store.grantPass(db, UID, '2026', 'grant', `admin_2026_${UID}`);
  assert.ok(db.docs.get(`users/${UID}`).pass, 'the pass must be written, not merely returned');
  assert.equal(pass.season, '2026');
  assert.equal(db.docs.get(`users/${UID}`).pass.expiresAt, pass.expiresAt);
});
