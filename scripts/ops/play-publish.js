/**
 * Publish an Undercut Android bundle to Google Play without the console (F-082).
 *
 * Every build before this was uploaded by hand. The Play Developer API does the whole thing — open
 * an edit, upload the bundle, assign it to a track with release notes, commit — so a release is one
 * command next to the gradle build that produced it.
 *
 * Auth is a service-account key. PLAY_SA_KEY is the one to set: a key that can publish to the store
 * should not also be the key that deploys the backend, and SA_KEY is the deploy key. SA_KEY is
 * accepted with a warning so this works today, before a dedicated account exists.
 *
 * The key must ALSO be granted access inside Play Console — Play keeps its own permission list, and
 * a Google Cloud key alone is not enough. Play Console -> Users and permissions -> Invite user ->
 * the service account's email -> grant it on the app. Without that every call is a 403 "caller does
 * not have permission", which is what this prints rather than a stack trace.
 *
 * Dry run by default; --apply commits the edit. Production needs --confirm=<package> on top.
 *
 *   node scripts/ops/play-publish.js status --track=production
 *   node scripts/ops/play-publish.js upload <file.aab> --track=internal --notes="..." --apply
 *   node scripts/ops/play-publish.js promote <versionCode> --track=production --confirm=com.undercut.app --apply
 *
 * `promote` is the one to reach for after `upload`: a version code can only be uploaded once, so
 * moving a build already on one track to another is an assignment, not a second upload.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { unknownFlag, valueOf, resolveTrack, productionGuard, validVersionCode, releaseFor } = require('./_play');

const PKG = 'com.undercut.app';
const API = 'androidpublisher.googleapis.com';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const ROOT = path.resolve(__dirname, '..', '..');

const argv = process.argv.slice(2);
const cmd = argv[0];
const APPLY = argv.includes('--apply');

const die = (msg) => { console.error(msg); process.exit(2); };

const typo = unknownFlag(argv);
if (typo) die(`"${typo}" is not a flag this script understands. Flags take an = sign: --track=internal, --notes="...", --confirm=${PKG}, --apply`);

const keyPath = process.env.PLAY_SA_KEY || process.env.SA_KEY;
if (!keyPath) die('PLAY_SA_KEY must point at the service-account key that publishes to Play.');
if (!process.env.PLAY_SA_KEY) console.warn('[play] using SA_KEY, which is the backend deploy key. A separate PLAY_SA_KEY keeps store publishing and backend deploys on different credentials.');
const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

/** The Google client the functions codebase already depends on, rather than a hand-rolled JWT. */
function googleAuth() {
  const { GoogleAuth } = require(require.resolve('google-auth-library', { paths: [path.join(ROOT, 'functions')] }));
  return new GoogleAuth({ credentials: sa, scopes: [SCOPE] });
}

