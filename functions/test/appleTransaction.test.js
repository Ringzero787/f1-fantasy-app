/**
 * The App Store signed-transaction check (F-060).
 *
 * The certificate chain and the signed transaction are generated here rather than committed. A
 * stored one is a token-shaped blob in the repository, which the secret scanner is right to object
 * to even though this one is worthless, and generating it proves the verifier accepts a properly
 * signed transaction rather than only proving it rejects rubbish.
 */
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync, readFileSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { X509Certificate, createPrivateKey, sign } = require('node:crypto');

const { verifyAppleTransaction, verifyAppleJws, APPLE_ROOT_CA_G3 } = require('../lib/purchases/appleTransaction.js');
const { appleNotificationAction } = require('../lib/pitwall/appleNotifications.js');

const b64u = (b) => Buffer.from(b).toString('base64url');
const BUNDLE = 'com.undercut.app';
const PRODUCT = 'pitwall.pass.season';

/** A throwaway root → intermediate → leaf chain, and one transaction signed by the leaf. */
function makeFixture({ markings = true } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'apple-jws-'));
  const ssl = (...args) => execFileSync('openssl', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  // Apple marks its own chain: the intermediate carries the developer-relations extension and the
  // leaf the App Store signing one. The verifier requires both, so the fixture must carry them.
  const OID_WWDR = '1.2.840.113635.100.6.2.1';
  const OID_APP_STORE_SIGNING = '1.2.840.113635.100.6.11.1';
  const exts = (ca, oid) => {
    const file = `${ca ? 'ca' : 'leaf'}.ext`;
    writeFileSync(path.join(dir, file), [
      `basicConstraints=critical,CA:${ca ? 'TRUE' : 'FALSE'}`,
      `keyUsage=critical,${ca ? 'keyCertSign,cRLSign' : 'digitalSignature'}`,
      ...(oid ? [`${oid}=DER:05:00`] : []),
    ].join('\n') + '\n');
    return file;
  };
  const key = (name) => ssl('ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', `${name}.key`);

  key('root');
  // A self-signed root takes its extensions inline; -extfile is only for `x509 -req`.
  ssl('req', '-x509', '-new', '-key', 'root.key', '-sha256', '-days', '3650', '-out', 'root.pem',
    '-subj', '/CN=Test Root',
    '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign');
  for (const [name, issuer, ca, oid] of [['int', 'root', true, markings ? OID_WWDR : null], ['leaf', 'int', false, markings ? OID_APP_STORE_SIGNING : null]]) {
    key(name);
    ssl('req', '-new', '-key', `${name}.key`, '-out', `${name}.csr`, '-subj', `/CN=Test ${name}`);
    ssl('x509', '-req', '-in', `${name}.csr`, '-CA', `${issuer}.pem`, '-CAkey', `${issuer}.key`,
      '-CAcreateserial', '-out', `${name}.pem`, '-days', '3650', '-sha256', '-extfile', exts(ca, oid));
  }

  const der = (f) => new X509Certificate(readFileSync(path.join(dir, f))).raw.toString('base64');
  const payload = {
    bundleId: BUNDLE, productId: PRODUCT, transactionId: '2000000123',
    originalTransactionId: '2000000123', purchaseDate: Date.now(),
    environment: 'Sandbox', type: 'Non-Renewing Subscription',
  };
  const h = b64u(JSON.stringify({ alg: 'ES256', x5c: [der('leaf.pem'), der('int.pem'), der('root.pem')] }));
  const leafKey = createPrivateKey(readFileSync(path.join(dir, 'leaf.key')));
  /** Sign any payload with this chain: a transaction, or a server notification (F-175 slice 5). */
  const signJws = (body) => {
    const p = b64u(JSON.stringify(body));
    return `${h}.${p}.${sign('sha256', Buffer.from(`${h}.${p}`), { key: leafKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
  };
  const testRootCa = readFileSync(path.join(dir, 'root.pem'), 'utf8').trim();
  rmSync(dir, { recursive: true, force: true });
  return { jws: signJws(payload), payload, testRootCa, signJws };
}

// openssl is the only way to mint an X.509 chain from Node. It is on the build box and on the CI
// runner; only its absence skips these tests. A generator that breaks for any other reason fails
// loudly, because a silent skip here would quietly drop the only test of the accepting path.
let fixture = null;
let unavailable = '';
try {
  execFileSync('openssl', ['version'], { stdio: ['ignore', 'pipe', 'pipe'] });
} catch (err) {
  unavailable = err instanceof Error ? err.message : String(err);
}
if (!unavailable) fixture = makeFixture();

const OPTS = () => ({ expectedBundleId: BUNDLE, expectedProductId: PRODUCT, rootCa: fixture.testRootCa });
let unmarked = null;
if (fixture) unmarked = makeFixture({ markings: false });
const PLAIN = { expectedBundleId: BUNDLE, expectedProductId: PRODUCT };
const chainTest = (name, fn) => test(name, { skip: fixture ? false : `openssl unavailable: ${unavailable}` }, fn);

chainTest('accepts a transaction signed by a chain that ends at the pinned root', () => {
  const result = verifyAppleTransaction(fixture.jws, OPTS());
  assert.equal(result.valid, true, result.error);
  assert.equal(result.transaction.transactionId, fixture.payload.transactionId);
  assert.equal(result.transaction.productId, PRODUCT);
  assert.equal(result.transaction.environment, 'Sandbox');
});

chainTest('refuses a chain Apple never marked as App Store signing', () => {
  // Properly signed, chains to the same root, and is not a transaction-signing certificate. Without
  // this check anything Apple has ever signed would be accepted.
  const result = verifyAppleTransaction(unmarked.jws, { expectedBundleId: BUNDLE, expectedProductId: PRODUCT, rootCa: unmarked.testRootCa });
  assert.equal(result.valid, false);
  assert.match(result.error, /App Store signing|developer relations/);
});

chainTest('refuses a chain that does not end at the pinned root', () => {
  // The same transaction against Apple's real root: well formed, properly signed, and not Apple's.
  // This is the forgery the pin exists to stop.
  const result = verifyAppleTransaction(fixture.jws, { ...OPTS(), rootCa: APPLE_ROOT_CA_G3 });
  assert.equal(result.valid, false);
  assert.match(result.error, /Apple root/);
});

chainTest('refuses a tampered payload or a swapped header', () => {
  const [h, p, s] = fixture.jws.split('.');
  const swapped = b64u(JSON.stringify({ ...fixture.payload, productId: 'league.slot' }));
  assert.match(verifyAppleTransaction(`${h}.${swapped}.${s}`, OPTS()).error, /signature/);
  assert.equal(verifyAppleTransaction(`${p}.${p}.${s}`, OPTS()).valid, false);
});

chainTest('refuses a transaction for another app or another product', () => {
  assert.match(verifyAppleTransaction(fixture.jws, { ...OPTS(), expectedBundleId: 'com.someone.else' }).error, /transaction is for/);
  assert.match(verifyAppleTransaction(fixture.jws, { ...OPTS(), expectedProductId: 'avatar.pack' }).error, /transaction is for/);
});

chainTest('refuses a chain outside its validity period', () => {
  assert.match(verifyAppleTransaction(fixture.jws, { ...OPTS(), now: new Date('2000-01-01T00:00:00Z') }).error, /validity/);
});

test('refuses anything but ES256, including a stripped signature', () => {
  const body = b64u(JSON.stringify({ productId: PRODUCT }));
  const none = b64u(JSON.stringify({ alg: 'none', x5c: [] }));
  const hs = b64u(JSON.stringify({ alg: 'HS256', x5c: ['x'] }));
  assert.match(verifyAppleTransaction(`${none}.${body}.sig`, PLAIN).error, /algorithm/);
  assert.match(verifyAppleTransaction(`${hs}.${body}.sig`, PLAIN).error, /algorithm/);
});

test('refuses a header with no certificate chain', () => {
  const body = b64u(JSON.stringify({ productId: PRODUCT }));
  const noChain = b64u(JSON.stringify({ alg: 'ES256' }));
  const shortChain = b64u(JSON.stringify({ alg: 'ES256', x5c: ['only-one'] }));
  assert.match(verifyAppleTransaction(`${noChain}.${body}.sig`, PLAIN).error, /certificate chain/);
  assert.match(verifyAppleTransaction(`${shortChain}.${body}.sig`, PLAIN).error, /certificate chain/);
  // The endpoint is public: a long attacker chain is refused before any certificate is parsed.
  const longChain = b64u(JSON.stringify({ alg: 'ES256', x5c: ['a', 'b', 'c', 'd', 'e'] }));
  assert.match(verifyAppleTransaction(`${longChain}.${body}.sig`, PLAIN).error, /certificate chain/);
});

test('refuses malformed input rather than throwing', () => {
  for (const bad of ['', 'not-a-jws', 'a.b', 'a.b.c.d', 'a.b.c']) {
    const result = verifyAppleTransaction(bad, PLAIN);
    assert.equal(result.valid, false);
    assert.ok(result.error.length > 0);
  }
  assert.equal(verifyAppleTransaction(undefined, PLAIN).valid, false);
});

test('the pinned certificate really is Apple Root CA - G3', () => {
  const root = new X509Certificate(APPLE_ROOT_CA_G3);
  assert.match(root.subject, /Apple Root CA - G3/);
  assert.equal(
    root.fingerprint256,
    '63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79',
  );
});

// ---- F-175 slice 5: App Store Server Notifications v2 (the StoreKit 2 refund signal) ----

const notification = (type, tx = {}, extra = {}) => fixture.signJws({
  notificationType: type, notificationUUID: 'uuid-1', version: '2.0', signedDate: Date.now(),
  data: { bundleId: BUNDLE, environment: 'Sandbox', signedTransactionInfo: fixture.signJws({ ...fixture.payload, revocationDate: Date.now(), revocationReason: 0, ...tx }) },
  ...extra,
});
const NOPTS = () => ({ bundleId: BUNDLE, rootCa: fixture.testRootCa });

chainTest('verifyAppleJws returns any payload the App Store chain signed, and a revoked transaction is still readable', () => {
  const r = verifyAppleJws(fixture.signJws({ hello: 1, revocationDate: 5 }), { rootCa: fixture.testRootCa });
  assert.equal(r.valid, true, r.error);
  assert.deepEqual(r.payload, { hello: 1, revocationDate: 5 });
  // But a purchase is still refused once it carries a revocation.
  assert.match(verifyAppleTransaction(fixture.signJws({ ...fixture.payload, revocationDate: 5 }), OPTS()).error, /refunded or revoked/);
});

chainTest('notification: REFUND and REVOKE name the refunded transaction', () => {
  for (const type of ['REFUND', 'REVOKE']) {
    assert.deepEqual(appleNotificationAction(notification(type), NOPTS()), {
      kind: 'refund', transactionId: '2000000123', productId: PRODUCT, environment: 'Sandbox', type, uuid: 'uuid-1',
    });
  }
  const charter = appleNotificationAction(notification('REFUND', { productId: 'pitwall.charter.season', transactionId: '77' }), NOPTS());
  assert.equal(charter.productId, 'pitwall.charter.season');
  assert.equal(charter.transactionId, '77');
});

chainTest('notification: everything else is ignored, and a reversed refund asks for a person', () => {
  for (const type of ['TEST', 'CONSUMPTION_REQUEST', 'REFUND_DECLINED', 'ONE_TIME_CHARGE', '']) {
    const a = appleNotificationAction(notification(type), NOPTS());
    assert.equal(a.kind, 'ignore', type);
    assert.ok(!a.loud, type);
  }
  const reversed = appleNotificationAction(notification('REFUND_REVERSED'), NOPTS());
  assert.equal(reversed.kind, 'ignore');
  assert.equal(reversed.loud, true);
});

chainTest('notification: refused unless Apple signed it for this app, outside and inside', () => {
  assert.equal(appleNotificationAction(undefined, NOPTS()).kind, 'reject');
  assert.equal(appleNotificationAction('a.b.c', NOPTS()).kind, 'reject');
  // Signed by a chain that is not Apple's.
  assert.match(appleNotificationAction(notification('REFUND'), { bundleId: BUNDLE, rootCa: APPLE_ROOT_CA_G3 }).why, /Apple root/);
  // Another app's notification, or another app's transaction inside ours.
  assert.match(appleNotificationAction(notification('REFUND', {}, { data: { bundleId: 'com.other', signedTransactionInfo: '' } }), NOPTS()).why, /com\.other/);
  assert.match(appleNotificationAction(notification('REFUND', { bundleId: 'com.other' }), NOPTS()).why, /transaction is for com\.other/);
  // A forged inner transaction (signed by nobody) inside a genuine notification.
  const forged = fixture.signJws({ notificationType: 'REFUND', data: { bundleId: BUNDLE, signedTransactionInfo: 'x.y.z' } });
  assert.equal(appleNotificationAction(forged, NOPTS()).kind, 'reject');
});

chainTest('notification: a refund without a transaction id is not acted on, and says so', () => {
  const a = appleNotificationAction(notification('REFUND', { transactionId: undefined }), NOPTS());
  assert.equal(a.kind, 'ignore');
  assert.equal(a.loud, true);
});
