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

// ---- the schedule (F-069)
const { dueJobs, dayKey, SESSION_LAG_MS } = require('../dist/workers/pitwall/src/jobs/schedule.js');

test('the schedule asks for a job ninety minutes after each session in the window, and one daily job at 06:00 UTC', () => {
  const now = new Date('2026-10-02T12:00:00Z');
  const r = { season: '2026', round: 18, sessions: [
    { key: 'fp1', at: new Date('2026-10-02T09:30:00Z') },       // today: due at 11:00
    { key: 'qualifying', at: new Date('2026-10-03T13:00:00Z') }, // tomorrow: queued now, due after it runs
    { key: 'race', at: new Date('2026-10-04T12:00:00Z') },
    { key: 'old', at: new Date('2026-09-20T12:00:00Z') },        // long gone: not queued again
    { key: 'far', at: new Date('2026-10-20T12:00:00Z') },        // too far ahead
  ] };
  const jobs = dueJobs(now, r);
  assert.deepEqual(jobs.filter((j) => j.kind === 'projections').map((j) => j.sessionKey), ['fp1', 'qualifying', 'race', 'daily-20261002']);
  assert.deepEqual(jobs.filter((j) => j.kind === 'briefing').map((j) => [j.sessionKey, j.notBefore - jobs.find((x) => x.kind === 'projections' && x.sessionKey === j.sessionKey).notBefore]), [['fp1', 300000], ['qualifying', 300000], ['race', 300000], ['daily-20261002', 300000]]);
  assert.equal(jobs[0].notBefore, Date.parse('2026-10-02T09:30:00Z') + SESSION_LAG_MS);
  assert.equal(jobs[3].notBefore, Date.parse('2026-10-02T06:00:00Z'));
  assert.equal(jobs[0].id, jobId('projections', '2026', 18, 'fp1'));   // the same id every tick: enqueue is a no-op the second time
  assert.equal(dayKey(new Date('2026-12-31T23:59:59Z')), 'daily-20261231');
});

test('a repeat enqueue of a scheduled job is a no-op, so asking every tick is harmless', async () => {
  const store = new MemoryJobStore();
  const [job] = dueJobs(new Date('2026-10-02T12:00:00Z'), { season: '2026', round: 18, sessions: [{ key: 'fp1', at: new Date('2026-10-02T09:30:00Z') }] }).filter((j) => j.kind === 'projections');
  assert.equal(await store.enqueue(job), 'created');
  assert.equal(await store.enqueue(job), 'exists');
});

// ---- the outlook: inputs, prompt and the check (F-071)
const { outlookInputs, buildPrompt, validateOutlook, allowedNumbers } = require('../dist/workers/pitwall/src/model/outlook.js');
const { runOutlooks } = require('../dist/workers/pitwall/src/jobs/outlooks.js');

const PAGE = {
  asOf: '2026-09-27T06:00:00.000Z', round: { name: 'Harbour' }, rounds: ['HAR', 'SLP', 'TRN'],
  teams: { t1: { name: 'Harbour' }, t2: { name: 'Slipstream' } },
  circuit: { name: 'Harbour', classes: ['street', 'high-speed'] },
  drivers: [
    { id: 'stone', name: 'Stone', team: 't1', price: 300, med: 40, floor: 22, ceil: 55, dnf: 12, win: 5, pod: 20, t10: 80, val: 13.3, pm: 4.2, ptsRise: 4, ptsHold: 2, pRise: 60, pFall: 15, dprice: 3, fit: [4, 3, 2], splits: [{ label: 'street circuits', n: 5, avg: 44.2 }] },
    { id: 'reed', name: 'Reed', team: 't1', price: 200, med: 30, floor: 10, ceil: 40, dnf: 20, win: 0, pod: 5, t10: 60, val: 15, pm: 1, ptsRise: 3, ptsHold: 2, pRise: 40, pFall: 30, dprice: -2, fit: [3, 3, 3], splits: [] },
    { id: 'vale', name: 'Vale', team: 't2', price: 100, med: 10, floor: 0, ceil: 20, dnf: 30, win: 0, pod: 0, t10: 10, val: 10, pm: -3, ptsRise: 2, ptsHold: 1, pRise: 20, pFall: 50, dprice: -4, fit: [2, 2, 2], splits: [] },
  ],
  pace: [{ id: 'stone', starts: 14, avgGrid: 4.5, avgFinish: 3.8, gained: 0.7, finishRate: 93 }],
  season: [{ id: 'stone', points: 618, projected: 1034 }],
  weather: [{ label: 'Race', sky: 'light showers', rainMm: 1.4 }],
  news: [{ kind: 'PENALTY', tone: '-', entity: 'stone', text: 'Stone set for a grid penalty at Harbour' }],
};

