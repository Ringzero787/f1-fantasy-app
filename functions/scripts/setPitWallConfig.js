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
// Nothing happens on import. The key read, initializeApp and firestore()
// used to sit at module scope with a self-invoking entry below them, so
// requiring this file connected to production and ran the script. It is
// invoked by `aidlc op` through scripts/ops/run-script.js, which spawns the
// file directly, so require.main still holds there.
let db;

function initAdmin() {
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
  db = admin.firestore();
}

const APPLY = process.argv.includes('--apply');
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const { MODES, DESIRED, resolveMode, invalidPlatform, carryContainment, invalidEnabled, unknownFlag, modeChanges } = require('./lib/pitwallMode');
const MIN_APP_VERSION = '2.4.0';
const PORTAL_URL = 'https://pitwall.humannpc.com';

// The modes themselves, and why each platform is where it is, live in ./lib/pitwallMode so they can
// be tested without a credential. Flags still win: --mode=X sets all three, --ios=X beats it.
const FLAGS_IN = process.argv.slice(2);

// Argument validation lives in a function, called from the guard. At module
// scope it rejected any argv the script did not recognise — including a
// positional belonging to some other program — and exited 2 on import,
// killing a process that never asked to run this. The same defect as the
// credential read, just louder: a tree walker passing a directory was taken
// down mid-walk.
function checkArgs() {
  const typo = unknownFlag(FLAGS_IN);
  if (typo) {
    console.error(`"${typo}" is not a flag this script understands. Nothing was written.`);
    console.error('Flags take an = sign: --mode=off, --ios=open, --beta=uid1,uid2, --enabled=false, --apply');
    process.exit(2);
  }

  const notBool = invalidEnabled(FLAGS_IN);
  if (notBool !== null) {
    console.error(`--enabled must be true or false (got "${notBool}")`);
    process.exit(2);
  }
}



const given = (name) => FLAGS_IN.some((a) => a.startsWith(`--${name}=`));

/**
 * The block to write, given what is live now.
 *
 * `enabled` and `beta` are containment controls: one hides Pit Wall everywhere, the other limits it
 * to named accounts. Someone reaches for them when something is wrong, and the usual run of this
 * script passes no flags at all, so they are carried over from the live document unless a flag says
 * otherwise. Rebuilding them from defaults would have quietly re-opened the surface and cleared the
 * allowlist every time anyone changed a mode.
 */
const blockFor = (current = {}) => {
  const held = carryContainment(current, FLAGS_IN);
  const mode = resolveMode(FLAGS_IN, DESIRED, current);
  const bad = invalidPlatform(mode);
  if (bad) {
    console.error(`mode for ${bad} must be one of ${MODES.join(', ')} (got "${mode[bad]}")`);
    process.exit(2);
  }
  return {
    enabled: held.enabled,
    url: PORTAL_URL,
    minAppVersion: arg('minAppVersion', MIN_APP_VERSION),
    mode,
    beta: held.beta,
    profileRow: { label: 'PIT WALL', free: 'Open', pass: 'Pass' },
    surfaces: { profile: true },
  };
};

async function main() {
  const ref = db.doc('config/app');
  const snap = await ref.get();
  const current = snap.exists ? snap.data().pitwall : undefined;
  const block = blockFor(current ?? {});

  console.log(`config/app ${snap.exists ? 'exists' : 'does not exist yet'}`);
  console.log('current pitwall block:', current ? JSON.stringify(current, null, 2) : '(none)');
  console.log('would write:', JSON.stringify(block, null, 2));
  for (const c of modeChanges(current, block.mode)) {
    // The modes are asserted from DESIRED, not carried, so an out-of-band kill like --ios=off is
    // reverted by the next flagless run. That is intended, but it must never be silent.
    console.log(`CHANGE: ${c.platform} ${c.from} -> ${c.to}`);
  }
  if (!given('enabled') && current?.enabled === false) console.log('NOTE: carrying over enabled:false from the live document.');
  if (!given('beta') && !given('betaLeagues') && (current?.beta?.uids?.length || current?.beta?.leagueIds?.length)) {
    console.log('NOTE: carrying over the live beta allowlist. Pass --beta= to clear it.');
  }

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

if (require.main === module) {
  checkArgs();
  initAdmin();
  main().catch((err) => {
  console.error(err);
  process.exit(1);
  });
}
