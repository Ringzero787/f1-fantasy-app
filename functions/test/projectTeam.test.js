// Runs against the compiled output: `npm --prefix functions run build && node --test functions/test`.
const test = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const { projectTeam } = require('../lib/teams/projectTeam.js');

const before = { userId: 'u1', drivers: [{ driverId: 'gasly' }], budget: 464, totalSpent: 536, lockedPoints: 10, totalPoints: 90 };

test('projects literal writes over the pre-write doc and adds the id', () => {
  const t = projectTeam('T1', before, { drivers: [], budget: 642, totalSpent: 358, racesSinceTransfer: 0 });
  assert.equal(t.id, 'T1');
  assert.equal(t.userId, 'u1');
  assert.deepEqual(t.drivers, []);
  assert.equal(t.budget, 642);
  assert.equal(t.racesSinceTransfer, 0);
  assert.equal(t.lockedPoints, 10); // untouched
  assert.ok(!Number.isNaN(Date.parse(t.updatedAt)));
});

test("increments on the banked-points pair are resolved from the caller's numbers, never echoed as sentinels", () => {
  const update = {
    lockedPoints: admin.firestore.FieldValue.increment(40),
    totalPoints: admin.firestore.FieldValue.increment(-40),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    budget: 630,
  };
  const t = projectTeam('T1', before, update, { lockedPoints: 50, totalPoints: 50 });
  assert.equal(t.lockedPoints, 50);
  assert.equal(t.totalPoints, 50);
  assert.equal(t.budget, 630);
  assert.equal(typeof t.updatedAt, 'string');
});

test('any other FieldValue in the write is a programming error and throws', () => {
  assert.throws(
    () => projectTeam('T1', before, { budget: admin.firestore.FieldValue.increment(5) }),
    /unresolved FieldValue on "budget"/,
  );
});
