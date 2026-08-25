/**
 * Backfill the driver Zandvoort 2026 (round 14) dropped on ingestion.
 *
 * Yuki Tsunoda (#22) was a one-off Racing Bulls stand-in and had no entry in
 * DRIVER_NUMBER_TO_ID, so convertTo*Results skipped him in all three sessions.
 * The stored grid was 21 cars and Racing Bulls scored 23 instead of 47.
 *
 * Why this is safe to patch directly, without re-running scoring:
 *   - onRaceCompleted bails immediately when beforeData.status === 'completed'
 *     (calculatePoints.ts), and this race is already completed — so writing the
 *     race doc fires no scoring.
 *   - NO fantasy team owns tsunoda or racing_bulls, so no team, member or
 *     league total changes. The script asserts this and aborts if it ever
 *     stops being true (then it would need a real re-grade, not a backfill).
 *   - Prices are untouched: pricesApplied is already true, and the pricing tier
 *     saturates identically (racing_bulls B-tier 'great', +24, at both 11 and
 *     24 pricing points), so the stored price is already correct.
 *
 * What it fixes: the race doc's three results arrays, and the raceScores
 * breakdown docs (adds __tsunoda, corrects __racing_bulls 23 -> 47).
 *
 * Usage:
 *   node scripts/backfillZandvoortTsunoda.js          # dry run
 *   node scripts/backfillZandvoortTsunoda.js --apply
 */

const admin = require('firebase-admin');
const KEY = process.env.SA_KEY || '/mnt/smb/f1-app/files/f1-app-18077-firebase-adminsdk-fbsvc-2b824e0c37.json';
admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db = admin.firestore();

const client = require('../lib/ingestion/openf1Client.js');
const core = require('../lib/scoring/scoringCore.js');
const {
  RACE_POINTS, SPRINT_POINTS, SPRINT_DNF_PENALTY, FASTEST_LAP_BONUS,
  POSITION_GAINED_BONUS, GRID_SIZE, calculateQualifyingPoints,
} = core;

const APPLY = process.argv.includes('--apply');
const RACE_ID = 'netherlands_2026';
const MEETING_KEY = 1292;
const NEW_DRIVER = 'tsunoda';
const AFFECTED_CTOR = 'racing_bulls';

const die = (m) => { console.error(`\nABORT: ${m}`); process.exit(1); };

