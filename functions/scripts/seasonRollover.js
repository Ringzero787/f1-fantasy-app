// F-150: roll Undercut from one season to the next — archive the finished season, reset teams and
// league tables to a fresh start, re-price drivers and constructors from the season's per-race
// scores, and seed the next season's race calendar from OpenF1.
//
// The owner's decisions (2026-11-15) are in functions/src/season/rollover.ts. Run it once, after the
// final race of FROM is scored and its correction window has closed: the script refuses to write
// before that. Every write belongs to an atomic group (one team with its archive, one league with its
// members and archive, all prices, the calendar, the season switch), committed in order, so a failure
// leaves whole groups behind and a re-run finishes the rest: a team or league whose archive exists is
// done, a priced entity is stamped `pricedFor`, races are only created (rollover.ts planRollover).
//
// Dry run by default: prints the preconditions, every price, every league's champion and the new
// calendar, plus the backup path list for the op. `--apply` writes. FROM / TO / pricing live in this
// file and in rollover.ts. Flags (F-154):
//   --paths-out=FILE    dry run: write the backup path list to FILE, one path per line. The
//                       uc-season-rollover op backs up exactly that file's paths.
//   --paths-check=FILE  apply: refuse unless every path the run will write is captured by FILE
//                       (something created since the dry run would otherwise escape the backup).
//   --emulator=HOST:PORT  rehearsal only: read and write the Firestore emulator at a loopback
//                       address. The service-account key is never loaded, so nothing in the run
//                       can authenticate to production (the key's project check is not needed).
//   --fail-after=N      rehearsal only, needs --emulator: stop dead after N committed groups, to
//                       rehearse a run that dies halfway.
const path = require('path');
const fs = require('fs');

const EXPECTED_PROJECT = 'f1-app-18077';
const FROM = '2026';
const TO = '2027';
/** Hours after the last FROM race before a rollover may write: the results correction pass runs for 6 h. */
const SETTLE_HOURS = 24;

// Nothing happens on import: the key read and initializeApp sit in initAdmin, which only the
// require.main guard at the foot calls (scripts/seedGuards.test.js holds every op script to this).
let db;
let admin;

function initAdmin(conn) {
  admin = require('firebase-admin');
  if (!conn.useKey) {
    // emulator: no credential at all, so nothing here can authenticate to production
    process.env.FIRESTORE_EMULATOR_HOST = conn.emulator;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    admin.initializeApp({ projectId: EXPECTED_PROJECT });
    db = admin.firestore();
    return;
  }
  const KEY = process.env.SA_KEY;
  if (!KEY) {
    console.error('SA_KEY must point at the service-account key (set by aidlc op from ~/.config/aidlc/env).');
    process.exit(2);
  }
  const cred = require(KEY);
  if (cred.project_id !== EXPECTED_PROJECT) {
    console.error(`Refusing to run: key is for project ${cred.project_id}, expected ${EXPECTED_PROJECT}.`);
    process.exit(2);
  }
  admin.initializeApp({ credential: admin.credential.cert(cred), projectId: EXPECTED_PROJECT });
  db = admin.firestore();
}

function lib(name) {
  try {
    return require(path.join(__dirname, '..', 'lib', 'season', name));
  } catch (e) {
    console.error(`functions/lib is not built (${e.message}). Run: npm --prefix functions run build`);
    process.exit(2);
  }
}

const toMs = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : v ? new Date(v).getTime() : NaN);

async function openf1(pathAndQuery) {
  const res = await fetch(`https://api.openf1.org/v1/${pathAndQuery}`, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`OpenF1 ${pathAndQuery}: HTTP ${res.status}`);
  return res.json();
}

