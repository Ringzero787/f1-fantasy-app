/**
 * Which pass a refund is allowed to take.
 *
 * The verdict logic next door is careful never to call something a refund unless it is one. That is
 * the easy half. The half that nearly shipped wrong: a refund is about one transaction, and the
 * buyer may have purchased again since. Revoking on the user id alone reaches whatever pass is
 * currently there, which can be one they have just paid for — and it does not heal, because a
 * replayed receipt is answered as a duplicate before it ever reaches the grant.
 *
 * `grantPass` records the purchase it came from in `pass.ref`. These pin that it is consulted.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'pitwall', 'refundSweep.ts'), 'utf8');
const body = SRC.slice(SRC.indexOf('export const sweepRefundedPasses'));

test('the live pass is compared with the purchase being refunded before anything is taken', () => {
  // Revoking on uid alone was the blocking finding: refund, repurchase, and the sweep deletes the
  // pass the second purchase paid for.
  assert.match(body, /pass\.ref !== doc\.id/, 'must compare the granting purchase with this one');
  const revokeAt = body.indexOf('revokePass(');
  const compareAt = body.indexOf('pass.ref !== doc.id');
  assert.ok(compareAt > 0 && compareAt < revokeAt, 'the comparison has to come before the revoke');
});

test('a purchase superseded by a newer one is recorded, not revoked', () => {
  const branch = body.slice(body.indexOf('pass.ref !== doc.id'), body.indexOf('// Revoke first'));
  assert.match(branch, /status: 'refunded'/, 'the refund is still recorded');
  assert.ok(!/revokePass\(/.test(branch), 'but nothing is taken away');
  assert.match(branch, /supersededBy/, 'and it says which pass replaced it');
});

test('the revoke happens before the record is marked', () => {
  // The other order drops the document out of the query forever, so a failed revoke leaves a
  // refunded pass alive with nothing left to find it.
  const section = body.slice(body.indexOf('// Revoke first'));
  assert.ok(section.indexOf('revokePass(') < section.indexOf("status: 'refunded'"), 'revoke, then mark');
});

test('one bad document cannot end the sweep', () => {
  assert.match(body, /for \(const doc of snap\.docs\) \{\s*try \{/, 'each document is handled on its own');
  assert.match(body, /failed \+= 1/);
  assert.match(body, /if \(failed\) console\.error/, 'a failure has to be loud, not a line in a summary');
});

test('a throwable is never logged whole, because the Amazon secret rides in a URL', () => {
  assert.match(SRC, /const msg = \(err: unknown\): string =>/);
  assert.ok(!/console\.(warn|error|log)\([^)]*:\s*err\)/.test(SRC), 'no raw throwable reaches the log');
});

test('every store call is bounded', () => {
  // Play was the one without a timeout, so the sweep could hang on it until the function died.
  assert.match(SRC, /timeout: TIMEOUT_MS/, 'play');
  assert.ok((SRC.match(/AbortSignal\.timeout\(TIMEOUT_MS\)/g) || []).length >= 2, 'amazon and apple');
});

test('Play has to answer about the product we asked about', () => {
  assert.match(SRC, /data\.productId !== productId\) return 'unknown'/);
});

test('it is deployed inside the pw group, so a grouped deploy reaches it', () => {
  const idx = fs.readFileSync(path.join(__dirname, '..', 'src', 'pitwall', 'index.ts'), 'utf8');
  assert.match(idx, /export \{ sweepRefundedPasses \} from '\.\/refundSweep'/);
  const root = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.ts'), 'utf8');
  assert.ok(!/refundSweep/.test(root), 'not exported at the root as well, or it deploys twice');
});
