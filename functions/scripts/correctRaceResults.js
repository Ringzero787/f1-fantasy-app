/**
 * Apply the official (corrected) classification to the latest completed race (F-168).
 *
 * Race scoring runs once per team, so a classification the stewards changed after approval
 * never reached Undercut teams (Las Vegas 2026: Hadjar's time penalty, 90 teams 2–5 points
 * high). From F-168 the ingestion's correction pass and onRaceCompleted handle this by
 * themselves for 72 h; this script is the way to do it by hand: outside that window, or before
 * the F-168 functions are deployed.
 *
 * It fetches the classification exactly as the ingestion approves it (fetchOfficialResults),
 * compares it with races/{raceId}.results, and applies the difference to every team through
 * applyRaceCorrection — the same code the trigger runs. With --apply it then writes the new
 * results to races/{raceId}. That write is also what Track Limits settles from, and its own
 * trigger re-grades that race's lineups, payouts and bets; the dry run says so.
 *
 * The race is the latest completed race of the current season (a correction to an older race
 * would rewrite lastRacePoints and the weekend leaderboard of a newer one, so it is refused).
 * The op cannot pass arguments; on the command line, --race <id> names a race explicitly.
 *
 * Usage:
 *   node scripts/correctRaceResults.js            # dry run: the diff and every team's change
 *   node scripts/correctRaceResults.js --apply    # apply it, then write the corrected results
 * Needs `npm run build` first (it runs the compiled functions code in ../lib).
 */
const admin = require('firebase-admin');
const EXPECTED_PROJECT = 'f1-app-18077';
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
const raceArg = (() => { const i = process.argv.indexOf('--race'); return i > 0 ? process.argv[i + 1] : null; })();

const fmt = (r) => r ? `${r.status === 'finished' ? `P${r.position}` : r.status.toUpperCase()}${r.fastestLap ? ' FL' : ''} (grid ${r.gridPosition})` : '—';

