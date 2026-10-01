// Repair races/{raceId}.schedule + hasSprint from the bundled seed data — the
// tl-script aidlc op.
//
// Usage (from newgame/functions):
//   node scripts/fixRaceSchedules.js            dry run — prints every change
//   node scripts/fixRaceSchedules.js --write    apply
//
// Why this exists rather than just re-running tlSeedRaces: that endpoint writes
// with { merge: true } (seedRaces.ts:52), which updates fields but never removes
// them. The live docs carry keys the seed file does not — usa_2026 has a stray
// schedule.sprint/sprintQualifying, singapore_2026 has fp2/fp3 that a sprint
// weekend does not run. A merge would leave both in place, and the app treats
// `!!hasSprint || !!schedule.sprint` as "sprint weekend"
// (app/(tabs)/index.tsx:204), so the phantom Sprint tab would survive even after
// hasSprint flipped to false. This script deletes those extra keys explicitly.
//
// The seed file is the source of truth and is correct; only Firestore drifted
// (every round R18-R24 holds the PREVIOUS round's weekend).
//
// COMPLETED races are skipped. Their results are settled and a few of them
// differ from the seed by an hour or two; rewriting history buys nothing and
// risks disturbing already-graded weekends.

const SEED = require('../src/triggers/_seedRacesData.json');

const seedRaces = () => (Array.isArray(SEED) ? SEED : SEED.races || Object.values(SEED));

// Firestore Timestamp | ISO string | Date -> ISO string (null when absent).
function toIso(v) {
  if (v == null) return null;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }
  if (typeof v._seconds === 'number') return new Date(v._seconds * 1000).toISOString();
  return null;
}

// What must change on one race for its schedule to match the seed exactly.
// Pure: takes plain objects, returns { sets, deletes, hasSprint }.
function planScheduleFix(dbRace, seedRace) {
  const plan = { sets: {}, deletes: [], hasSprint: undefined };
  const dbS = (dbRace && dbRace.schedule) || {};
  const sS = (seedRace && seedRace.schedule) || {};
  for (const [k, v] of Object.entries(sS)) {
    const want = toIso(v);
    if (want && toIso(dbS[k]) !== want) plan.sets[k] = want;
  }
  for (const k of Object.keys(dbS)) if (!(k in sS)) plan.deletes.push(k);
  plan.deletes.sort();
  if (!!(dbRace && dbRace.hasSprint) !== !!(seedRace && seedRace.hasSprint)) {
    plan.hasSprint = !!(seedRace && seedRace.hasSprint);
  }
  return plan;
}

const hasChanges = (plan) =>
  Object.keys(plan.sets).length > 0 || plan.deletes.length > 0 || plan.hasSprint !== undefined;

// Static facts the seed file owns: where a race sits in the season, and its
// identity. Deliberately a whitelist rather than a blanket sync — `status` is
// lifecycle state the app owns, and copying it wholesale from the seed would
// regress completed races back to "upcoming".
const SEED_OWNED_FIELDS = [
  'round',
  'name',
  'officialName',
  'circuitId',
  'circuitName',
  'country',
  'city',
  'timezone',
];

// Field-level changes outside `schedule`. Pure.
//
// `status` gets exactly one allowed transition: a race the DB holds as
// `cancelled` that the seed now lists otherwise — a reinstatement, like the
// 2026 Bahrain GP revived and run at Sepang. A `completed` race is never
// touched, so a settled weekend can't be reopened.
function planFieldFix(dbRace, seedRace) {
  const out = {};
  if (!dbRace || !seedRace) return out;
  for (const k of SEED_OWNED_FIELDS) {
    const want = seedRace[k];
    if (want === undefined) continue;
    if (dbRace[k] !== want) out[k] = want;
  }
  if (dbRace.status !== 'completed' && dbRace.status === 'cancelled' && seedRace.status && seedRace.status !== 'cancelled') {
    out.status = seedRace.status;
  }
  return out;
}

// Only races still to run. Completed weekends are settled history.
const isRepairable = (dbRace) => (dbRace && dbRace.status) !== 'completed';

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const i = a.indexOf('=');
      return i < 0 ? [a.replace(/^--/, ''), true] : [a.slice(2, i), a.slice(i + 1)];
    })
  );

  const admin = require('../node_modules/firebase-admin');
  admin.initializeApp({ projectId: 'f1-app-18077' });
  const db = admin.firestore();

  const byId = {};
  for (const r of seedRaces()) byId[r.id] = r;

  const snap = await db.collection('races').where('seasonId', '==', '2026').get();
  const docs = snap.docs
    .map((d) => ({ id: d.id, ref: d.ref, data: d.data() }))
    .sort((a, b) => (a.data.round || 0) - (b.data.round || 0));

  let changed = 0;
  let skippedCompleted = 0;
  const writes = [];

  for (const { id, ref, data } of docs) {
    const seedRace = byId[id];
    if (!seedRace) {
      console.log(`  ! ${id}: no entry in the seed file — left alone`);
      continue;
    }
    if (!isRepairable(data)) {
      const p = planScheduleFix(data, seedRace);
      if (hasChanges(p)) skippedCompleted++;
      continue;
    }
    const plan = planScheduleFix(data, seedRace);
    const fields = planFieldFix(data, seedRace);
    if (!hasChanges(plan) && Object.keys(fields).length === 0) continue;

    changed++;
    console.log(`R${data.round} ${id} [${data.status}]`);
    for (const [k, v] of Object.entries(plan.sets)) {
      console.log(`    ${k}: ${toIso(data.schedule && data.schedule[k])} -> ${v}`);
    }
    for (const k of plan.deletes) {
      console.log(`    ${k}: ${toIso(data.schedule && data.schedule[k])} -> DELETE (not in seed)`);
    }
    if (plan.hasSprint !== undefined) {
      console.log(`    hasSprint: ${!!data.hasSprint} -> ${plan.hasSprint}`);
    }
    for (const [k, v] of Object.entries(fields)) {
      console.log(`    ${k}: ${JSON.stringify(data[k])} -> ${JSON.stringify(v)}`);
    }

    const update = {};
    for (const [k, v] of Object.entries(plan.sets)) {
      update[`schedule.${k}`] = admin.firestore.Timestamp.fromDate(new Date(v));
    }
    for (const k of plan.deletes) update[`schedule.${k}`] = admin.firestore.FieldValue.delete();
    if (plan.hasSprint !== undefined) update.hasSprint = plan.hasSprint;
    Object.assign(update, fields);
    writes.push({ ref, update, id });
  }

  console.log(
    `\n${changed} race(s) need repair; ${skippedCompleted} completed race(s) also differ but are left as settled history.`
  );
  if (!changed) return;

  if (!args.write) {
    console.log('\nDRY RUN — pass --write to apply');
    return;
  }

  const batch = db.batch();
  for (const w of writes) batch.update(w.ref, w.update);
  await batch.commit();
  console.log(`wrote ${writes.length} race doc(s)`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = { toIso, planScheduleFix, planFieldFix, hasChanges, isRepairable, seedRaces, SEED_OWNED_FIELDS };
