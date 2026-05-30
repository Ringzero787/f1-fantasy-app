/**
 * One-off data repair: fix double-counted team totals.
 *
 * Bug: when a team's drivers/constructor expired, their points were banked into
 * lockedPoints but never removed from totalPoints. The leaderboard + client show
 * totalPoints + lockedPoints, so those teams display ~2x their real points.
 * (The live code fix in calculatePoints.ts Phase 3.5 prevents this going forward.)
 *
 * This script de-doubles existing data under the intended model:
 *   totalPoints = active-roster points (sum of current drivers/constructor),
 *   lockedPoints = banked points from expired entities (unchanged),
 *   displayed total = totalPoints + lockedPoints.
 * For affected teams (totalPoints == lockedPoints, roster summing to 0), it sets
 * totalPoints = active-roster sum (0), leaving lockedPoints as the lifetime total.
 * Then it recomputes league-member totalPoints + rank from the corrected teams.
 *
 * READ-ONLY by default. Pass --apply to write.
 *   GOOGLE_APPLICATION_CREDENTIALS=<sa.json> node repair-dedouble.js [--apply]
 */
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'f1-app-18077' });
const db = admin.firestore();
const APPLY = process.argv.includes('--apply');

(async () => {
  const teamsSnap = await db.collection('fantasyTeams').get();

  const teams = teamsSnap.docs.map(d => {
    const t = d.data();
    const tp = t.totalPoints || 0;
    const lp = t.lockedPoints || 0;
    const rosterSum = (t.drivers || []).reduce((s, x) => s + (x.pointsScored || 0), 0)
      + (t.constructor?.pointsScored || 0);
    const doubled = lp > 0 && tp === lp;            // double-count pattern
    const newTp = doubled ? rosterSum : tp;          // de-double → active-roster only
    return {
      ref: d.ref, id: d.id, name: t.name || '?', user: t.userId,
      league: t.leagueId || null, tp, lp, rosterSum, doubled, newTp,
      changed: newTp !== tp,
    };
  });

  // Safety check: doubled teams should have an empty active roster (rosterSum 0).
  const unexpected = teams.filter(t => t.doubled && t.rosterSum !== 0);
  if (unexpected.length) {
    console.log('⚠️  doubled teams with non-zero active roster (review before applying):');
    unexpected.forEach(t => console.log(`   ${t.name}: tp=${t.tp} lp=${t.lp} rosterSum=${t.rosterSum}`));
  }

  const teamOps = teams.filter(t => t.changed).map(t => ({ ref: t.ref, data: { totalPoints: t.newTp } }));

  console.log(`\n=== TEAM totalPoints CHANGES (${teamOps.length}) ===`);
  teams.filter(t => t.changed).sort((a, b) => (b.tp + b.lp) - (a.tp + a.lp)).forEach(t => {
    console.log(`  ${t.name}: display ${t.tp + t.lp} → ${t.newTp + t.lp}   (totalPoints ${t.tp} → ${t.newTp}, lockedPoints ${t.lp} unchanged)`);
  });

  // Recompute league members from corrected team values
  const leagues = [...new Set(teams.filter(t => t.league).map(t => t.league))];
  const memberOps = [];
  for (const lg of leagues) {
    const lgTeams = teams.filter(t => t.league === lg);
    const byUser = new Map();
    lgTeams.forEach(t => byUser.set(t.user, (byUser.get(t.user) || 0) + (t.newTp + t.lp)));

    const lgName = (await db.collection('leagues').doc(lg).get()).data()?.name || lg;
    const membersSnap = await db.collection('leagues').doc(lg).collection('members').get();
    const rows = membersSnap.docs.map(m => ({
      ref: m.ref, id: m.id, old: m.data().totalPoints || 0, oldRank: m.data().rank,
      new: byUser.has(m.id) ? byUser.get(m.id) : (m.data().totalPoints || 0),
    }));
    rows.sort((a, b) => b.new - a.new).forEach((r, i) => { r.newRank = i + 1; });

    const changed = rows.filter(r => r.new !== r.old || r.newRank !== r.oldRank);
    if (changed.length) {
      console.log(`\n--- league "${lgName}" member changes ---`);
      rows.filter(r => r.new !== r.old).forEach(r =>
        console.log(`  ${r.id.slice(0, 8)}…  total ${r.old} → ${r.new}   rank ${r.oldRank}→${r.newRank}`));
      changed.forEach(r => memberOps.push({ ref: r.ref, data: { totalPoints: r.new, rank: r.newRank } }));
    }
  }

  console.log(`\n=== PLAN ===`);
  console.log(`team docs to update:   ${teamOps.length}`);
  console.log(`member docs to update: ${memberOps.length}`);
  console.log(APPLY ? '\nAPPLYING…' : '\nDRY RUN — no writes. Re-run with --apply to commit.');

  if (APPLY) {
    const all = [...teamOps, ...memberOps];
    for (let i = 0; i < all.length; i += 400) {
      const batch = db.batch();
      all.slice(i, i + 400).forEach(op => batch.set(op.ref, op.data, { merge: true }));
      await batch.commit();
    }
    console.log(`Committed ${all.length} writes.`);
  }
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
