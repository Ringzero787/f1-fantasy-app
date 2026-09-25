/**
 * Grant, revoke or inspect a Pit Wall Pass (F-068). For the beta, and for support.
 *
 *   node scripts/pitwallPass.js list
 *   node scripts/pitwallPass.js grant  --email=someone@example.com [--season=2026]
 *   node scripts/pitwallPass.js revoke --email=someone@example.com [--reason=support]
 *
 * Dry run by default; --apply writes. Grants are recorded with source 'grant', so they are
 * distinguishable from paid passes in support and in any revenue count.
 */
const path = require('path');
const admin = require('firebase-admin');

const EXPECTED_PROJECT = 'f1-app-18077';
const KEY = process.env.SA_KEY;
if (!KEY) { console.error('SA_KEY must point at the service-account key (aidlc op loads it from ~/.config/aidlc/env).'); process.exit(2); }
const cred = require(KEY);
if (cred.project_id !== EXPECTED_PROJECT) { console.error(`Refusing to run: key is for project ${cred.project_id}, expected ${EXPECTED_PROJECT}.`); process.exit(2); }
admin.initializeApp({ credential: admin.credential.cert(cred), projectId: EXPECTED_PROJECT });
const db = admin.firestore();
const store = require(path.join(__dirname, '..', 'lib', 'pitwall', 'passStore.js'));
const { currentSeason, passActive } = require(path.join(__dirname, '..', 'lib', 'pitwall', 'pass.js'));

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
// The `uc-script` op kind passes only the file name and --apply, so the action and its options
// may also arrive as PW_ACTION / PW_EMAIL / PW_SEASON / PW_REASON; the op log records the masked
// email either way.
const action = args.find((x) => !x.startsWith('--')) ?? process.env.PW_ACTION;
const opt = (name) => { const a = args.find((x) => x.startsWith(`--${name}=`)); return a ? a.split('=').slice(1).join('=') : process.env[`PW_${name.toUpperCase()}`]; };
const mask = (e) => (typeof e === 'string' ? e.replace(/^(.).*(@.*)$/, '$1***$2') : '(no email)');

(async () => {
  const season = opt('season') || currentSeason(Date.now());
  if (action === 'list') {
    const snap = await db.collection('users').orderBy('pass.grantedAt', 'desc').limit(100).get().catch(() => null);
    const docs = snap ? snap.docs.filter((d) => d.data().pass) : (await db.collection('users').get()).docs.filter((d) => d.data().pass);
    console.log(`${docs.length} pass(es):`);
    for (const d of docs) {
      const p = d.data().pass;
      console.log(`  ${d.id}  ${String(p.source).padEnd(6)} season ${p.season}  until ${new Date(p.expiresAt).toISOString().slice(0, 10)}  ${passActive(p, Date.now()) ? 'active' : 'EXPIRED'}`);
    }
    process.exit(0);
  }

  const email = opt('email');
  if (!email) { console.error('--email=<address> is required'); process.exit(2); }
  const user = await admin.auth().getUserByEmail(email).catch(() => null);
  if (!user) { console.error(`No account for ${mask(email)}.`); process.exit(2); }
  const before = (await db.doc(`users/${user.uid}`).get()).data()?.pass;
  const leagues = await db.collection('leagues').where('ownerId', '==', user.uid).get();
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} · ${action} · ${mask(email)} (${user.uid})`);
  console.log(`  current pass: ${before ? `${before.source} until ${new Date(before.expiresAt).toISOString().slice(0, 10)}` : 'none'}`);
  console.log(`  leagues owned: ${leagues.size}${leagues.size ? ` (${leagues.docs.map((l) => l.data().name || l.id).join(', ')})` : ''}`);

  if (action === 'grant') {
    console.log(`  would grant: season ${season}, source grant`);
    if (APPLY) {
      const pass = await store.grantPass(db, user.uid, season, 'grant', `admin_${season}_${user.uid}`);
      console.log(`  granted until ${new Date(pass.expiresAt).toISOString()}; ${leagues.size} league(s) marked Pro`);
    }
  } else if (action === 'revoke') {
    console.log(`  would revoke (reason: ${opt('reason') || 'admin'})`);
    if (APPLY) {
      await store.revokePass(db, user.uid, opt('reason') || 'admin');
      console.log('  revoked; leagues un-Pro-ed');
    }
  } else {
    console.error(`unknown action "${action}" (list, grant, revoke)`); process.exit(2);
  }
  console.log(APPLY ? '\nThe auth claim follows within a second, via the onUserPassWritten trigger.' : '\nNothing was written.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
