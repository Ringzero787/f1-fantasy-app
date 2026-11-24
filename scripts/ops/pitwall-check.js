#!/usr/bin/env node
// Is Pit Wall on track? (F-132) Reads the worker heartbeat, the newest published payload, the
// projections, this week's alerts and the race registry from Firestore, and the remaining
// meetings and their sessions from OpenF1; prints a Markdown report; exits 1 on a FAIL, 2 on a
// WARN, 0 when everything is in step. Reads only — nothing is written anywhere.
//
//   SA_KEY=… node scripts/ops/pitwall-check.js [--json]
'use strict';
const path = require('path');
const { evaluate, render, resultDiffs, isDeepRun, carMapFor } = require('./pitwall-check-lib');

// The scoring side's car-number table and the season it is for (functions/lib, built by every
// functions deploy). Optional: without a build, races with their own live-sweep map are still
// checked, and the others are reported as unchecked with a WARN (not silently passed).
let ingestionTableCache;
function ingestionTable() {
  if (ingestionTableCache === undefined) {
    try {
      const lib = path.join(__dirname, '../../functions/lib/ingestion');
      ingestionTableCache = { map: { ...require(path.join(lib, 'config.js')).DRIVER_NUMBER_TO_ID }, season: String(require(path.join(lib, 'season.js')).DRIVER_TABLE_SEASON) };
    } catch { ingestionTableCache = null; }
  }
  return ingestionTableCache;
}

const EXPECTED_PROJECT = 'f1-app-18077';
const SEASON = process.env.PW_SEASON || '2026';
const OPENF1 = process.env.OPENF1_BASE || 'https://api.openf1.org/v1';

// OpenF1 rate-limits anonymous callers (429); two calls a run, each retried with a pause.
async function openf1(pathname, attempt = 1) {
  const res = await fetch(`${OPENF1}${pathname}`, { signal: AbortSignal.timeout(20000), headers: { accept: 'application/json' } });
  if (res.status === 429 && attempt < 4) { await new Promise((r) => setTimeout(r, 3000 * attempt)); return openf1(pathname, attempt + 1); }
  if (!res.ok) throw new Error(`OpenF1 ${pathname} → ${res.status}`);
  return res.json();
}

