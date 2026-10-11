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
 * What it writes, per result document: `rosterValue` on each entry that does
 * not have the field yet (a number, or null when it cannot be known for every
 * team of that manager) and `rosterValueBackfilledAt`. Nothing else in the
 * document changes: not the points, ranks, winners or names. An entry that
 * already has the field, from scoring or an earlier run, is never touched:
 * what scoring recorded at the time is better than a recomputation made after
 * teams have been deleted or moved. Results that are estimates
 * (`estimated: true`, with no snapshots behind them) are left alone.
 *
 * Limits, both in the direction of saying less: a team counts only if its
 * snapshot says it was in this league for that race; and a manager who had two
 * teams then and has deleted one since gets the value of the one that is left,
 * which reads a little high on points per dollar. The run lists nothing for
 * that case because nothing on record shows it.
 *
 * Each write is conditional on the document not having changed since it was
 * read, so a scoring run in the same minute is never overwritten; such a
 * document is reported and skipped. Do not run it during a scoring window.
 *
 * Usage. The dry run prints the `backup=` value to give the op, because the
 * documents written are in a subcollection and a backup of `leagues` alone does
 * not hold them:
 *   node scripts/backfillRaceResultRosterValue.js            # dry run, writes nothing
 *   aidlc op new uc-script -p script=backfillRaceResultRosterValue.js -p backup=<printed by the dry run>
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
    // already recorded, by scoring or an earlier run: leave it, whatever today's recomputation says
    if (Object.prototype.hasOwnProperty.call(e, 'rosterValue')) return e;
    changed = true;
    return { ...e, rosterValue: values.has(e.userId) ? values.get(e.userId) : null };
  });
  return changed ? next : null;
}

async function main() {
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} · roster value on league race results`);
  const leagues = await db.collection('leagues').get();
  let docs = 0, toWrite = 0, estimated = 0, unchanged = 0, priced = 0, unknown = 0, raced = 0;
  const touched = new Set();
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
      // only teams whose snapshot puts them in this league for that race: a team attached to the league since was not part of it
      const fielded = teams.docs.map((t, i) => ({ userId: t.data().userId, snapshot: snaps[i] && snaps[i].exists ? snaps[i].data() : null }))
        .filter((t) => !t.snapshot || (t.snapshot.leagueId ?? null) === league.id);
      const values = rosterValuesByUser(fielded);
      const next = withRosterValues(data.entries, values);
      if (!next) { unchanged++; continue; }
      const known = next.filter((e) => typeof e.rosterValue === 'number').length;
      priced += known; unknown += next.length - known;
      console.log(`  ${league.id} ${result.id}: ${known}/${next.length} entries priced${known ? ` (e.g. ${next.find((e) => typeof e.rosterValue === 'number').rosterValue})` : ''}`);
      touched.add(league.id);
      if (!APPLY) { toWrite++; continue; }
      try {
        // conditional on the read above: a scoring run that rewrote the document in between wins
        await result.ref.update({ entries: next, rosterValueBackfilledAt: admin.firestore.FieldValue.serverTimestamp() }, { lastUpdateTime: result.updateTime });
        toWrite++;
      } catch (e) {
        raced++;
        console.log(`    skipped: the document changed while this ran (${e.code ?? e.message}); run again`);
      }
    }
  }
  console.log(`\n${docs} result document(s): ${APPLY ? 'wrote' : 'would write'} ${toWrite}; ${unchanged} already up to date; ${estimated} estimate(s) left alone.`);
  console.log(`Entries ${APPLY ? 'given' : 'that would get'} a value: ${priced}; left null (no snapshot for every team): ${unknown}.`);
  if (raced) console.log(`${raced} document(s) changed underneath and were skipped.`);
  if (!APPLY && touched.size) console.log(`\nbackup=${[...touched].map((id) => `leagues/${id}/raceResults`).join(',')}`);
  process.exit(0);
}

module.exports = { withRosterValues };

if (require.main === module) {
  initAdmin();
  main().catch((e) => { console.error(e); process.exit(1); });
}
