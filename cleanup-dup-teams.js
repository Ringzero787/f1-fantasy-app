/**
 * One-off: remove duplicate teams so each (user, league) is 1:1, then recompute
 * the affected leagues' member totals + ranks from the remaining single teams.
 * Per user decision (2026-05-30): keep Nathan Legit Team (Too Legit) and
 * Nathan Pedal Team (Pedal); delete the two extra "Nathan's Team" entries.
 *
 * READ-ONLY by default. Pass --apply to write/delete.
 *   GOOGLE_APPLICATION_CREDENTIALS=<sa.json> node cleanup-dup-teams.js [--apply]
 */
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'f1-app-18077' });
const db = admin.firestore();
const APPLY = process.argv.includes('--apply');

const DELETE_TEAM_IDS = [
  'Z1pwIYD2MkXebALj5Qrw', // "Nathan's Team" in Too Legit to Quit (extra)
  'pdyij5dT3JDU8k1MAqrX', // "Nathan's Team" in Pedal To The Metal (extra)
];

(async () => {
  // Fetch the teams to delete (to learn their leagues + confirm identity)
  const delDocs = [];
  for (const id of DELETE_TEAM_IDS) {
    const d = await db.collection('fantasyTeams').doc(id).get();
    if (!d.exists) { console.log(`  (already gone: ${id})`); continue; }
    delDocs.push(d);
  }
  console.log('=== TEAMS TO DELETE ===');
  delDocs.forEach(d => {
    const t = d.data();
    console.log(`  ${d.id}  "${t.name}"  league ${t.leagueId}  display ${(t.totalPoints||0)+(t.lockedPoints||0)}`);
  });

  const affectedLeagues = [...new Set(delDocs.map(d => d.data().leagueId).filter(Boolean))];

  if (APPLY) {
    for (const d of delDocs) await d.ref.delete();
    console.log(`\nDeleted ${delDocs.length} team docs.`);
  }

  // Recompute affected leagues from remaining teams (post-delete view)
  const deletedSet = new Set(DELETE_TEAM_IDS);
  for (const lg of affectedLeagues) {
    const lgDoc = await db.collection('leagues').doc(lg).get();
    const lgName = lgDoc.data()?.name || lg;
    const teamsSnap = await db.collection('fantasyTeams').where('leagueId', '==', lg).get();
    const byUser = new Map();
    teamsSnap.docs.forEach(d => {
      if (!APPLY && deletedSet.has(d.id)) return; // simulate deletion in dry-run
      const t = d.data();
      byUser.set(t.userId, (byUser.get(t.userId) || 0) + ((t.totalPoints||0) + (t.lockedPoints||0)));
    });

    const membersSnap = await db.collection('leagues').doc(lg).collection('members').get();
    const rows = membersSnap.docs.map(m => ({
      ref: m.ref, id: m.id, old: m.data().totalPoints||0, oldRank: m.data().rank,
      new: byUser.has(m.id) ? byUser.get(m.id) : (m.data().totalPoints||0),
    }));
    rows.sort((a,b)=>b.new-a.new).forEach((r,i)=>{ r.newRank=i+1; });

    console.log(`\n=== league "${lgName}" recomputed standings ===`);
    rows.forEach(r => {
      const mark = (r.new!==r.old||r.newRank!==r.oldRank) ? '  <-- changed' : '';
      console.log(`  #${r.newRank} (was #${r.oldRank})  ${r.new} (was ${r.old})  ${r.id.slice(0,8)}…${mark}`);
    });

    if (APPLY) {
      const batch = db.batch();
      rows.forEach(r => batch.set(r.ref, { totalPoints: r.new, rank: r.newRank }, { merge: true }));
      await batch.commit();
      console.log(`  committed ${rows.length} member updates`);
    }
  }

  console.log(APPLY ? '\nDONE (applied).' : '\nDRY RUN — no writes. Re-run with --apply.');
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