async function collect() {
  const key = process.env.SA_KEY;
  if (!key) throw new Error('SA_KEY must point at the service-account key (see ~/.config/aidlc/env)');
  const cred = require(path.resolve(key));
  if (cred.project_id !== EXPECTED_PROJECT) throw new Error(`key is for project ${cred.project_id}, expected ${EXPECTED_PROJECT}`);
  const admin = require(require.resolve('firebase-admin', { paths: [process.env.PW_ADMIN_MODULES || path.join(__dirname, '../../functions/node_modules')] }));
  admin.initializeApp({ credential: admin.credential.cert(cred), projectId: EXPECTED_PROJECT });
  const db = admin.firestore();
  const toIso = (v) => (v && typeof v.toDate === 'function' ? v.toDate().toISOString() : v);

  const [worker, racesSnap, pubSnap, projSnap, alertsSnap, jobsSnap, heldSnap, approvedSnap] = await Promise.all([
    db.collection('pw_status').doc('worker').get(),
    db.collection('races').where('seasonId', '==', SEASON).get(),
    db.collection('pw_public').orderBy('asOf', 'desc').limit(1).get(),
    db.collection('pw_projections').where('season', '==', SEASON).select('round').get(),
    db.collection('pw_alerts').where('at', '>', Date.now() - 7 * 24 * 3600 * 1000).get(),
    // the open queue (F-133): a due job still queued an hour later means the worker is not claiming
    db.collection('pw_jobs').where('status', 'in', ['queued', 'leased', 'failed']).get(),
    // results the ingestion is holding (F-135): a parked race is silent — Mexico 2026 sat unscored overnight
    db.collection('pendingResults').where('status', '==', 'pending').get(),
    // F-152: results that scored with a car resolved by name — the driver table needs the number
    db.collection('pendingResults').where('status', '==', 'approved').select('round', 'fetchedAt', 'warnings').get(),
  ]);
  const races = racesSnap.docs.map((d) => {
    const r = d.data();
    const schedule = Object.fromEntries(Object.entries(r.schedule || {}).map(([k, v]) => [k, toIso(v)]));
    return { id: d.id, round: r.round, status: r.status, name: r.name, schedule };
  });
  const projectionRounds = [...new Set(projSnap.docs.map((d) => Number((d.data().round && d.data().round.number) ?? d.data().round)).filter((n) => Number.isFinite(n)))];

  const meetings = (await openf1(`/meetings?year=${SEASON}`)).map((m) => ({ meeting_key: m.meeting_key, meeting_name: m.meeting_name, date_start: m.date_start, circuit_short_name: m.circuit_short_name }));
  // one call for the season's sessions, grouped by meeting
  await new Promise((r) => setTimeout(r, 1500));
  const sessions = await openf1(`/sessions?year=${SEASON}`);
  for (const m of meetings) {
    const own = sessions.filter((s) => s.meeting_key === m.meeting_key);
    m.sessions = own.map((s) => ({ session_name: s.session_name, date_start: s.date_start }));
    const race = own.find((s) => s.session_name === 'Race');
    m.raceStart = race ? race.date_start : null;
  }

  // F-168: races scored in the last 7 days against the provider's classification now, every run.
  // Every older race of the season once a day (the 07 UTC run, or PW_CHECK_DEEP=1): a late appeal or
  // stewards' decision can change a result weeks later. The car numbers come from the race's own
  // live-sweep map, so a stand-in resolves as it was scored.
  const deep = isDeepRun(new Date(), process.env);
  // the newest completed race: the only one the correctRaceResults op can fix (F-168 refuses an older
  // race once a later one has scored); an older one needs the post-season past-race correction (F-173)
  const completedRounds = racesSnap.docs.map((x) => x.data()).filter((x) => x.status === 'completed').map((x) => x.round || 0);
  const latestRound = completedRounds.length ? Math.max(...completedRounds) : null;
  const resultDrift = [];
  for (const d of racesSnap.docs) {
    const r = d.data();
    const raceAt = toIso(r.schedule && r.schedule.race);
    if (r.status !== 'completed' || !raceAt) continue;
    const recent = Date.now() - new Date(raceAt).getTime() <= 7 * 24 * 3600 * 1000;
    if (!deep && !recent) continue;
    const raceSession = sessions.find((x) => x.session_name === 'Race' && Math.abs(new Date(x.date_start).getTime() - new Date(raceAt).getTime()) < 36 * 3600 * 1000);
    const live = await db.collection('races').doc(d.id).collection('live').doc('positions').get();
    // the race's own map first (a stand-in as it was scored), the ingestion table under it for
    // races from before the live sweep and for a car the sweep never saw
    const car = carMapFor((live.exists && live.data().numberToId) || null, ingestionTable(), r.seasonId);
    const numberToId = car.map;
    if (!raceSession || !Object.keys(numberToId).length) {
      resultDrift.push({ raceId: d.id, round: r.round, raceAt, unchecked: !raceSession ? 'no provider Race session' : car.missing, uncheckedLevel: raceSession && car.warn ? 'warn' : 'ok' });
      continue;
    }
    await new Promise((res) => setTimeout(res, 1500));
    let provider;
    try { provider = await openf1(`/session_result?session_key=${raceSession.session_key}`); }
    catch (e) {
      // an older race (daily pass) must not take the whole check down with it: one 401/429 marks it
      // unchecked; a recent race keeps the old behaviour (the run fails and says why)
      if (recent) throw e;
      resultDrift.push({ raceId: d.id, round: r.round, raceAt, unchecked: `provider error (${String(e.message).slice(0, 80)})`, uncheckedLevel: 'ok' });
      continue;
    }
    resultDrift.push({ raceId: d.id, round: r.round, raceAt, latest: r.round === latestRound, diffs: resultDiffs((r.results && r.results.raceResults) || [], provider, numberToId) });
  }

  return {
    resultDrift,
    worker: worker.exists ? worker.data() : null,
    races,
    newestPublic: pubSnap.docs[0] ? pubSnap.docs[0].data() : null,
    projectionRounds,
    alerts: alertsSnap.docs.map((d) => d.data()).sort((a, b) => b.at - a.at),
    jobs: jobsSnap.docs.map((d) => { const j = d.data(); return { id: d.id, status: j.status, notBefore: j.notBefore, attempts: j.attempts, leaseUntil: j.leaseUntil, lastError: j.lastError ? String(j.lastError).replace(/\s+/g, ' ').slice(0, 200) : null }; }), // one line, bounded: it lands inside the triage fence
    held: heldSnap.docs.map((d) => { const p = d.data(); return { raceId: d.id, round: p.round, fetchedAt: toIso(p.fetchedAt), blockedReason: p.blockedReason ? String(p.blockedReason).replace(/\s+/g, ' ').slice(0, 200) : null }; }),
    resolved: approvedSnap.docs.map((d) => {
      const p = d.data();
      const lines = (Array.isArray(p.warnings) ? p.warnings : []).filter((w) => typeof w === 'string' && w.startsWith('Resolved by name'));
      return { raceId: d.id, round: p.round, fetchedAt: toIso(p.fetchedAt), lines: lines.map((w) => w.replace(/\s+/g, ' ').slice(0, 200)) };
    }).filter((r) => r.lines.length > 0),
    meetings,
  };
}

(async () => {
  const state = await collect();
  const result = evaluate(state);
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else process.stdout.write(render(result));
  process.exit(result.worst === 'fail' ? 1 : result.worst === 'warn' ? 2 : 0);
})().catch((e) => { console.error(`pitwall-check: ${e.message}`); process.exit(3); });
