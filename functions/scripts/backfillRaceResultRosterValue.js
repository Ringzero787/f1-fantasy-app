/**
 * F-120 backfill: roster value on past league race results.
 *
 * From F-120 the scoring run records, on every entry of
 * `leagues/{id}/raceResults/{raceId}`, what that manager's fielded roster was
 * worth at lock (`rosterValue`), so the round report can show points per $100.
 * Results written before that have no such field. The value can be rebuilt for
 * any race that has F-029 race snapshots, because the snapshot is the roster as
 * fielded with the prices it held; this fills it in by the same rule scoring
 * uses (scoring/leagueRaceResults.rosterValuesByUser).
 *
 * What it writes, per result document: `rosterValue` on each entry (a number,
 * or null when it cannot be known for every team of that manager) and
 * `rosterValueBackfilledAt`. Nothing else in the document changes: not the
 * points, ranks, winners or names. It leaves alone results that are estimates
 * (`estimated: true`, which have no snapshots behind them) and documents where
 * every entry already has the field.
 *
 * Usage (aidlc op new uc-script -p script=backfillRaceResultRosterValue.js -p backup=leagues):
 *   node scripts/backfillRaceResultRosterValue.js            # dry run, writes nothing
 *   node scripts/backfillRaceResultRosterValue.js --apply    # write
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const EXPECTED_PROJECT = 'f1-app-18077';
let db;
let rosterValuesByUser;

function initAdmin() {
  const KEY = process.env.SA_KEY;
  if (!KEY) { console.error('SA_KEY must point at the service-account key (set by aidlc op from ~/.config/aidlc/env).'); process.exit(2); }
  const cred = require(KEY);
  if (cred.project_id !== EXPECTED_PROJECT) { console.error(`Refusing to run: key is for project ${cred.project_id}, expected ${EXPECTED_PROJECT}.`); process.exit(2); }
  const lib = path.join(__dirname, '..', 'lib', 'scoring', 'leagueRaceResults.js');
  if (!fs.existsSync(lib)) { console.error('functions/lib is not built. Run: npm --prefix functions run build'); process.exit(2); }
  ({ rosterValuesByUser } = require(lib));
  if (typeof rosterValuesByUser !== 'function') { console.error('functions/lib is older than F-120. Run: npm --prefix functions run build'); process.exit(2); }
  admin.initializeApp({ credential: admin.credential.cert(cred), projectId: EXPECTED_PROJECT });
  db = admin.firestore();
}

const APPLY = process.argv.includes('--apply');

/** The entries with `rosterValue` set from `values`; null when no entry would change. Pure, for the test. */
function withRosterValues(entries, values) {
  if (!Array.isArray(entries)) return null;
  let changed = false;
  const next = entries.map((e) => {
    if (!e || typeof e.userId !== 'string') return e;
    const value = values.has(e.userId) ? values.get(e.userId) : null;
    if (Object.prototype.hasOwnProperty.call(e, 'rosterValue') && e.rosterValue === value) return e;
    changed = true;
    return { ...e, rosterValue: value };
  });
  return changed ? next : null;
}

async function main() {
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} · roster value on league race results`);
  const leagues = await db.collection('leagues').get();
  let docs = 0, toWrite = 0, estimated = 0, unchanged = 0, priced = 0, unknown = 0;
  for (const league of leagues.docs) {
    const results = await league.ref.collection('raceResults').get();
    if (results.empty) continue;
    const teams = await db.collection('fantasyTeams').where('leagueId', '==', league.id).get();
    for (const result of results.docs) {
      docs++;
      const data = result.data();
      if (data.estimated === true) { estimated++; continue; }
      const refs = teams.docs.map((t) => t.ref.collection('raceSnapshots').doc(result.id));
      const snaps = refs.length > 0 ? await db.getAll(...refs) : [];
      const values = rosterValuesByUser(teams.docs.map((t, i) => ({ userId: t.data().userId, snapshot: snaps[i] && snaps[i].exists ? snaps[i].data() : null })));
      const next = withRosterValues(data.entries, values);
      if (!next) { unchanged++; continue; }
      const known = next.filter((e) => typeof e.rosterValue === 'number').length;
      priced += known; unknown += next.length - known;
      toWrite++;
      console.log(`  ${league.id} ${result.id}: ${known}/${next.length} entries priced${known ? ` (e.g. ${next.find((e) => typeof e.rosterValue === 'number').rosterValue})` : ''}`);
      if (APPLY) await result.ref.update({ entries: next, rosterValueBackfilledAt: admin.firestore.FieldValue.serverTimestamp() });
    }
  }
  console.log(`\n${docs} result document(s): ${APPLY ? 'wrote' : 'would write'} ${toWrite}; ${unchanged} already up to date; ${estimated} estimate(s) left alone.`);
  console.log(`Entries ${APPLY ? 'given' : 'that would get'} a value: ${priced}; left null (no snapshot for every team): ${unknown}.`);
  process.exit(0);
}

module.exports = { withRosterValues };

if (require.main === module) {
  initAdmin();
  main().catch((e) => { console.error(e); process.exit(1); });
}
