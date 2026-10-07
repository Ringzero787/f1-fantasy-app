// Write the Moonshot block of config/app (F-110): the owner's switches, one op, no build.
//
// DESIRED below is the owner's decision of 2026-10-07: on, priced continuously (fair less the vig,
// rounded, floored, capped), DNS and DNF both lose ("all drivers race; DNS and DNF mean no
// points"), the call follows the car when a substitute drives (settlement code, F-110), live
// timing off until the data arrangement covers in-app positions (ADR-001). Everything else keeps
// the F-106 defaults (functions/src/moonshot/config.ts). Dry run prints the block that would be
// written beside what is live; `--apply` writes it with merge, so keys this script does not name
// are left as they are.
//
// Usage (normally through the uc-script op kind, which sets SA_KEY and passes --apply):
//   node scripts/setMoonshotConfig.js                       # dry run: show live vs desired
//   node scripts/setMoonshotConfig.js --apply               # write DESIRED
//   node scripts/setMoonshotConfig.js --enabled=false --apply   # switch it off, keep the rest
//   node scripts/setMoonshotConfig.js --mode=banded --apply     # change the pricing mode
//   node scripts/setMoonshotConfig.js --liveTiming=true --apply # let the app poll live positions
//
// The uc-script op kind passes only --apply, so through `aidlc op` the flags are not reachable:
// to change a switch in production, edit DESIRED here, commit, and raise a new uc-script op.
const admin = require('firebase-admin');

const EXPECTED_PROJECT = 'f1-app-18077';

// Nothing happens on import: the key read and initializeApp sit in initAdmin, which only the
// require.main guard at the foot calls (scripts/seedGuards.test.js holds every op script to this).
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

/** The owner's switches. Keys absent here keep the server defaults or whatever is live. */
const DESIRED = {
  enabled: true,
  unlockRound: 13,
  pricing: { mode: 'continuous' },
  dnsRule: 'LOSS',
  dnfRule: 'LOSS',
  dsqRule: 'LOSS',
  cancelledRule: 'VOID',
  liveTiming: false,
};

const KNOWN_FLAGS = ['enabled', 'mode', 'liveTiming', 'unlockRound'];
const BOOL = (v, name) => { if (v === 'true') return true; if (v === 'false') return false; console.error(`--${name} must be true or false (got "${v}")`); process.exit(2); };

/** Flags adjust DESIRED; validated here, from the guard, never on import. */
function blockFor(argv) {
  const block = JSON.parse(JSON.stringify(DESIRED));
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m && m[1] === 'apply') { console.error('--apply takes no value. Nothing was written.'); process.exit(2); }
    if (!m || !KNOWN_FLAGS.includes(m[1])) { console.error(`"${a}" is not a flag this script understands. Nothing was written.`); process.exit(2); }
    const [, k, v] = m;
    if (k === 'enabled') block.enabled = BOOL(v, k);
    if (k === 'liveTiming') block.liveTiming = BOOL(v, k);
    if (k === 'mode') { if (v !== 'banded' && v !== 'continuous') { console.error('--mode must be banded or continuous'); process.exit(2); } block.pricing.mode = v; }
    if (k === 'unlockRound') { const n = Number(v); if (!Number.isInteger(n) || n < 1) { console.error('--unlockRound must be a whole number'); process.exit(2); } block.unlockRound = n; }
  }
  return block;
}

async function main(block, apply) {
  const ref = db.doc('config/app');
  const snap = await ref.get();
  const live = (snap.exists && snap.data().moonshot) || {};
  console.log('== live config/app.moonshot:'); console.log(JSON.stringify(live, null, 2));
  console.log('== desired (merged over live):'); console.log(JSON.stringify(block, null, 2));
  if (!apply) { console.log('== dry run: nothing written (add --apply)'); return; }
  // merge at the field level so pricing.bands, stake levels and copy set elsewhere survive
  await ref.set({ moonshot: { ...live, ...block, pricing: { ...(live.pricing || {}), ...block.pricing } } }, { merge: true });
  console.log(`== wrote config/app.moonshot (enabled=${block.enabled}, pricing.mode=${block.pricing.mode}, dns=${block.dnsRule}, dnf=${block.dnfRule}, liveTiming=${block.liveTiming})`);
}

if (require.main === module) {
  // flags are checked before anything connects: a typo refuses without reaching production
  const argv = process.argv.slice(2);
  const block = blockFor(argv.filter((a) => a !== '--apply'));
  initAdmin();
  main(block, argv.includes('--apply')).then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
}
