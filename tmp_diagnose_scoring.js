/**
 * Read-only scoring diagnostic. Run from an authed machine:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json node tmp_diagnose_scoring.js [options]
 * or with `firebase login` ADC available.
 *
 * Modes:
 *   (default)            Verify the qualifying-breakdown discrepancy for the latest race.
 *   --race <raceId>      Run the breakdown check against a specific race.
 *   --from-round <N>     Preview the INCREMENTAL repairTeamScoring(fromRound=N):
 *                        re-derives each team's points for races >= N that are not
 *                        yet scored, using the corrected scoring, and prints the
 *                        per-team old -> new total deltas. WRITES NOTHING.
 *
 * Scoring math is imported from the compiled shared core
 * (functions/lib/scoring/scoringCore.js), so this diagnostic cannot drift from
 * live scoring. Run `cd functions && npm run build` before using --from-round.
 */
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'f1-app-18077' });
const db = admin.firestore();

// ─── Shared scoring math (single source of truth) ───
// Imported from the compiled Cloud Functions output so this diagnostic can never
// drift from live scoring. Requires `cd functions && npm run build` first.
let core;
try {
  core = require('./functions/lib/scoring/scoringCore.js');
} catch (e) {
  console.error('Could not load functions/lib/scoring/scoringCore.js — run `cd functions && npm run build` first.');
  process.exit(3);
}
const {
  RACE_POINTS,
  GRID_SIZE,
  ACE_MAX_PRICE,
  calculateLockBonus,
  calculateQualifyingPoints,
  calculateDriverPoints,
} = core;

// ─── Load all completed races, sorted by round ───
async function loadCompletedRaces() {
  const snap = await db.collection('races').where('status', '==', 'completed').get();
  return snap.docs.map(d => {
    const rd = d.data();
    return {
      raceId: d.id,
      round: rd.round || 0,
      qualifyingScored: rd.qualifyingScored === true,
      raceResults: rd.results?.raceResults || [],
      sprintResults: rd.results?.sprintResults || null,
      qualifyingResults: rd.results?.qualifyingResults || null,
    };
  }).sort((a, b) => a.round - b.round);
}

// ─── Mode 1: breakdown discrepancy check ───
async function breakdownCheck(raceIdArg) {
  const races = await loadCompletedRaces();
  const target = raceIdArg ? races.find(r => r.raceId === raceIdArg) : races[races.length - 1];
  if (!target) { console.error('no completed race'); return; }
  console.log(`\n=== Breakdown check: ${target.raceId} (round ${target.round}) ===`);
  console.log(`qualifyingScored=${target.qualifyingScored}`);

  const rsSnap = await db.collection('raceScores').where('raceId', '==', target.raceId).get();
  const driverScores = rsSnap.docs.map(d => d.data()).filter(s => s.entityType === 'driver');
  const qualiNonZero = driverScores.filter(s => (s.qualiPoints || 0) !== 0).length;
  console.log(`raceScores: ${driverScores.length} drivers, ${qualiNonZero} with qualiPoints>0`);
  if (qualiNonZero === 0 && target.qualifyingScored) {
    console.log('  ⚠️  qualifyingScored=true but every breakdown shows qualiPoints=0 (the bug).');
    console.log('     After deploying the fix + rescoring, this should be >0.');
  } else if (target.qualifyingScored) {
    console.log('  ✓ qualifying points present in the breakdown.');
  }
  // Internal consistency: totalPoints == race + sprint + quali
  const bad = rsSnap.docs.map(d => d.data()).filter(s =>
    (s.totalPoints || 0) !== (s.racePoints || 0) + (s.sprintPoints || 0) + (s.qualiPoints || 0));
  console.log(bad.length === 0
    ? '  ✓ all raceScores docs internally consistent (total = race+sprint+quali)'
    : `  ⚠️  ${bad.length} raceScores docs where total != race+sprint+quali`);
}

