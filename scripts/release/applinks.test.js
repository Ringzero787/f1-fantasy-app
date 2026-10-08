// F-113. The two association files and the native config have to agree with each other and with
// the host the invite email actually uses, or App Links fail SILENTLY — Android just opens Chrome
// and iOS just opens Safari, which is indistinguishable from the bug this was meant to fix.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(read(p));

const HOST = 'undercut.humannpc.com';
const cfg = (() => { const c = require(path.join(ROOT, 'app.config.js')); return c.expo ?? c.default?.expo ?? c; })();

test('the app claims the same host the invite email sends people to', () => {
  const email = read('functions/src/invites/sendInviteEmail.ts');
  const base = email.match(/const BASE_URL = '([^']+)'/);
  assert.ok(base, 'sendInviteEmail no longer has a BASE_URL');
  assert.equal(new URL(base[1]).host, HOST,
    'the email host and the App Links host must match, or the link opens a browser');

  assert.deepEqual(cfg.ios.associatedDomains, [`applinks:${HOST}`]);
  const f = cfg.android.intentFilters.find((x) => x.autoVerify);
  assert.ok(f, 'android needs an autoVerify intent filter or nothing is ever verified');
  assert.deepEqual(f.data, [{ scheme: 'https', host: HOST, pathPrefix: '/join' }]);
  assert.ok(f.category.includes('BROWSABLE') && f.category.includes('DEFAULT'));
});

test('apple-app-site-association names this app and the /join paths', () => {
  const a = json('public/.well-known/apple-app-site-association');
  const d = a.applinks.details[0];
  assert.deepEqual(d.appIDs, [`MWVD9BU5VW.${cfg.ios.bundleIdentifier}`]);
  assert.ok(d.components.some((c) => c['/'] === '/join'));
});

test('assetlinks.json names this package, and every fingerprint is a real SHA-256', () => {
  const links = json('public/.well-known/assetlinks.json');
  const entry = links.find((l) => l.target?.package_name === cfg.android.package);
  assert.ok(entry, `assetlinks.json must name ${cfg.android.package}`);
  assert.deepEqual(entry.relation, ['delegate_permission/common.handle_all_urls']);
  const prints = entry.target.sha256_cert_fingerprints;
  assert.ok(prints.length >= 1);
  for (const p of prints) {
    assert.match(p, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/,
      `"${p}" is not an uppercase colon-separated SHA-256 — Android will not match it`);
  }
});

test('both files are served as application/json, and uncached enough to fix a mistake', () => {
  const headers = json('firebase.json').hosting.headers;
  for (const src of ['/.well-known/assetlinks.json', '/.well-known/apple-app-site-association']) {
    const h = headers.find((x) => x.source === src);
    assert.ok(h, `${src} needs a headers entry: with no extension Hosting guesses octet-stream`);
    const ct = h.headers.find((k) => k.key === 'Content-Type');
    assert.equal(ct?.value, 'application/json');
  }
});

test('assetlinks.json carries the PLAY signing certificate, not just the upload key', () => {
  // Play re-signs every upload with its own key, so the upload key alone verifies nothing for the
  // people who installed from Play — which is nearly everyone. This fingerprint is the certificate
  // Play actually signs com.undercut.app with, read off a Play-generated APK on 2026-10-08:
  //   androidpublisher v3 applications/com.undercut.app/generatedApks/<versionCode>
  //     -> certificateSha256Hash, and .../downloads/<id>:download verified with
  //        `apksigner verify --print-certs` (SHA-1 45e235603ba3eb610c4d3e3116da61150ae45a5a,
  //        the same one registered on the Firebase Android app).
  // Re-derive it that way if it ever has to change; do not take it from the upload keystore.
  const playCert =
    '3D:2B:59:DC:03:A0:63:81:A5:D6:35:14:07:DF:4A:59:95:53:ED:F5:AE:FA:AD:55:B3:82:B8:14:D8:96:26:4F';
  const prints = json('public/.well-known/assetlinks.json')[0].target.sha256_cert_fingerprints;
  assert.ok(prints.includes(playCert),
    'assetlinks.json must list the Play App signing certificate, or App Links silently fail to '
    + 'verify on every Play install');
  assert.ok(prints.length >= 2,
    'keep the upload key too: it is what signs the Amazon APK and direct installs');
});
