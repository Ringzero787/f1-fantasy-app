// node --test scripts/ops/*.test.js — what a rollback would restore, and what it refuses.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planRestore } = require('./firestore-restore');

const backup = {
  project: 'f1-app-18077',
  docs: {
    'ben_lines/madrid_2026_race': { entities: {} },
    'ben_lines/madrid_2026_sprint': null,
  },
};

test('overwrites documents that existed and deletes ones that did not', () => {
  const plan = planRestore(backup, ['ben_lines/madrid_2026_race', 'ben_lines/madrid_2026_sprint'], 'f1-app-18077');
  assert.deepEqual(plan.map((s) => [s.path, s.action]), [
    ['ben_lines/madrid_2026_race', 'overwrite'],
    ['ben_lines/madrid_2026_sprint', 'delete'],
  ]);
});

test('refuses a backup that names documents outside --only', () => {
  const tampered = { ...backup, docs: { ...backup.docs, 'users/abc': { admin: true } } };
  assert.throws(() => planRestore(tampered, ['ben_lines/madrid_2026_race', 'ben_lines/madrid_2026_sprint'], 'f1-app-18077'), /outside --only.*users\/abc/);
});

test('refuses another project, bad roots and bad document paths', () => {
  assert.throws(() => planRestore(backup, ['ben_lines/madrid_2026_race'], 'other-project'), /target is other-project/);
  assert.throws(() => planRestore(backup, ['ben_lines/../users'], 'f1-app-18077'), /not a plain Firestore path/);
  assert.throws(() => planRestore({ project: 'f1-app-18077', docs: { 'a/../b': {} } }, [], 'f1-app-18077'), /outside --only/);
});

test('a collection root covers the documents under it', () => {
  const coll = { project: 'f1-app-18077', docs: { 'fantasyTeams/t1': { x: 1 }, 'fantasyTeams/t2': null } };
  assert.equal(planRestore(coll, ['fantasyTeams'], 'f1-app-18077').length, 2);
});
