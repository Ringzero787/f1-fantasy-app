// F-154: doctor a copy of production in the Firestore EMULATOR so the season rollover can be
// rehearsed before the real season has finished. Never production: it refuses unless
// FIRESTORE_EMULATOR_HOST is a loopback address, which makes the Admin SDK talk to the emulator only.
//
// What it changes in the copy, and why (the rollover refuses to write until all of these hold):
//   - every FROM race that is neither completed nor cancelled → completed, its race time moved to
//     48 h ago (the rollover waits 24 h after the last race);
//   - each of those races gets raceScores rows: a copy of the latest completed race's rows under
//     the new race id, so prices see a plausible extra race instead of a missed one;
//   - pendingResults still pending for FROM → status 'rehearsal-cleared';
//   - Moonshot calls of FROM not settled or cancelled → CANCELLED.
//   - seasons/FROM.resetNotice.sentAt → 48 h ago and emailAt → 47 h ago, as if sendSeasonNotice.js
//     and stampSeasonNoticeEmail.js had run (F-155 gate).
//   - with --hostile-fields: three teams get top-level fields a player could write to their own team
//     (`a.b`, `x*y`, `odd~[name]`), to prove the reset still clears them (F-154 security review).
// The full procedure is scripts/ops/rollover-rehearsal.sh; the results are in .aidlc/specs/F-150.md.
//
// Usage: node scripts/ops/rehearsal-doctor.js --emulator=127.0.0.1:8791 [--write]
const FROM = '2026';
const { firestoreTarget } = require('./_paths');

/** Null when this run would reach a loopback emulator; otherwise why it refuses. Production is never an option here. */
function refuseUnlessEmulator(argv, env) {
  const t = firestoreTarget(argv, env);
  if (t.error) return t.error;
  return t.target === 'emulator' ? null : 'pass --emulator=HOST:PORT: this script only ever doctors an emulator copy.';
}

async function main(write) {
  const { db } = require('./_firestore');
  const now = Date.now();
  const { Timestamp } = require(require.resolve('firebase-admin', { paths: [require('path').join(__dirname, '..', '..', 'functions')] })).firestore;
  const races = (await db.collection('races').where('seasonId', '==', FROM).get()).docs;
  const open = races.filter((d) => !['completed', 'cancelled'].includes(d.data().status));
  const raceMs = (d) => { const t = d.data().schedule && d.data().schedule.race; return t && typeof t.toMillis === 'function' ? t.toMillis() : 0; };
  const completed = races.filter((d) => d.data().status === 'completed').sort((a, b) => raceMs(a) - raceMs(b));
  const template = completed[completed.length - 1];
  if (!template) throw new Error(`no completed ${FROM} race to copy raceScores from`);
  const rows = (await db.collection('raceScores').where('raceId', '==', template.id).get()).docs;
  const ops = [];
  for (const r of open) {
    const sched = { ...r.data().schedule, race: Timestamp.fromMillis(now - 48 * 3600e3) };
    ops.push([`races/${r.id}`, 'update', { status: 'completed', schedule: sched, rehearsalDoctored: true }]);
    for (const s of rows) ops.push([`raceScores/${r.id}__${s.data().entityId}`, 'set', { ...s.data(), raceId: r.id, round: r.data().round, rehearsalDoctored: true }]);
  }
  for (const p of (await db.collection('pendingResults').where('status', '==', 'pending').get()).docs) {
    if (p.id.endsWith(`_${FROM}`)) ops.push([`pendingResults/${p.id}`, 'update', { status: 'rehearsal-cleared' }]);
  }
  const fromIds = new Set(races.map((d) => d.id));
  for (const m of (await db.collection('moonshots').get()).docs) {
    const d = m.data();
    if ((d.seasonId === FROM || fromIds.has(d.raceId)) && d.status !== 'CANCELLED' && !d.settledAt) ops.push([`moonshots/${m.id}`, 'update', { status: 'CANCELLED', rehearsalDoctored: true }]);
  }
  // F-155: the rollover refuses until players were told; the copy holds no users, so nobody is
  ops.push([`seasons/${FROM}`, 'set-merge', { resetNotice: { sentAt: Timestamp.fromMillis(now - 48 * 3600e3), emailAt: Timestamp.fromMillis(now - 47 * 3600e3), rehearsalDoctored: true } }]);
  if (process.argv.includes('--hostile-fields')) {
    for (const t of (await db.collection('fantasyTeams').limit(3).get()).docs) ops.push([`fantasyTeams/${t.id}`, 'set-merge', { 'a.b': 1, 'x*y': 2, 'odd~[name]': 3 }]);
  }
  console.log(`emulator ${process.env.FIRESTORE_EMULATOR_HOST}: ${open.length} race(s) to complete (${open.map((d) => d.id).join(', ') || 'none'}), raceScores copied from ${template.id} (${rows.length} rows each), ${ops.length} writes`);
  if (!write) { console.log('dry run: pass --write'); return; }
  let batch = db.batch(), n = 0;
  for (const [p, kind, data] of ops) {
    if (kind === 'set') batch.set(db.doc(p), data);
    else if (kind === 'set-merge') batch.set(db.doc(p), data, { merge: true });   // set() keys are literal, as a client's are
    else batch.update(db.doc(p), data);
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
  console.log(`doctored: ${n} writes`);
}

module.exports = { refuseUnlessEmulator };

if (require.main === module) {
  const why = refuseUnlessEmulator(process.argv.slice(2), process.env);
  if (why) { console.error(why); process.exit(2); }
  main(process.argv.includes('--write')).then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
}
