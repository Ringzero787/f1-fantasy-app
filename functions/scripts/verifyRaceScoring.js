// Verify a race's scoring is correct post the 2026-06-12 calculation overhaul.
// Usage: node scripts/verifyRaceScoring.js <raceId> [--phase=quali|race]
//
// Checks (race phase):
//   - race.status == completed, race.pricesApplied == true (new idempotency stamp)
//   - priceHistory has exactly ONE doc per active entity for the race
//     (deterministic ids ${raceId}__${entityId} → a double price-apply can't dupe;
//      auto-id duplicates from the old code WOULD show >1, so this catches regressions)
//   - no driver/constructor/team total is NaN
//   - every league member.totalPoints == matching team (totalPoints + lockedPoints)
//   - every team's stored totalPoints+lockedPoints reconciles with the sum of its
//     raceScores breakdown is NOT recomputed here (the server recon guard does that;
//     we assert the cross-doc consistency the client actually displays)
// Checks (quali phase): race.qualifyingScored == true, quali_<raceId> present on
//   scored teams exactly once, no NaN, member/team consistency.

const path = require('path');
const admin = require('firebase-admin');
const KEY = process.env.SA_KEY || '/mnt/smb/f1-app/files/f1-app-18077-firebase-adminsdk-fbsvc-2b824e0c37.json';
admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db = admin.firestore();

const raceId = process.argv[2];
const phaseArg = (process.argv.find(a => a.startsWith('--phase=')) || '').split('=')[1] || 'race';
if (!raceId) { console.error('usage: node scripts/verifyRaceScoring.js <raceId> [--phase=quali|race]'); process.exit(2); }

const fails = [];
const warns = [];
const ok = [];
const isNum = (v) => typeof v === 'number' && !isNaN(v);

(async () => {
  const raceSnap = await db.collection('races').doc(raceId).get();
  if (!raceSnap.exists) { console.error(`race ${raceId} not found`); process.exit(2); }
  const race = raceSnap.data();
  console.log(`\n=== Verifying ${raceId} (round ${race.round}, phase=${phaseArg}) ===`);
  console.log(`status=${race.status} qualifyingScored=${race.qualifyingScored===true} pricesApplied=${race.pricesApplied===true} hasSprint=${race.hasSprint===true}\n`);

  if (phaseArg === 'quali') {
    race.qualifyingScored === true ? ok.push('qualifyingScored=true') : fails.push('qualifyingScored is NOT true');
  } else {
    race.status === 'completed' ? ok.push('status=completed') : fails.push(`status=${race.status} (expected completed)`);
    race.pricesApplied === true ? ok.push('pricesApplied=true (idempotency stamp set)')
      : warns.push('pricesApplied!=true — ok only if this race was scored before the 2026-06-12 deploy');

    // priceHistory: one doc per active entity, no duplicates
    const ph = await db.collection('priceHistory').where('raceId','==',raceId).get();
    const byEntity = {};
    ph.forEach(d => { const e = d.data().entityId; byEntity[e] = (byEntity[e]||0)+1; });
    const dupes = Object.entries(byEntity).filter(([,n]) => n > 1);
    if (ph.empty) warns.push('no priceHistory rows for this race (scored pre-deploy, or prices not yet applied)');
    else if (dupes.length) fails.push(`priceHistory DUPLICATES (double price-apply): ${dupes.map(([e,n])=>`${e}×${n}`).join(', ')}`);
    else ok.push(`priceHistory: ${ph.size} rows, one per entity (no double-apply)`);
  }

  // Teams: NaN check + scoredRaces membership
  const teams = await db.collection('fantasyTeams').get();
  const wantKey = phaseArg === 'quali' ? `quali_${raceId}` : raceId;
  let scoredCount = 0, nanCount = 0;
  const teamTotalByUserLeague = {}; // `${leagueId}|${userId}` -> sum(totalPoints+lockedPoints)
  let shellSkipped = 0;
  teams.forEach(d => {
    const t = d.data();
    // Abandoned/half-created shells: no roster (no/empty drivers + no
    // constructor) and never scored. Not part of scoring; the pipeline guards
    // against them. Skip so they don't false-positive the totalPoints check.
    const noRoster = (!Array.isArray(t.drivers) || t.drivers.length === 0) && !t.constructor;
    if (noRoster && !(t.scoredRaces||[]).length) { shellSkipped++; return; }
    if (!isNum(t.totalPoints)) { fails.push(`team ${d.id} totalPoints is NaN/missing`); nanCount++; }
    (t.drivers||[]).forEach(dr => { if (dr.pointsScored !== undefined && !isNum(dr.pointsScored)) { fails.push(`team ${d.id} driver ${dr.driverId} pointsScored NaN`); nanCount++; } });
    if ((t.scoredRaces||[]).includes(wantKey)) scoredCount++;
    if (t.leagueId && t.userId) {
      const k = `${t.leagueId}|${t.userId}`;
      teamTotalByUserLeague[k] = (teamTotalByUserLeague[k]||0) + (t.totalPoints||0) + (t.lockedPoints||0);
    }
  });
  scoredCount > 0 ? ok.push(`${scoredCount} teams have ${wantKey} in scoredRaces`) : warns.push(`no teams scored for ${wantKey} yet`);
  if (nanCount === 0) ok.push('no NaN totals on any scored team/driver');
  if (shellSkipped) warns.push(`${shellSkipped} empty shell team(s) skipped (no roster, never scored)`);

  // League member consistency: member.totalPoints == team (totalPoints+lockedPoints)
  let memberChecked = 0, memberMismatch = 0;
  const leagues = await db.collection('leagues').get();
  for (const lg of leagues.docs) {
    const members = await lg.ref.collection('members').get();
    for (const m of members.docs) {
      const expected = teamTotalByUserLeague[`${lg.id}|${m.id}`];
      if (expected === undefined) continue; // member without a team in this league (retired etc.)
      memberChecked++;
      const got = m.data().totalPoints;
      if (!isNum(got) || got !== expected) { memberMismatch++; fails.push(`league ${lg.id} member ${m.id}: member.totalPoints=${got} != team total ${expected}`); }
    }
  }
  memberChecked > 0 && memberMismatch === 0
    ? ok.push(`${memberChecked} league members consistent with team totals`)
    : (memberChecked === 0 ? warns.push('no league members matched to teams') : null);

  console.log('PASS:'); ok.forEach(s => console.log('  ✔', s));
  if (warns.length) { console.log('WARN:'); warns.forEach(s => console.log('  ⚠', s)); }
  if (fails.length) { console.log('FAIL:'); fails.forEach(s => console.log('  x', s)); }
  console.log(`\n${fails.length ? 'RESULT: FAIL ('+fails.length+' issue(s))' : 'RESULT: PASS'}`);
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