/** A plan op as a batch write: sentinels become server values. */
function toBatch(batch, op, R) {
  const data = Object.fromEntries(Object.entries(op.data).map(([k, v]) => [k, v === R.DELETE ? admin.firestore.FieldValue.delete() : v === R.NOW ? admin.firestore.FieldValue.serverTimestamp() : v]));
  const ref = db.doc(op.path);
  const call = R.writeCall(op);
  if (call.method !== 'set') batch[call.method](ref, data);
  else if ('mergeFields' in call.options) {
    // each name as ONE literal segment: a string is parsed as a path, so a team field a player named
    // `a.b` (or with * ~ [ ]) would fail the write — and every re-run with it
    batch.set(ref, data, { mergeFields: call.options.mergeFields.map((k) => new admin.firestore.FieldPath(k)) });
  } else batch.set(ref, data, call.options);
}

/** ISO strings in a race or season document become Timestamps on write. */
const SCHEDULE_TO_TS = (r) => ({ ...r, schedule: Object.fromEntries(Object.entries(r.schedule).map(([k, v]) => [k, admin.firestore.Timestamp.fromDate(new Date(v))])) });

async function main(conn) {
  const { apply } = conn;
  const R = lib('rollover.js');
  const { buildCalendar } = lib('calendar.js');
  console.log(`SEASON ROLLOVER ${FROM} → ${TO} · project ${EXPECTED_PROJECT}${conn.emulator ? ` · EMULATOR ${conn.emulator} (rehearsal; production unreachable)` : ''} · ${apply ? 'APPLY' : 'dry run'} · ${new Date().toISOString()}`);

  // ── preconditions (read here, judged by rollover.ts rolloverBlockers) ───────────────────────
  const fromSeason = (await db.doc(`seasons/${FROM}`).get()).data() || {};
  const appCfg = (await db.doc('config/app').get()).data() || {};
  const fromRaces = (await db.collection('races').where('seasonId', '==', FROM).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const completed = fromRaces.filter((r) => r.status === 'completed');
  const pendingResultIds = (await db.collection('pendingResults').where('status', '==', 'pending').get()).docs.map((d) => d.id);

  // ── read ───────────────────────────────────────────────────────────────────────────────────
  const archived = async (ref) => (await ref.collection('seasons').doc(FROM).get()).exists;
  const teams = [];
  for (const d of (await db.collection('fantasyTeams').get()).docs) teams.push({ id: d.id, data: d.data(), archived: await archived(d.ref) });
  const leagues = [];
  for (const l of (await db.collection('leagues').get()).docs) {
    const members = (await l.ref.collection('members').get()).docs.map((m) => ({ id: m.id, ...m.data() }));
    leagues.push({ id: l.id, data: l.data(), archived: await archived(l.ref), members });
  }
  const entities = [];
  for (const coll of ['drivers', 'constructors']) {
    for (const d of (await db.collection(coll).get()).docs) entities.push({ coll, id: d.id, data: d.data() });
  }
  const fromIds = new Set(completed.map((r) => r.id));
  const scores = {};
  const scoredRaceIds = new Set();
  for (const d of (await db.collection('raceScores').get()).docs) {
    const s = d.data();
    if (typeof s.raceId === 'string') scoredRaceIds.add(s.raceId);
    if (!fromIds.has(s.raceId) || typeof s.entityId !== 'string') continue;
    const e = (scores[s.entityId] ||= { races: 0, points: 0 });
    e.races++;
    e.points += typeof s.totalPoints === 'number' ? s.totalPoints : 0;
  }
  const [meetings, sessions] = await Promise.all([openf1(`meetings?year=${TO}`), openf1(`sessions?year=${TO}`)]);
  const calendar = buildCalendar(Number(TO), meetings, sessions);
  const allFromIds = new Set(fromRaces.map((r) => r.id));
  const moonshots = (await db.collection('moonshots').get()).docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((m) => m.seasonId === FROM || allFromIds.has(m.raceId));
  const blockers = R.rolloverBlockers({
    from: FROM, to: TO, now: Date.now(), settleHours: SETTLE_HOURS,
    fromSeason, currentSeason: appCfg.currentSeason,
    fromRaces: fromRaces.map((r) => ({ id: r.id, status: r.status, raceTimeMs: toMs(r.schedule && r.schedule.race) })),
    pendingResultIds, scoredRaceIds: [...scoredRaceIds], moonshots, calendarSize: calendar.length,
  });
  const existingRaces = (await db.collection('races').where('seasonId', '==', TO).get()).docs.map((d) => d.id);

  const plan = R.planRollover({ from: FROM, to: TO, teams, leagues, entities, scores, calendar, existingRaces });

  // ── report ─────────────────────────────────────────────────────────────────────────────────
  console.log(`\n== preconditions: ${blockers.length ? 'NOT MET' : 'met'}`);
  for (const b of blockers) console.log(`  ✗ ${b}`);
  console.log(`\n== teams: ${plan.teams.total} (${plan.teams.reset} to archive and reset, ${plan.teams.total - plan.teams.reset} already archived)`);
  for (const a of [...plan.teams.archives].sort((x, y) => y.seasonTotal - x.seasonTotal).slice(0, 5)) console.log(`  ${String(a.seasonTotal).padStart(6)}  ${a.name}`);
  console.log(`\n== leagues: ${plan.leagues.total} (${plan.leagues.reset} to archive and reset); members: ${plan.leagues.members}`);
  for (const a of plan.leagues.archives) console.log(`  ${String(a.memberCount).padStart(3)} members  ${a.name}  — champion: ${a.champions.map((c) => c.displayName).join(' & ') || '(no points)'}`);
  for (const coll of ['drivers', 'constructors']) {
    const rows = plan.prices.filter((p) => p.coll === coll).sort((a, b) => b.out.price - a.out.price);
    console.log(`\n== ${coll}: ${FROM} price → ${TO} opening price`);
    for (const p of rows) console.log(`  ${p.id.padEnd(14)} ${String(p.from).padStart(4)} → ${String(p.out.price).padStart(4)} ${p.out.tier}  ${p.out.basis}${p.inactive ? '  (inactive)' : ''}${p.stamped ? '  (already priced)' : ''}`);
    const avg = (a) => Math.round(a.reduce((n, v) => n + v, 0) / Math.max(1, a.length));
    const active = rows.filter((p) => !p.inactive);
    console.log(`  active ${coll}: average opening $${avg(active.map((p) => p.out.price))} (today's ${FROM} prices average $${avg(active.map((p) => p.from))})`);
  }
  const act = (coll) => plan.prices.filter((p) => p.coll === coll && !p.inactive).map((p) => p.out.price).sort((a, b) => a - b);
  const dr = act('drivers'), co = act('constructors'), sum = (a) => a.reduce((n, v) => n + v, 0);
  console.log(`\n  budget ${R.START_BUDGET}: cheapest lineup (5 drivers + 1 constructor) $${sum(dr.slice(0, 5)) + co[0]}; dearest $${sum(dr.slice(-5)) + co[co.length - 1]}`);
  console.log(`\n== ${TO} calendar from OpenF1: ${calendar.length} races (${calendar.filter((r) => r.hasSprint).length} sprint weekends), ${plan.newRaces.length} to create`);
  for (const r of calendar) console.log(`  R${String(r.round).padStart(2)} ${r.schedule.race.slice(0, 16)}Z  ${r.id.padEnd(16)} ${r.name}${r.hasSprint ? '  [sprint]' : ''}${plan.newRaces.includes(r.id) ? '' : '  (exists, kept)'}`);
  console.log(`\n== ${plan.groups.length} atomic write groups, ${plan.groups.reduce((n, g) => n + g.ops.length, 0)} writes`);
  console.log(`\n== op backup paths (a restore deletes the documents listed here that do not exist yet): ${plan.backupPaths.length}`);
  if (conn.pathsOut) {
    fs.mkdirSync(path.dirname(conn.pathsOut), { recursive: true, mode: 0o700 });
    const body = plan.backupPaths.join('\n') + '\n';
    fs.writeFileSync(conn.pathsOut, body, { mode: 0o600 });
    console.log(`  written to ${conn.pathsOut} (sha256 ${require('crypto').createHash('sha256').update(body).digest('hex')})`);
  } else {
    console.log(plan.backupPaths.join(','));
  }

  if (!apply) { console.log('\n== dry run: nothing written (add --apply)'); return; }
  if (blockers.length) throw new Error(`refusing to write: ${blockers.length} precondition(s) not met`);
  if (conn.pathsCheck) {
    const listed = require(path.join(__dirname, '..', '..', 'scripts', 'ops', '_paths.js')).readPathsFile(conn.pathsCheck);
    const writes = plan.groups.flatMap((g) => g.ops.map((o) => o.path));
    const missing = R.uncoveredPaths(writes, listed);
    if (missing.length) throw new Error(`refusing to write: ${missing.length} path(s) this run writes are not in the backup list ${conn.pathsCheck} (created since the dry run?): ${missing.slice(0, 5).join(', ')}. Plan a new op.`);
    // the same digest the dry run printed: a list edited on the share in between shows up here
    console.log(`\n== every write is covered by ${conn.pathsCheck} (sha256 ${require('crypto').createHash('sha256').update(fs.readFileSync(conn.pathsCheck)).digest('hex')}; compare with the dry run)`);
  } else if (!conn.emulator) {
    throw new Error('refusing to write: an apply on production needs --paths-check=<the dry run\'s path file>, so a write the backup never saw cannot happen.');
  }

  // one batch per group, in order. A failed group is reported and the rest go on — one team or league
  // that cannot be written must not hold every other player in 2026 — but the season switch waits
  // until every group has gone in: it is committed only on a run with no failures.
  let done = 0;
  const failed = [];
  for (const g of plan.groups) {
    if (g.label === 'season switch' && failed.length) break;
    if (conn.failAfter !== null && done >= conn.failAfter) {
      // rehearsal: die the way a lost connection or a killed process would, mid-run, with no cleanup
      console.error(`!! --fail-after=${conn.failAfter}: stopping dead before group "${g.label}" (${done} committed)`);
      process.exit(3);
    }
    try {
      // built inside the try: a write that cannot even be constructed fails its own group, not the run
      const batch = db.batch();
      for (const op of g.ops) {
        const o = op.path.startsWith('races/') ? { ...op, data: SCHEDULE_TO_TS(op.data) } : op;
        if (op.path === `seasons/${TO}`) {
          for (const k of ['startDate', 'endDate']) if (o.data[k]) o.data = { ...o.data, [k]: admin.firestore.Timestamp.fromDate(new Date(o.data[k])) };
        }
        toBatch(batch, o, R);
      }
      await batch.commit();
      done++;
    } catch (e) {
      failed.push(`${g.label}: ${e.message}`);
      console.error(`!! group "${g.label}" failed and was skipped: ${e.message}`);
    }
  }
  if (failed.length) {
    throw new Error(`${failed.length} group(s) failed (${failed.join('; ')}); ${done} committed. The season switch was NOT made: fix or remove the cause and re-run — committed groups are skipped.`);
  }
  console.log(`\n== committed ${done} groups: ${plan.teams.reset} teams, ${plan.leagues.reset} leagues, ${plan.prices.filter((p) => !p.stamped).length} prices, ${plan.newRaces.length} races; config/app.currentSeason = ${TO}`);
}

if (require.main === module) {
  // the decision is pure and tested: functions/src/season/rolloverConnection.ts
  const conn = lib('rolloverConnection.js').connectionFor(process.argv.slice(2), process.env);
  if (conn.error) { console.error(conn.error); process.exit(2); }
  initAdmin(conn);
  main(conn).then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
}
