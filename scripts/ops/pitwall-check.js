#!/usr/bin/env node
// Is Pit Wall on track? (F-132) Reads the worker heartbeat, the newest published payload, the
// projections, this week's alerts and the race registry from Firestore, and the remaining
// meetings and their sessions from OpenF1; prints a Markdown report; exits 1 on a FAIL, 2 on a
// WARN, 0 when everything is in step. Reads only — nothing is written anywhere.
//
//   SA_KEY=… node scripts/ops/pitwall-check.js [--json]
'use strict';
const path = require('path');
const { evaluate, render } = require('./pitwall-check-lib');

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

  const [worker, racesSnap, pubSnap, projSnap, alertsSnap] = await Promise.all([
    db.collection('pw_status').doc('worker').get(),
    db.collection('races').where('seasonId', '==', SEASON).get(),
    db.collection('pw_public').orderBy('asOf', 'desc').limit(1).get(),
    db.collection('pw_projections').where('season', '==', SEASON).select('round').get(),
    db.collection('pw_alerts').where('at', '>', Date.now() - 7 * 24 * 3600 * 1000).get(),
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

  return {
    worker: worker.exists ? worker.data() : null,
    races,
    newestPublic: pubSnap.docs[0] ? pubSnap.docs[0].data() : null,
    projectionRounds,
    alerts: alertsSnap.docs.map((d) => d.data()).sort((a, b) => b.at - a.at),
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