async function main() {
  // The compiled modules create their Firestore client on load: require them after initAdmin.
  const { fetchOfficialResults, candidateOf } = require('../lib/ingestion/checkResults.js');
  const { sessionsBySeason } = require('../lib/ingestion/season.js');
  const { fetchSessions } = require('../lib/ingestion/openf1Client.js');
  const { loadRoster } = require('../lib/ingestion/resolveCars.js');
  const { applyRaceCorrection, resultsSignature } = require('../lib/scoring/raceCorrection.js');
  const { syncLeaguesForRace } = require('../lib/scoring/calculatePoints.js');
  const { currentSeason } = require('../lib/season/current.js');

  let raceDoc;
  if (raceArg) {
    raceDoc = await db.collection('races').doc(raceArg).get();
    if (!raceDoc.exists) throw new Error(`races/${raceArg} does not exist`);
  } else {
    const season = await currentSeason(db);
    const done = await db.collection('races').where('seasonId', '==', String(season)).where('status', '==', 'completed').get();
    raceDoc = done.docs.sort((a, b) => (b.data().round || 0) - (a.data().round || 0))[0];
    if (!raceDoc) throw new Error(`no completed race in season ${season}`);
  }
  const race = raceDoc.data();
  if (race.status !== 'completed') throw new Error(`${raceDoc.id} is ${race.status}, not completed — the ingestion scores it normally`);
  console.log(`race: ${raceDoc.id} (${race.name || ''}, season ${race.seasonId} round ${race.round})`);

  const candidate = candidateOf(raceDoc, 'Repair');
  if (!candidate) throw new Error(`${raceDoc.id}: no usable schedule.race / season for the provider lookup`);
  const warnings = [];
  const fetched = await fetchOfficialResults(candidate, sessionsBySeason(fetchSessions), await loadRoster(db), warnings);
  if (!fetched) throw new Error('the provider has no classification for this race (see the log line above)');
  const unmapped = warnings.filter((w) => /unmapped/i.test(w));
  if (unmapped.length) throw new Error(`refusing: the provider classification has unmapped cars: ${unmapped.join('; ')}`);
  if (warnings.length) console.log(`provider warnings: ${warnings.join(' | ')}`);

  const old = race.results || {};
  const corrected = {
    raceResults: fetched.raceData.results,
    ...(fetched.sprintData && fetched.sprintData.results.length ? { sprintResults: fetched.sprintData.results } : old.sprintResults ? { sprintResults: old.sprintResults } : {}),
    ...(fetched.qualifyingData && fetched.qualifyingData.results.length ? { qualifyingResults: fetched.qualifyingData.results } : old.qualifyingResults ? { qualifyingResults: old.qualifyingResults } : {}),
    ...(fetched.fastestLapDriverId ? { fastestLap: fetched.fastestLapDriverId } : old.fastestLap ? { fastestLap: old.fastestLap } : {}),
  };
  if (resultsSignature(old) === resultsSignature(corrected)) {
    console.log('the stored results already match the provider: nothing to correct');
    return;
  }

  // What moved, car by car
  const byId = (rows) => new Map((rows || []).map((r) => [r.driverId, r]));
  const before = byId(old.raceResults);
  const after = byId(corrected.raceResults);
  console.log('\nrace classification changes:');
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(id); const b = after.get(id);
    if (JSON.stringify(a) !== JSON.stringify(b)) console.log(`  ${id.padEnd(14)} ${fmt(a)}  →  ${fmt(b)}`);
  }
  const qb = byId(old.qualifyingResults); const qa = byId(corrected.qualifyingResults);
  for (const id of new Set([...qb.keys(), ...qa.keys()])) {
    if ((qb.get(id) || {}).position !== (qa.get(id) || {}).position) console.log(`  qualifying ${id}: ${(qb.get(id) || {}).position ?? '—'} → ${(qa.get(id) || {}).position ?? '—'}`);
  }

  const summary = await applyRaceCorrection(db, raceDoc.id, race, old, corrected, { dryRun: !APPLY, syncLeagues: syncLeaguesForRace, log: (m) => console.log(m) });
  if (summary.refused) { console.error(`REFUSED: ${summary.refused}`); process.exit(1); }

  console.log('\npoints per pick (neutral, before the Ace):');
  for (const [id, d] of Object.entries(summary.entityDeltas)) console.log(`  ${id.padEnd(14)} race ${d.race >= 0 ? '+' : ''}${d.race}  quali ${d.quali >= 0 ? '+' : ''}${d.quali}  sprint ${d.sprint >= 0 ? '+' : ''}${d.sprint}`);
  const hist = new Map();
  summary.teams.forEach((t) => { const k = t.activeDelta + t.bankedDelta; hist.set(k, (hist.get(k) || 0) + 1); });
  console.log(`\nteams that change: ${summary.teams.length}${summary.skippedAlreadyCorrected ? ` (${summary.skippedAlreadyCorrected} already corrected, skipped)` : ''}`);
  [...hist.entries()].sort((a, b) => a[0] - b[0]).forEach(([k, n]) => console.log(`  ${k >= 0 ? '+' : ''}${k} points: ${n} team(s)`));
  console.log(`  of which banked (sold or expired picks → lockedPoints): ${summary.teams.filter((t) => t.bankedDelta).length} team(s)`);
  const leagues = [...new Set(summary.teams.map((t) => t.leagueId).filter(Boolean))];
  console.log(`leagues re-synced: ${leagues.length}${leagues.length ? ` — backup paths: ${leagues.map((l) => `leagues/${l}/members`).join(',')}` : ''}`);
  console.log(`raceScores rows rewritten: ${summary.rows}`);
  if (summary.aceUnknown.length) console.log(`WARNING Ace without a pre-race price (corrected at ×1): ${summary.aceUnknown.map((a) => `${a.teamId}/${a.entityId}`).join(', ')}`);
  if (summary.moonshotsToReview.length) console.log(`WARNING settled Moonshots on a moved driver (not re-settled, review by hand): ${summary.moonshotsToReview.join(', ')}`);
  console.log(`\nTRACK LIMITS: --apply writes races/${raceDoc.id}.results; Track Limits' trigger re-grades this race's lineups, payouts and bets from it.`);

  if (!APPLY) { console.log('\nDRY RUN — nothing written. Re-run with --apply.'); return; }

  const update = {
    'results.raceResults': corrected.raceResults,
    ...(corrected.sprintResults ? { 'results.sprintResults': corrected.sprintResults } : {}),
    ...(corrected.qualifyingResults ? { 'results.qualifyingResults': corrected.qualifyingResults } : {}),
    ...(corrected.fastestLap ? { 'results.fastestLap': corrected.fastestLap } : {}),
    totalLaps: fetched.raceData.totalLaps || race.totalLaps || 0,
    resultsCorrectedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await raceDoc.ref.update(update);
  console.log(`wrote the corrected results to races/${raceDoc.id}`);
}

if (require.main === module) {
  initAdmin();
  main().then(() => process.exit(0), (e) => { console.error(e.message || e); process.exit(1); });
}