test('the inputs are lifted from the published document, and the prompt carries nothing else', () => {
  const i = outlookInputs(PAGE, 'stone');
  assert.equal(i.driver.teammate, 'Reed');
  assert.equal(i.season.points, 618);
  assert.equal(i.news.length, 1);
  assert.deepEqual(i.fit[0], { round: 'HAR', fit: 4 });
  const { user } = buildPrompt(i);
  assert.ok(user.includes('"median":40') && !user.includes('Vale'));
  assert.equal(outlookInputs(PAGE, 'nobody'), null);
});

test('the check refuses a number, a name or a claim that is not in the inputs, and wagering words', () => {
  const i = outlookInputs(PAGE, 'stone');
  const known = ['Stone', 'Reed', 'Vale', 'Harbour', 'Slipstream'];
  assert.equal(validateOutlook('Stone is projected at 40 points with a floor of 22, and the grid penalty in the headline is the risk. The price rises above 4 points and the model puts that at 60%. Reed is the teammate.', i, known), null);
  assert.match(validateOutlook('Stone should score 41 points.', i, known), /number not in inputs: 41/);
  assert.match(validateOutlook('Stone will beat Vale.', i, known), /names someone not in the inputs: Vale/);
  assert.match(validateOutlook('Stone is carrying an injury.', i, known), /claims something no headline carries/);
  assert.match(validateOutlook('Stone is a lock at these odds.', i, known), /wagering/);
  assert.match(validateOutlook('One. Two. Three. Four. Five.', i, known), /too long/);
  assert.equal(validateOutlook('', i, known), 'empty');
  assert.ok(allowedNumbers(i).has('93') && allowedNumbers(i).has('4.5') && allowedNumbers(i).has('1.4'));
});

test('the job writes only texts that pass, retries a refused one once, and skips without a key', async () => {
  const written = {};
  const db = { collection: (name) => ({ doc: (id) => ({ get: async () => (name === 'pw_pages' && id === '2026_18' ? { exists: true, data: () => PAGE } : { exists: false, data: () => undefined }), set: async (data) => { written[`${name}/${id}`] = data; } }) }) };
  let calls = 0;
  const fetchImpl = async (_url, init) => {
    calls += 1;
    const body = JSON.parse(init.body);
    const who = body.messages[0].content.match(/outlook for (\w+)/)[1];
    // Reed's first answer smuggles a number in; the retry is clean. Vale never passes.
    const text = who === 'Vale' ? 'Vale will score 99 points.' : who === 'Reed' && !body.messages[0].content.includes('refused') ? 'Reed will score 77 points.' : `${who} is projected at ${who === 'Stone' ? 40 : 30} points.`;
    return { ok: true, json: async () => ({ content: [{ type: 'text', text }], usage: { input_tokens: 100, output_tokens: 20 } }), text: async () => '' };
  };
  const run = await runOutlooks(db, { season: '2026', round: 18, apply: true, apiKey: 'k', fetchImpl, now: new Date('2026-09-27T07:00:00Z') });
  assert.deepEqual([run.written, run.refused, run.skipped], [2, 1, 0]);
  assert.equal(calls, 5);   // Stone 1, Reed 2, Vale 2
  assert.equal(written['pw_entities/2026_18_stone'].outlook.text, 'Stone is projected at 40 points.');
  assert.ok(!written['pw_entities/2026_18_vale']);
  const dry = await runOutlooks(db, { season: '2026', round: 18, apply: true, apiKey: null, fetchImpl });
  assert.equal(dry.skipped, 3);
});
