// One-shot cleanup (2026-07-19), run by hand.
//
// The 2026-05-17 generator run (bad-config era — same run that made the
// phantom belgium sprint doc) bulk-posted ben_lines for EVERY future race.
// Those stale docs (a) carry May model data nobody should bet on and (b)
// defeat the lineup's post-race recap hold, which releases as soon as the
// next race "has lines" — that's why the Belgium recap never showed.
//
// Clears entities + posted on every upcoming race's line docs not touched
// since 2026-07-01. The weekly Ben pipeline reseeds each race for real as
// its weekend approaches (seedBenLines / tlGenerateBenLinesLite both merge).
const admin = require('../node_modules/firebase-admin');
admin.initializeApp({ projectId: 'f1-app-18077' });
const db = admin.firestore();

const CUTOFF = new Date('2026-07-01').getTime();

(async () => {
  const races = await db.collection('races').where('status', '==', 'upcoming').get();
  let cleared = 0;
  for (const race of races.docs) {
    for (const s of ['qualifying', 'race', 'sprint']) {
      const ref = db.doc(`ben_lines/${race.id}_${s}`);
      const d = await ref.get();
      if (!d.exists) continue;
      const upd = d.get('updatedAt')?.toDate?.()?.getTime() ?? 0;
      const ents = Object.keys(d.get('entities') ?? {}).length;
      if (upd < CUTOFF && ents > 0) {
        await ref.set(
          {
            entities: {},
            posted: false,
            stalePrepostClearedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        cleared++;
        console.log('cleared', `${race.id}_${s}`, `(${ents} stale entities)`);
      }
    }
  }
  console.log(`done — ${cleared} docs cleared`);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
