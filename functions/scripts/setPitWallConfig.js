/**
 * Write the `pitwall` block into `config/app` — the server-side switch that decides whether the
 * app shows Pit Wall at all (F-077, ARCHITECTURE section 8).
 *
 * The app renders nothing unless this block says so, so placement, copy and the per-platform mode
 * can change, be limited to a beta group, or be switched off without a store build.
 *
 *   mode: open  the row opens the portal. No price and no purchase wording anywhere in the app.
 *   mode: iap   the row sells the pass through that store. Only once the product is live there.
 *   mode: off   the surface is hidden on that platform.
 *
 * `minAppVersion` hides the row on builds that do not carry the code, so it is safe to write this
 * before 2.4.0 has shipped: no released build reads it.
 *
 * Usage:
 *   node scripts/setPitWallConfig.js                          # dry run against the live document
 *   node scripts/setPitWallConfig.js --apply                  # write it
 *   node scripts/setPitWallConfig.js --mode=off --apply       # switch every platform off
 *   node scripts/setPitWallConfig.js --ios=iap --android=iap --apply
 *   node scripts/setPitWallConfig.js --beta=uid1,uid2 --apply # limit it to those accounts
 */

const admin = require('firebase-admin');

const EXPECTED_PROJECT = 'f1-app-18077';
const KEY = process.env.SA_KEY;
if (!KEY) {
  console.error('SA_KEY must point at the service-account key (set by aidlc op from ~/.config/aidlc/env).');
  process.exit(2);
}
const cred = require(KEY);
if (cred.project_id !== EXPECTED_PROJECT) {
  console.error(`Refusing to run: key is for project ${cred.project_id}, expected ${EXPECTED_PROJECT}.`);
  process.exit(2);
}
admin.initializeApp({ credential: admin.credential.cert(cred), projectId: EXPECTED_PROJECT });
const db = admin.firestore();

const APPLY = process.argv.includes('--apply');
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const MODES = ['open', 'iap', 'off'];
const MIN_APP_VERSION = '2.4.0';
const PORTAL_URL = 'https://pitwall.humannpc.com';

const defaultMode = arg('mode', 'open');
const mode = {
  android: arg('android', defaultMode),
  ios: arg('ios', defaultMode),
  amazon: arg('amazon', defaultMode),
};
for (const [platform, value] of Object.entries(mode)) {
  if (!MODES.includes(value)) {
    console.error(`mode for ${platform} must be one of ${MODES.join(', ')} (got "${value}")`);
    process.exit(2);
  }
}

const list = (value) => (value ? value.split(',').map((s) => s.trim()).filter(Boolean) : []);
const block = {
  enabled: arg('enabled', 'true') === 'true',
  url: PORTAL_URL,
  minAppVersion: arg('minAppVersion', MIN_APP_VERSION),
  mode,
  beta: { uids: list(arg('beta', '')), leagueIds: list(arg('betaLeagues', '')) },
  profileRow: { label: 'PIT WALL', free: 'Open', pass: 'Pass' },
  surfaces: { profile: true },
};

async function main() {
  const ref = db.doc('config/app');
  const snap = await ref.get();
  const current = snap.exists ? snap.data().pitwall : undefined;

  console.log(`config/app ${snap.exists ? 'exists' : 'does not exist yet'}`);
  console.log('current pitwall block:', current ? JSON.stringify(current, null, 2) : '(none)');
  console.log('would write:', JSON.stringify(block, null, 2));

  if (block.mode.ios === 'iap' || block.mode.android === 'iap' || block.mode.amazon === 'iap') {
    console.log('\nNOTE: a platform is set to iap. The pitwall.pass.season product must already be');
    console.log('live in that store, or the row offers a purchase the store will refuse.');
  }
  if (!APPLY) {
    console.log('\nDRY RUN — pass --apply to write');
    return;
  }
  // merge: config/app also carries the app-version gate, which must survive untouched.
  await ref.set({ pitwall: block }, { merge: true });
  console.log('\nwritten');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
