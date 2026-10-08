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
  // Exact paths. A pathPrefix would also claim /join-pro and anything else starting with
  // those five characters; the app understands only these two.
  assert.deepEqual(f.data, [
    { scheme: 'https', host: HOST, path: '/join' },
    { scheme: 'https', host: HOST, path: '/join.html' },
  ]);
  for (const d of f.data) assert.equal(d.pathPrefix, undefined,
    'pathPrefix claims URL space that does not exist yet — use path');
  assert.ok(f.category.includes('BROWSABLE') && f.category.includes('DEFAULT'));
});

test('apple-app-site-association names this app and the /join paths', () => {
  const a = json('public/.well-known/apple-app-site-association');
  const d = a.applinks.details[0];
  // The team id is read from the archive script rather than written twice: that script is what
  // actually signs the build, so a mismatch there is the failure this test exists to catch.
  const team = read('scripts/release/mac/uc-ios-archive.sh').match(/UC_APPLE_TEAM:-([A-Z0-9]+)/);
  assert.ok(team, 'uc-ios-archive.sh no longer carries a default UC_APPLE_TEAM');
  assert.deepEqual(d.appIDs, [`${team[1]}.${cfg.ios.bundleIdentifier}`]);
  const paths = d.components.map((c) => c['/']);
  assert.deepEqual(paths, ['/join', '/join.html'],
    'the Apple components must match the Android paths, or one platform opens a browser');
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
  const prints = json('public/.well-known/assetlinks.json')
    .find((l) => l.target.package_name === cfg.android.package).target.sha256_cert_fingerprints;
  assert.ok(prints.includes(playCert),
    'assetlinks.json must list the Play App signing certificate, or App Links silently fail to '
    + 'verify on every Play install');
  assert.ok(prints.length >= 2,
    'keep the upload key too: it is what signs the Amazon APK and direct installs');
});

test('Track Limits keeps its delegation on this shared Hosting site', () => {
  // f1-app-18077 serves BOTH apps. With no static file at this path, Hosting auto-generates one
  // from the SHA certificates registered on the project's Android apps — and on 2026-10-08 that
  // generated file delegated to com.tracklimits.app and nothing else. A static file shadows it, so
  // shipping only Undercut's entry would silently strip Track Limits' App Links from
  // f1-app-18077.web.app and f1-app-18077.firebaseapp.com, which is the shared Firebase authDomain.
  // Track Limits lives in /data/tracklimits now, so nothing there can fail if this is dropped.
  // The real fix is a Hosting site of its own for undercut.humannpc.com; until that domain exists
  // this file must carry both apps.
  const links = json('public/.well-known/assetlinks.json');
  const tl = links.find((l) => l.target.package_name === 'com.tracklimits.app');
  assert.ok(tl, 'do not remove the com.tracklimits.app delegation: this Hosting site serves both apps');
  assert.deepEqual(tl.target.sha256_cert_fingerprints, [
    '1A:13:65:71:1B:FF:CA:96:02:DE:BD:FE:F6:8D:44:EF:46:39:3D:D6:0A:0E:AA:F0:22:03:31:DD:BA:22:49:9C',
    '6A:ED:64:8F:75:65:9A:D7:3E:E4:73:81:6B:DB:8C:69:ED:78:C6:5F:B9:D6:88:0D:0E:C7:0C:81:7D:62:E9:66',
  ], 'these came from the auto-generated file; if Track Limits re-keys, update them here too');
  for (const l of links) {
    for (const p of l.target.sha256_cert_fingerprints) {
      assert.match(p, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    }
  }
});

test('Hosting really does upload the two dotted-path files', () => {
  // The rewrite comment two entries up in firebase.json says the `ignore` list "drops every dotted
  // path", which is why F-091's file is published under a plain name. That is not true of the
  // current CLI, and believing it would mean "fixing" this feature with a rewrite it does not need.
  // This is the same call firebase-tools' listFiles makes (lib/listFiles.js), so it answers the
  // question for the deploy rather than by reasoning about globs.
  const { sync } = require('glob');
  const hosting = json('firebase.json').hosting;
  const files = sync('**/*', {
    cwd: path.join(ROOT, hosting.public),
    dot: true,
    follow: true,
    nodir: true,
    posix: true,
    ignore: ['**/firebase-debug.log', '**/firebase-debug.*.log', '.firebase/*'].concat(hosting.ignore ?? []),
  });
  for (const f of ['.well-known/assetlinks.json', '.well-known/apple-app-site-association']) {
    assert.ok(files.includes(f),
      `hosting would not upload ${f} — App Links cannot verify against a file that is not served`);
  }
});