function request({ pathname, method = 'GET', headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = https.request({ host: API, path: pathname, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        if (res.statusCode >= 400) {
          // The one failure worth explaining, because it is not a bug and not a bad key.
          if (res.statusCode === 403 && /permission/i.test(text)) {
            return reject(new Error(`Play refused the call (403). The key authenticates, but ${sa.client_email} has not been granted access in Play Console. Play Console -> Users and permissions -> Invite user -> that address -> grant it on ${PKG}, then wait a few minutes.\n${text.slice(0, 300)}`));
          }
          return reject(new Error(`${method} ${pathname} -> ${res.statusCode}\n${text.slice(0, 500)}`));
        }
        if (!text) return resolve({});
        try { resolve(JSON.parse(text)); } catch { reject(new Error(`${method} ${pathname} -> ${res.statusCode} but the body was not JSON:\n${text.slice(0, 300)}`)); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  const auth = googleAuth();
  const token = await auth.getAccessToken();
  const A = { Authorization: `Bearer ${token}` };
  const J = { ...A, 'Content-Type': 'application/json' };
  console.log(`authenticated as ${sa.client_email}`);

  const openEdit = () => request({ pathname: `/androidpublisher/v3/applications/${PKG}/edits`, method: 'POST', headers: J, body: '{}' });
  const discard = (id) => request({ pathname: `/androidpublisher/v3/applications/${PKG}/edits/${id}`, method: 'DELETE', headers: A });

  if (cmd === 'status') {
    const edit = await openEdit();
    try {
      const tracks = await request({ pathname: `/androidpublisher/v3/applications/${PKG}/edits/${edit.id}/tracks`, headers: A });
      for (const tr of tracks.tracks ?? []) {
        const rel = (tr.releases ?? []).map((r) => `${r.status} v[${(r.versionCodes ?? []).join(',')}]`).join(' | ');
        console.log(`  ${tr.track.padEnd(12)} ${rel || '(no releases)'}`);
      }
    } finally { await discard(edit.id).catch((e) => console.warn(`[play] could not discard edit ${edit.id}: ${e.message}`)); }
    return;
  }

  if (cmd !== 'upload' && cmd !== 'promote') {
    die('commands: status | upload <file.aab> --track=<t> | promote <versionCode> --track=<t>');
  }

  const { track, error } = resolveTrack(argv);
  if (error) die(error);
  const guard = productionGuard(track, argv, PKG);
  if (guard && APPLY) die(guard);
  const notes = valueOf(argv, 'notes') ?? '';

  // What is about to be published, named out loud before it is. The Track Limits vc28 incident was
  // the wrong JS inside the right shell, and nobody saw it until it was live.
  let versionCode = argv[1];
  let bytes = null;
  if (cmd === 'upload') {
    const file = argv[1];
    if (!file || !fs.existsSync(file)) die(`bundle not found: ${file}`);
    bytes = fs.readFileSync(file);
    const sha = crypto.createHash('sha256').update(bytes).digest('hex');
    console.log(`bundle   ${file}`);
    console.log(`size     ${(bytes.length / 1e6).toFixed(1)} MB`);
    console.log(`sha256   ${sha}`);
  } else if (!validVersionCode(versionCode)) {
    die('promote needs a version code, e.g. promote 63 --track=production');
  }
  console.log(`track    ${track}${track === 'production' ? '  (every Android user)' : ''}`);

  if (!APPLY) {
    // Nothing is sent. A dry run that pushed 77 MB to Google and then discarded it would be a
    // publish attempt wearing a different name, and the repo's other ops scripts touch nothing
    // until --apply either.
    console.log(`\nDRY RUN — nothing was sent to Play. Pass --apply to ${cmd === 'upload' ? 'upload and assign' : 'assign'} it.`);
    if (guard) console.log(guard);
    return;
  }

  const edit = await openEdit();
  console.log(`edit ${edit.id} opened`);
  let committed = false;
  try {
    if (cmd === 'upload') {
      const up = await request({ pathname: `/upload/androidpublisher/v3/applications/${PKG}/edits/${edit.id}/bundles?uploadType=media`, method: 'POST', headers: { ...A, 'Content-Type': 'application/octet-stream', 'Content-Length': bytes.length }, body: bytes });
      versionCode = String(up.versionCode);
      console.log(`uploaded versionCode ${versionCode}`);
    }
    await request({ pathname: `/androidpublisher/v3/applications/${PKG}/edits/${edit.id}/tracks/${track}`, method: 'PUT', headers: J, body: JSON.stringify({ track, releases: [releaseFor(versionCode, notes)] }) });
    console.log(`assigned versionCode ${versionCode} to ${track}`);
    const done = await request({ pathname: `/androidpublisher/v3/applications/${PKG}/edits/${edit.id}:commit`, method: 'POST', headers: A });
    committed = true;
    console.log(`committed edit ${done.id} — versionCode ${versionCode} is live on ${track}`);
  } finally {
    if (!committed) {
      await discard(edit.id)
        .then(() => console.log(`edit ${edit.id} discarded; nothing was published`))
        .catch((e) => console.warn(`[play] edit ${edit.id} is still open and was NOT discarded: ${e.message}\nIt publishes nothing on its own and expires, but delete it in the console if you want it gone now.`));
    }
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