(async () => {
  // ── Precondition: nobody owns the affected entities ──
  const teams = await db.collection('fantasyTeams').get();
  const owners = [];
  teams.forEach(d => {
    const t = d.data();
    if ((t.drivers || []).some(x => x.driverId === NEW_DRIVER)) owners.push(`${t.name} owns ${NEW_DRIVER}`);
    const c = Object.prototype.hasOwnProperty.call(t, 'constructor') ? t['constructor'] : null;
    if (c && typeof c === 'object' && c.constructorId === AFFECTED_CTOR) owners.push(`${t.name} owns ${AFFECTED_CTOR}`);
  });
  if (owners.length) die(`team points WOULD change — this needs a re-grade, not a backfill:\n  ${owners.join('\n  ')}`);
  console.log(`Precondition OK: 0 of ${teams.size} teams own ${NEW_DRIVER} or ${AFFECTED_CTOR} — no team/league totals can change.`);

  const raceRef = db.collection('races').doc(RACE_ID);
  const raceSnap = await raceRef.get();
  if (!raceSnap.exists) die(`race ${RACE_ID} not found`);
  const race = raceSnap.data();
  if (race.status !== 'completed') die(`race status is "${race.status}" — the no-trigger guarantee only holds for completed races`);

  // ── Re-fetch from OpenF1 through the fixed client ──
  const sessions = (await client.fetchSessions(2026)).filter(s => s.meeting_key === MEETING_KEY);
  const raceS = sessions.find(s => s.session_name === 'Race');
  const qualiS = sessions.find(s => s.session_name === 'Qualifying');
  const sprintS = sessions.find(s => s.session_name === 'Sprint');
  const grid = await client.getGridPositions(sessions, raceS.session_key);
  const fastestLap = await client.findFastestLap(raceS.session_key);
  const raceData = await client.convertToRaceResults(raceS.session_key, grid, fastestLap);
  const qualiData = await client.convertToQualifyingResults(qualiS.session_key);
  const sprintData = await client.convertToSprintResults(sprintS.session_key);

  const allWarn = [...raceData.warnings, ...qualiData.warnings, ...sprintData.warnings];
  if (allWarn.length) die(`OpenF1 conversion still warns — fix the mapping first:\n  ${allWarn.join('\n  ')}`);

  // ── Safety: every already-stored row must be byte-identical. Only an ADD is allowed. ──
  const cmp = (label, stored, fresh, key) => {
    const freshBy = new Map(fresh.map(r => [r[key], r]));
    for (const s of stored) {
      const f = freshBy.get(s[key]);
      if (!f) die(`${label}: stored ${s[key]} vanished from the fresh fetch`);
      if (JSON.stringify(s) !== JSON.stringify(f)) {
        die(`${label}: stored row for ${s[key]} differs from fresh — refusing to silently change a scored result\n  stored: ${JSON.stringify(s)}\n  fresh : ${JSON.stringify(f)}`);
      }
    }
    const added = fresh.filter(r => !stored.some(s => s[key] === r[key])).map(r => r[key]);
    console.log(`  ${label}: ${stored.length} stored -> ${fresh.length} fresh; adds [${added.join(',')}]`);
    if (added.length !== 1 || added[0] !== NEW_DRIVER) die(`${label}: expected exactly one addition (${NEW_DRIVER}), got [${added.join(',')}]`);
  };
  console.log('\nComparing stored vs fresh results:');
  cmp('raceResults', race.results.raceResults || [], raceData.results, 'driverId');
  cmp('qualifyingResults', race.results.qualifyingResults || [], qualiData.results, 'driverId');
  cmp('sprintResults', race.results.sprintResults || [], sprintData.results, 'driverId');
  if (fastestLap !== race.results.fastestLap) die(`fastestLap changed: ${race.results.fastestLap} -> ${fastestLap}`);

  // ── Rebuild the raceScores breakdown exactly as Phase 0.5 does ──
  const sprintBy = new Map(sprintData.results.map(r => [r.driverId, r]));
  const qualiBy = new Map(qualiData.results.map(r => [r.driverId, r]));
  const round = race.round || 0;
  const ops = [];

  for (const result of raceData.results) {
    const sr = sprintBy.get(result.driverId) || null;
    const qr = qualiBy.get(result.driverId);
    let racePoints = 0, sprintPoints = 0, qualiPoints = 0, positionsGained = 0, fastestLapBonus = 0;
    if (result.status === 'finished' && result.position >= 1) {
      if (result.position <= RACE_POINTS.length) racePoints += RACE_POINTS[result.position - 1];
      positionsGained = result.gridPosition - result.position;
      if (positionsGained > 0) racePoints += positionsGained * POSITION_GAINED_BONUS;
      if (positionsGained < 0) racePoints += positionsGained;
      if (result.fastestLap && result.position <= 10) { racePoints += FASTEST_LAP_BONUS; fastestLapBonus = FASTEST_LAP_BONUS; }
      if (result.position <= GRID_SIZE) racePoints += GRID_SIZE + 1 - result.position;
    } else if (result.status === 'dnf' || result.status === 'dsq') {
      racePoints = -5;
    }
    if (sr) {
      if (sr.status === 'finished' && sr.position >= 1 && sr.position <= SPRINT_POINTS.length) sprintPoints = SPRINT_POINTS[sr.position - 1];
      else if (sr.status === 'dnf' || sr.status === 'dsq') sprintPoints = SPRINT_DNF_PENALTY;
    }
    if (qr) qualiPoints = calculateQualifyingPoints(qr.position);

    ops.push({
      id: `${RACE_ID}__${result.driverId}`,
      data: {
        raceId: RACE_ID, round, entityId: result.driverId, entityType: 'driver',
        constructorId: result.constructorId, position: result.position,
        gridPosition: result.gridPosition, status: result.status, positionsGained,
        racePoints, sprintPoints, sprintPosition: sr ? sr.position : null,
        qualiPoints, qualiPosition: qr ? qr.position : null,
        fastestLap: result.fastestLap, fastestLapBonus,
        totalPoints: racePoints + sprintPoints + qualiPoints,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      },
    });
  }

  for (const ctorId of [...new Set(raceData.results.map(r => r.constructorId))]) {
    let ctorRacePoints = 0, ctorQualiPoints = 0;
    for (const result of raceData.results.filter(r => r.constructorId === ctorId)) {
      if (result.status === 'finished') {
        if (result.position >= 1 && result.position <= RACE_POINTS.length) ctorRacePoints += RACE_POINTS[result.position - 1];
        if (result.position >= 1 && result.position <= GRID_SIZE) ctorRacePoints += GRID_SIZE + 1 - result.position;
      }
      const qr = qualiBy.get(result.driverId);
      if (qr) ctorQualiPoints += calculateQualifyingPoints(qr.position);
    }
    ops.push({
      id: `${RACE_ID}__${ctorId}`,
      data: {
        raceId: RACE_ID, round, entityId: ctorId, entityType: 'constructor',
        racePoints: ctorRacePoints, sprintPoints: 0, qualiPoints: ctorQualiPoints,
        totalPoints: ctorRacePoints + ctorQualiPoints,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      },
    });
  }

  // ── Report the raceScores diff ──
  console.log('\nraceScores changes:');
  let changed = 0;
  for (const op of ops) {
    const cur = await db.collection('raceScores').doc(op.id).get();
    const before = cur.exists ? cur.data() : null;
    const same = before && ['racePoints', 'sprintPoints', 'qualiPoints', 'totalPoints'].every(k => before[k] === op.data[k]);
    if (same) continue;
    changed++;
    console.log(`  ${op.id.replace(RACE_ID + '__', '').padEnd(14)} ${before ? `total ${before.totalPoints} -> ${op.data.totalPoints}` : `NEW  total ${op.data.totalPoints}`}`);
  }
  if (!changed) console.log('  (none)');

  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply.');
    process.exit(0);
  }

  const batch = db.batch();
  batch.set(raceRef, {
    results: {
      raceResults: raceData.results,
      qualifyingResults: qualiData.results,
      sprintResults: sprintData.results,
      fastestLap,
    },
  }, { merge: true });
  for (const op of ops) batch.set(db.collection('raceScores').doc(op.id), op.data, { merge: true });
  await batch.commit();

  console.log(`\nApplied: race doc results arrays now carry 22 cars; ${ops.length} raceScores docs rewritten (${changed} changed).`);
  console.log('No team, member, league or price document was touched.');
  process.exit(0);
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
