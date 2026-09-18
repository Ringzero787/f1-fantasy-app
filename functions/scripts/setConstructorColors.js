/**
 * Write the Grid redesign team colours onto the constructor docs.
 *
 * The app's remote-config loader reads `colors.{primary,secondary}` from each
 * `constructors/<id>` doc (remoteConfig.service fetchTeamColors) and falls back
 * to src/config/constants TEAM_COLORS when no doc has the field. Production
 * docs only carry the older `primaryColor`/`secondaryColor` pair (with white
 * primaries for Haas and Racing Bulls), so the app has been on the fallback.
 * This sets `colors` to the handoff hexes for the seven teams the design
 * draws and our own picks for the rest, leaving every other field untouched.
 *
 * Usage:
 *   node scripts/setConstructorColors.js            # dry run, writes nothing
 *   node scripts/setConstructorColors.js --apply    # write the colours
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

// Keep in sync with src/config/constants.ts TEAM_COLORS (the in-app fallback).
const COLORS = {
  red_bull: { primary: '#3671C6', secondary: '#E10600' },
  ferrari: { primary: '#E80020', secondary: '#FFEB00' },
  mclaren: { primary: '#FF8000', secondary: '#47C7FC' },
  mercedes: { primary: '#27F4D2', secondary: '#000000' },
  aston_martin: { primary: '#229971', secondary: '#CEDC00' },
  alpine: { primary: '#0093CC', secondary: '#FF87BC' },
  williams: { primary: '#64C4FF', secondary: '#00A3E0' },
  rb: { primary: '#6692FF', secondary: '#1634B5' },
  racing_bulls: { primary: '#6692FF', secondary: '#1634B5' },
  haas: { primary: '#B6BABD', secondary: '#E10600' },
  audi: { primary: '#52E252', secondary: '#BB0A30' },
  cadillac: { primary: '#C7B063', secondary: '#1C1C1C' },
};

(async () => {
  const snap = await db.collection('constructors').get();
  const rows = [];
  for (const doc of snap.docs) {
    const want = COLORS[doc.id];
    const have = doc.data().colors || null;
    if (!want) { rows.push({ id: doc.id, action: 'skip (no colour defined)' }); continue; }
    const same = have && have.primary === want.primary && have.secondary === want.secondary;
    rows.push({ id: doc.id, action: same ? 'unchanged' : 'set', from: have ? `${have.primary}/${have.secondary}` : '(none)', to: `${want.primary}/${want.secondary}` });
  }
  const missing = Object.keys(COLORS).filter((id) => !snap.docs.some((d) => d.id === id));

  console.log(`constructors: ${snap.size} docs, ${rows.filter((r) => r.action === 'set').length} to set, ${rows.filter((r) => r.action === 'unchanged').length} unchanged`);
  for (const r of rows) console.log(`  ${r.id.padEnd(14)} ${r.action.padEnd(10)} ${r.from ? `${r.from} -> ${r.to}` : ''}`);
  if (missing.length) console.log(`  (no doc for: ${missing.join(', ')} — nothing written for them)`);

  if (!APPLY) { console.log('\nDry run — nothing written. Re-run with --apply to write.'); return; }

  const batch = db.batch();
  let n = 0;
  for (const doc of snap.docs) {
    const want = COLORS[doc.id];
    if (!want) continue;
    batch.set(doc.ref, { colors: want }, { merge: true });
    n++;
  }
  await batch.commit();
  console.log(`\nWrote colors on ${n} constructor docs.`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
