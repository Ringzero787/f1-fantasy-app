// Write the Track Limits remote app config (tl_config/app) — the tl-script aidlc op.
//
// Usage (from newgame/functions):
//   node scripts/setAppConfig.js            dry run — prints current → desired
//   node scripts/setAppConfig.js --write    apply
//
// The tl-script op passes no parameters through to the script, so the config we
// want lives in DESIRED below: edit it, commit, then run the op. Every config
// change is therefore reviewed as a diff and recorded in .aidlc/ops/.
//
// tl_config/app is WORLD-READABLE (firestore.rules: allow read: if true) and
// admin-write-only, so it must never carry a secret. The client fails open —
// AppConfigGate treats a missing or unreadable doc as "no config", so the app
// stays fully functional. That also means nothing here can rescue a build that
// predates the gate (0.1.19); force-update only reaches builds that read it.

// The newest build on Play. A version floor above this blocks every live user,
// so the script refuses to write one unless --allow-block is passed.
const CURRENT_SHIPPED_VC = 45; // tracklimits 0.1.44 (vc45)

// The config we want tl_config/app to hold.
const DESIRED = {
  // 0 = no floor. AppConfigGate only blocks when this is truthy AND the running
  // versionCode is below it, so 0 arms the lever without using it. Set this to
  // the first good versionCode to lock out a shipped-broken build.
  minSupportedVersionCode: 0,
  updateUrl: 'https://play.google.com/store/apps/details?id=com.tracklimits.app',
  // Non-blocking banner. Change `id` to re-show it after players dismiss it.
  notice: {
    enabled: false,
    id: 'none',
    title: '',
    body: '',
    severity: 'info',
    dismissible: true,
  },
  // Open-ended flags, read client-side via appConfigFlag(config, key, fallback).
  // Nothing reads one yet; the channel works the moment a screen does.
  features: {},
};

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// Deep merge desired over current. Objects merge key-by-key; every other value
// (including arrays) is replaced wholesale.
function mergeConfig(current, desired) {
  const out = isPlainObject(current) ? { ...current } : {};
  for (const [k, v] of Object.entries(desired || {})) {
    out[k] = isPlainObject(v) ? mergeConfig(out[k], v) : v;
  }
  return out;
}

// Leaf-level changes desired would make to current, as [{ path, from, to }].
function diffConfig(current, desired, prefix = '') {
  const changes = [];
  for (const [k, v] of Object.entries(desired || {})) {
    const path = prefix ? `${prefix}.${k}` : k;
    const before = isPlainObject(current) ? current[k] : undefined;
    if (isPlainObject(v)) {
      changes.push(...diffConfig(before, v, path));
    } else if (JSON.stringify(before) !== JSON.stringify(v)) {
      changes.push({ path, from: before, to: v });
    }
  }
  return changes;
}

// Would this config lock out a build running versionCode `vc`?
function blocksVersion(config, vc) {
  const floor = config && config.minSupportedVersionCode;
  return typeof floor === 'number' && floor > 0 && typeof vc === 'number' && vc < floor;
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const i = a.indexOf('=');
      return i < 0 ? [a.replace(/^--/, ''), true] : [a.slice(2, i), a.slice(i + 1)];
    })
  );

  const admin = require('../node_modules/firebase-admin');
  admin.initializeApp({ projectId: 'f1-app-18077' });
  const db = admin.firestore();
  const ref = db.doc('tl_config/app');

  const snap = await ref.get();
  const current = snap.exists ? snap.data() : null;
  console.log(`tl_config/app ${snap.exists ? 'exists' : 'does NOT exist — will be created'}`);

  const changes = diffConfig(current || {}, DESIRED);
  if (!changes.length) {
    console.log('no changes — the doc already matches DESIRED');
    return;
  }
  for (const c of changes) {
    console.log(`  ${c.path}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`);
  }

  const merged = mergeConfig(current || {}, DESIRED);
  if (blocksVersion(merged, CURRENT_SHIPPED_VC) && !args['allow-block']) {
    throw new Error(
      `refusing: minSupportedVersionCode ${merged.minSupportedVersionCode} would block the shipped build vc${CURRENT_SHIPPED_VC} ` +
        '— every live player would see "update required". Pass --allow-block if that is genuinely intended.'
    );
  }

  if (!args.write) {
    console.log('\nDRY RUN — pass --write to apply');
    return;
  }

  await ref.set({ ...merged, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  console.log(`wrote tl_config/app (${changes.length} change(s))`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = { DESIRED, CURRENT_SHIPPED_VC, mergeConfig, diffConfig, blocksVersion };
