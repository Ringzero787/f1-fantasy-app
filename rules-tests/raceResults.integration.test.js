// F-062 writer, run against the Firestore emulator by `npm run test:rules`.
// Proves what the pure tests cannot: writing the same race twice leaves race wins unchanged,
// and a corrected result takes a win away again.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('needs FIRESTORE_EMULATOR_HOST (run via npm run test:rules)');
// Its own emulator project: the other test files clear or fill theirs in parallel.
const app = admin.apps.find((a) => a && a.name === 'race-results') || admin.initializeApp({ projectId: 'demo-uc-race-results' }, 'race-results');
const db = app.firestore();
const { writeLeagueRaceResult } = require('../functions/lib/scoring/leagueRaceResultsWriter.js');

async function seed(id, points) {
  await db.doc(`leagues/${id}`).set({ name: id, ownerId: 'u1' });
  for (const [uid, pts] of Object.entries(points)) {
    await db.doc(`leagues/${id}/members/${uid}`).set({ userId: uid, displayName: `Player ${uid}`, status: uid === 'pend' ? 'pending' : 'approved' });
    await db.doc(`fantasyTeams/${id}_${uid}`).set({ userId: uid, leagueId: id, name: `Team ${uid}` });
    if (pts !== null) await db.doc(`fantasyTeams/${id}_${uid}/raceSnapshots/round_9`).set({ userId: uid, leagueId: id, raceId: 'round_9', phases: { qualifying: { points: pts.q }, race: { points: pts.r } } });
  }
}
const load = async (id) => ({
  teams: (await db.collection('fantasyTeams').where('leagueId', '==', id).get()).docs,
  members: (await db.collection(`leagues/${id}/members`).get()).docs,
});
const wins = async (id) => Object.fromEntries((await db.collection(`leagues/${id}/members`).get()).docs.map((d) => [d.id, d.data().raceWins]));
const race = { raceId: 'round_9', season: '2026', round: 9, name: 'Harbour' };

test('weekend totals come from the snapshots, pending members are left out, and scoring twice never doubles a win', async () => {
  await seed('rr1', { u1: { q: 8, r: 80 }, u2: { q: 3, r: 85 }, u3: null, pend: { q: 50, r: 500 } });
  for (let run = 0; run < 2; run++) {
    const { teams, members } = await load('rr1');
    // u3 has no snapshot (scored before snapshots existed): the race-phase fallback is used for them only
    await writeLeagueRaceResult(db, 'rr1', race, teams, members, new Map([['u1', 999], ['u3', 40]]));
    const doc = (await db.doc('leagues/rr1/raceResults/round_9').get()).data();
    assert.deepEqual(doc.entries.map((e) => [e.userId, e.points, e.rank]), [['u1', 88, 1], ['u2', 88, 1], ['u3', 40, 3]]);
    assert.deepEqual(doc.winners, ['u1', 'u2']);
    assert.equal(doc.estimated, false);
    assert.deepEqual((await db.doc('leagues/rr1').get()).data().raceResultIds, ['round_9']);
    assert.deepEqual(await wins('rr1'), { u1: 1, u2: 1, u3: 0, pend: 0 });
  }
});

test('a corrected result moves the win, and estimated results never count', async () => {
  await seed('rr2', { u1: { q: 0, r: 70 }, u2: { q: 0, r: 60 } });
  let l = await load('rr2');
  await writeLeagueRaceResult(db, 'rr2', race, l.teams, l.members, new Map());
  assert.deepEqual(await wins('rr2'), { u1: 1, u2: 0 });
  await db.doc('fantasyTeams/rr2_u2/raceSnapshots/round_9').set({ phases: { race: { points: 90 } } }, { merge: true });
  await db.doc('leagues/rr2/raceResults/partial').set({ season: '2026', winners: ['u1'], estimated: true });
  l = await load('rr2');
  await writeLeagueRaceResult(db, 'rr2', race, l.teams, l.members, new Map());
  assert.deepEqual(await wins('rr2'), { u1: 0, u2: 1 });
});
