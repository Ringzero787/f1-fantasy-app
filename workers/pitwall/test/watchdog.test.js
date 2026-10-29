// node --test test/*.test.js — the worker's tick deadline and exit-after-repeated-failures rule (F-132).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { withDeadline, afterTick, TICK_DEADLINE_MS, MAX_TICK_FAILURES } = require('../dist/workers/pitwall/src/jobs/watchdog.js');

test('withDeadline passes a prompt result through', async () => {
  assert.equal(await withDeadline(Promise.resolve(7), 50, 'tick'), 7);
});

test('withDeadline rejects a call that never settles, naming the label and the seconds', async () => {
  const never = new Promise(() => undefined);
  await assert.rejects(withDeadline(never, 20, 'tick'), /tick did not finish within 0 s/);
});

test('withDeadline passes a rejection through unchanged', async () => {
  await assert.rejects(withDeadline(Promise.reject(new Error('boom')), 50, 'tick'), /boom/);
});

test('afterTick resets the count on success and exits only after the limit', () => {
  assert.deepEqual(afterTick(true, 2, 3), { failures: 0, action: 'continue' });
  assert.deepEqual(afterTick(false, 0, 3), { failures: 1, action: 'continue' });
  assert.deepEqual(afterTick(false, 1, 3), { failures: 2, action: 'continue' });
  assert.deepEqual(afterTick(false, 2, 3), { failures: 3, action: 'exit' });
});

test('the defaults notice a hang within one tick period and give up after about fifteen minutes', () => {
  assert.ok(TICK_DEADLINE_MS < 5 * 60 * 1000, 'deadline is shorter than the tick period');
  assert.ok(TICK_DEADLINE_MS < 10 * 60 * 1000, 'deadline is shorter than the job lease');
  assert.equal(MAX_TICK_FAILURES, 3);
});
