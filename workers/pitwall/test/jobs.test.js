const test = require('node:test');
const assert = require('node:assert/strict');
const { canClaim, claimed, holds, completed, jobId, backoffMs, MAX_ATTEMPTS } = require('../dist/workers/pitwall/src/jobs/lease.js');
const { MemoryJobStore } = require('../dist/workers/pitwall/src/jobs/memoryStore.js');
const { runOnce } = require('../dist/workers/pitwall/src/jobs/runner.js');

const J = (extra = {}) => ({ id: jobId('projections', '2026', 17, 'fp1'), kind: 'projections', season: '2026', round: 17, sessionKey: 'fp1', status: 'queued', leaseOwner: null, leaseUntil: null, attempts: 0, notBefore: 0, lastError: null, ...extra });

test('lease rules: queued and expired leases are claimable; live leases, done jobs, future jobs and exhausted jobs are not', () => {
  assert.equal(canClaim(J(), 1000), true);
  assert.equal(canClaim(J({ status: 'leased', leaseOwner: 'forge', leaseUntil: 2000 }), 1000), false);
  assert.equal(canClaim(J({ status: 'leased', leaseOwner: 'forge', leaseUntil: 1000 }), 1000), true);
  assert.equal(canClaim(J({ status: 'done' }), 1000), false);
  assert.equal(canClaim(J({ status: 'failed' }), 1000), true);
  assert.equal(canClaim(J({ notBefore: 5000 }), 1000), false);
  assert.equal(canClaim(J({ status: 'failed', attempts: MAX_ATTEMPTS }), 1000), false);
  const c = claimed(J(), 'forge', 1000, 60000);
  assert.deepEqual([c.status, c.leaseOwner, c.leaseUntil, c.attempts], ['leased', 'forge', 61000, 1]);
  assert.equal(holds(c, 'forge', 2000), true);
  assert.equal(holds(c, 'gcp-backup', 2000), false);
  assert.equal(holds(c, 'forge', 61000), false);
  assert.equal(completed(c, false, 'boom').lastError, 'boom');
  assert.deepEqual([1, 2, 3, 4, 9].map(backoffMs), [60000, 120000, 240000, 480000, 480000]);
});

test('two runners can never hold the same job; enqueue is idempotent', async () => {
  const store = new MemoryJobStore();
  assert.equal(await store.enqueue(J()), 'created');
  assert.equal(await store.enqueue(J()), 'exists');
  const a = await store.claim('forge', 1000, 60000);
  const b = await store.claim('gcp-backup', 1500, 60000);
  assert.equal(a.leaseOwner, 'forge');
  assert.equal(b, null);
  // forge dies; after the lease runs out the backup takes over, and forge's late result is refused
  const c = await store.claim('gcp-backup', 62000, 60000);
  assert.equal(c.leaseOwner, 'gcp-backup');
  assert.equal(c.attempts, 2);
  assert.equal(await store.complete(a.id, 'forge', true, null, 63000), false);
  assert.equal(await store.complete(c.id, 'gcp-backup', true, null, 63000), true);
  assert.equal(await store.claim('forge', 64000, 60000), null);
});

test('runOnce records a run, retries a failure with backoff, and returns null when nothing is due', async () => {
  const store = new MemoryJobStore();
  let t = 1000;
  const opts = { owner: 'forge', leaseMs: 60000, renewEveryMs: 50000, commit: 'abc1234', now: () => t };
  assert.equal(await runOnce(store, { projections: async () => {} }, opts), null);
  await store.enqueue(J());
  const bad = await runOnce(store, { projections: async () => { throw new Error('source down'); } }, opts);
  assert.deepEqual([bad.ok, bad.error, bad.commit], [false, 'source down', 'abc1234']);
  assert.equal(await runOnce(store, { projections: async () => {} }, opts), null); // backing off
  t += 61000;
  const good = await runOnce(store, { projections: async (_job, report) => { report('payloads', 3); report('payloads', 2); } }, opts);
  assert.deepEqual([good.ok, good.counts.payloads], [true, 5]);
  assert.equal(store.jobs.get(J().id).status, 'done');
  assert.equal(store.runs.length, 2);
});

test('a runner that loses its lease mid-job does not mark the job done', async () => {
  const store = new MemoryJobStore();
  await store.enqueue(J());
  let t = 1000;
  const run = await runOnce(store, { projections: async () => { t += 120000; } }, { owner: 'forge', leaseMs: 60000, renewEveryMs: 10 ** 9, commit: null, now: () => t });
  assert.equal(run.ok, false);
  assert.match(run.error, /lease lost/);
  assert.equal(store.jobs.get(J().id).status, 'leased'); // still claimable by the next runner once expired
  assert.equal((await store.claim('gcp-backup', t, 60000)).leaseOwner, 'gcp-backup');
});