// ─── Mode 2: incremental repair preview (fromRound) ───
async function incrementalPreview(fromRound) {
  const races = (await loadCompletedRaces()).filter(r => r.round >= fromRound);
  console.log(`\n=== Incremental repair preview: fromRound=${fromRound} ===`);
  console.log(`Races in range (round >= ${fromRound}): ${races.map(r => `${r.raceId}#${r.round}`).join(', ') || '(none)'}`);
  if (races.length === 0) { console.log('Nothing to score.'); return; }

  const teamsSnap = await db.collection('fantasyTeams').get();
  const rows = [];

  for (const teamDoc of teamsSnap.docs) {
    const team = teamDoc.data();
    const oldTotal = team.totalPoints || 0;
    const scored = new Set(team.scoredRaces || []);
    // Clone roster with mutable racesHeld
    const drivers = (team.drivers || []).map(d => ({ ...d, _rh: d.racesHeld || 0 }));
    let ctor = team.constructor ? { ...team.constructor, _rh: team.constructor.racesHeld || 0 } : null;
    const aceDriverId = team.aceDriverId;
    const aceConstructorId = team.aceConstructorId;

    let delta = 0;
    const racesApplied = [];

    for (const race of races) {
      const raceMap = new Map(race.raceResults.map(r => [r.driverId, r]));
      const sprintMap = new Map((race.sprintResults || []).map(r => [r.driverId, r]));
      const qualiMap = new Map((race.qualifyingResults || []).map(r => [r.driverId, r]));
      let applied = false;

      // Qualifying (own scoredRaces key)
      if (race.qualifyingScored && race.qualifyingResults && !scored.has(`quali_${race.raceId}`)) {
        for (const d of drivers) {
          const qr = qualiMap.get(d.driverId);
          let pts = qr ? calculateQualifyingPoints(qr.position) : 0;
          const isAce = d.driverId === aceDriverId && (d.purchasePrice || 0) <= ACE_MAX_PRICE;
          if (isAce) pts *= 2;
          delta += pts;
        }
        if (ctor) {
          let cpts = 0;
          for (const qr of race.qualifyingResults.filter(r => r.constructorId === ctor.constructorId)) {
            cpts += calculateQualifyingPoints(qr.position);
          }
          if (aceConstructorId === ctor.constructorId && (ctor.purchasePrice || 0) <= ACE_MAX_PRICE) cpts *= 2;
          delta += cpts;
        }
        scored.add(`quali_${race.raceId}`);
        applied = true;
      }

      // Race (own scoredRaces key)
      if (!scored.has(race.raceId)) {
        for (const d of drivers) {
          const rr = raceMap.get(d.driverId);
          const sr = sprintMap.get(d.driverId) || null;
          const isAce = d.driverId === aceDriverId && (d.purchasePrice || 0) <= ACE_MAX_PRICE;
          if (rr) delta += calculateDriverPoints(rr, sr, d._rh, isAce);
          d._rh += 1;
        }
        if (ctor) {
          let cpts = 0;
          for (const rr of race.raceResults.filter(r => r.constructorId === ctor.constructorId)) {
            if (rr.status === 'finished') {
              if (rr.position <= RACE_POINTS.length) cpts += RACE_POINTS[rr.position - 1];
              if (rr.position >= 1 && rr.position <= GRID_SIZE) cpts += GRID_SIZE + 1 - rr.position;
            }
          }
          if (aceConstructorId === ctor.constructorId && (ctor.purchasePrice || 0) <= ACE_MAX_PRICE) cpts *= 2;
          cpts += calculateLockBonus(ctor._rh);
          delta += cpts;
          ctor._rh += 1;
        }
        scored.add(race.raceId);
        applied = true;
      }

      if (applied) racesApplied.push(race.raceId);
    }

    if (delta !== 0 || racesApplied.length > 0) {
      rows.push({
        team: (team.name || teamDoc.id),
        league: team.leagueId || '(solo)',
        oldTotal,
        newTotal: oldTotal + delta,
        delta,
        races: racesApplied.length,
      });
    }
  }

  rows.sort((a, b) => b.delta - a.delta);
  console.log(`\nTeams affected: ${rows.length}/${teamsSnap.size}`);
  console.log('old → new (Δ)  | races | team');
  console.log('-'.repeat(60));
  for (const r of rows) {
    console.log(`${String(r.oldTotal).padStart(5)} → ${String(r.newTotal).padStart(5)} (${(r.delta >= 0 ? '+' : '') + r.delta})`.padEnd(22) +
                `| ${String(r.races).padStart(2)}    | ${r.team}`);
  }
  const totalDelta = rows.reduce((s, r) => s + r.delta, 0);
  console.log('-'.repeat(60));
  console.log(`Total points added across all teams: ${totalDelta}`);
  console.log('\nNOTE: preview only. Commit with repairTeamScoring({ fromRound: ' + fromRound + ' }) from an admin client.');
}

(async () => {
  try {
    const args = process.argv.slice(2);
    const fromIdx = args.indexOf('--from-round');
    const raceIdx = args.indexOf('--race');
    if (fromIdx !== -1) {
      const n = Number(args[fromIdx + 1]);
      if (!Number.isInteger(n) || n < 1) throw new Error('--from-round requires a positive integer');
      await incrementalPreview(n);
    } else {
      await breakdownCheck(raceIdx !== -1 ? args[raceIdx + 1] : args[0]);
    }
    process.exit(0);
  } catch (e) {
    console.error('FAILED:', e.message);
    process.exit(2);
  }
})();
