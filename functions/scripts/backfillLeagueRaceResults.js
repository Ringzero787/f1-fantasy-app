/**
 * F-062 backfill: the one past race that can be reconstructed.
 *
 * Nothing recorded what a team fielded in past races (F-029 starts that now):
 * old Aces were overwritten, departed picks fold into lockedPoints, and the
 * transactions log is client-written and partial. A dry run of a roster-based
 * estimate on 2026-09-19 gave 0 points for rounds 1 to 15 in every league,
 * because contracts expire and current picks were all added in the last round
 * or two. So this does not estimate. The only server-written per-race number
 * that survives is `members.lastRacePoints` for the latest scored race
 * (`lastRaceId`): that race's RACE-DAY points, without the qualifying or sprint
 * points banked earlier in the weekend.
 *
 * What it writes, per league: leagues/{id}/raceResults/{latestRaceId} with
 * `estimated: true` and `basis: 'race_day_points'`, and the race id in the
 * league's `raceResultIds`. It never overwrites a document scoring wrote
 * (estimated: false). Partial results never count as race wins
 * (scoring/leagueRaceResults.countRaceWins). Every other completed race is
 * listed as not reconstructable.
 *
 * Usage (aidlc op new uc-script -p script=backfillLeagueRaceResults.js -p backup=leagues):
 *   node scripts/backfillLeagueRaceResults.js            # dry run, writes nothing
 *   node scripts/backfillLeagueRaceResults.js --apply    # write
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const EXPECTED_PROJECT = 'f1-app-18077';
const SEASON = '2026';
const KEY = process.env.SA_KEY;
if (!KEY) { console.error('SA_KEY must point at the service-account key (set by aidlc op from ~/.config/aidlc/env).'); process.exit(2); }
const cred = require(KEY);
if (cred.project_id !== EXPECTED_PROJECT) { console.error(`Refusing to run: key is for project ${cred.project_id}, expected ${EXPECTED_PROJECT}.`); process.exit(2); }
const lib = path.join(__dirname, '..', 'lib', 'scoring', 'leagueRaceResults.js');
if (!fs.existsSync(lib)) { console.error('functions/lib is not built. Run: npm --prefix functions run build'); process.exit(2); }
const { rankRaceEntries } = require(lib);
const { cleanName } = require(path.join(__dirname, '..', 'lib', 'scoring', 'leagueRaceResultsWriter.js'));

admin.initializeApp({ credential: admin.credential.cert(cred), projectId: EXPECTED_PROJECT });
const db = admin.firestore();
const APPLY = process.argv.includes('--apply');

(async () => {
  const racesSnap = await db.collection('races').where('seasonId', '==', SEASON).get();
  const completed = racesSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => r.status === 'completed').sort((a, b) => (a.round || 0) - (b.round || 0));
  const latest = completed[completed.length - 1];
  if (!latest) { console.log('No completed race; nothing to do.'); process.exit(0); }
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} · season ${SEASON} · ${completed.length} completed races · latest R${latest.round} ${latest.id}`);

  const leagues = await db.collection('leagues').get();
  let toWrite = 0, skipped = 0;
  for (const league of leagues.docs) {
    const [membersSnap, teamsSnap, prior] = await Promise.all([
      league.ref.collection('members').get(),
      db.collection('fantasyTeams').where('leagueId', '==', league.id).get(),
      league.ref.collection('raceResults').doc(latest.id).get(),
    ]);
    const label = `${cleanName(league.data().name) || league.id} (${league.id})`;
    if (prior.exists && prior.data().estimated !== true) { skipped++; console.log(`\n${label}: scoring already wrote ${latest.id}; left alone`); continue; }
    const teamName = new Map();
    teamsSnap.docs.forEach((t) => { const d = t.data(); if (d.userId && typeof d.name === 'string' && !teamName.has(d.userId)) teamName.set(d.userId, d.name); });
    const approved = membersSnap.docs.filter((m) => m.data().status !== 'pending');
    const scored = approved.filter((m) => m.data().lastRaceId === latest.id);
    if (scored.length === 0) { skipped++; console.log(`\n${label}: no member was scored in ${latest.id}; nothing to write`); continue; }
    // Only members the server actually scored in this race: a member without a score is left out,
    // never shown with an invented 0.
    const result = rankRaceEntries(scored.map((m) => ({
      userId: m.id,
      points: typeof m.data().lastRacePoints === 'number' ? m.data().lastRacePoints : 0,
      displayName: cleanName(m.data().displayName),
      teamName: cleanName(teamName.get(m.id)),
    })));
    console.log(`\n${label}: ${approved.length} member(s), ${scored.length} scored in ${latest.id}${scored.length < approved.length ? ` (${approved.length - scored.length} left out: not scored)` : ''}`);
    result.entries.forEach((e) => console.log(`  ${String(e.rank).padStart(2)}  ${String(e.points).padStart(5)}  ${e.displayName || e.userId}${e.teamName ? '  · ' + e.teamName : ''}`));
    toWrite++;
    if (APPLY) {
      const batch = db.batch();
      batch.set(league.ref.collection('raceResults').doc(latest.id), {
        raceId: latest.id, season: SEASON, round: latest.round ?? null, raceName: latest.name ?? null,
        entries: result.entries, winners: result.winners, topPoints: result.topPoints,
        estimated: true, basis: 'race_day_points',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      batch.set(league.ref, { raceResultIds: admin.firestore.FieldValue.arrayUnion(latest.id) }, { merge: true });
      await batch.commit();
    }
  }
  console.log(`\n${APPLY ? 'Wrote' : 'Would write'} ${toWrite} partial result(s) for ${latest.id}; ${skipped} league(s) skipped.`);
  console.log(`Not reconstructable: the other ${completed.length - 1} completed race(s) of ${SEASON} (${completed.slice(0, -1).map((r) => 'R' + r.round).join(', ')}) in every league — no per-race roster, Ace or points were recorded before F-029.`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
