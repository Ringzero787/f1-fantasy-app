// F-150: roll Undercut from one season to the next — archive the finished season, reset teams and
// league tables to a fresh start, re-price drivers and constructors from the season's per-race
// scores, and seed the next season's race calendar from OpenF1.
//
// The owner's decisions (2026-11-15) are in functions/src/season/rollover.ts. Run it once, after the
// final race of FROM is scored and its correction window has closed: the script refuses to write
// before that. It is safe to re-run after a partial failure — every document it resets is stamped
// with the new season (teams and leagues `seasonId`, drivers and constructors `pricedFor`) and is
// skipped once stamped; race documents are only created, never overwritten.
//
// Dry run by default: prints the preconditions, every price, every league's champion and the new
// calendar, plus the backup path list for the op. `--apply` writes. The uc-script op kind passes
// only --apply, so FROM / TO / pricing live in this file and in rollover.ts.
const admin = require('firebase-admin');
const path = require('path');

const EXPECTED_PROJECT = 'f1-app-18077';
const FROM = '2026';
const TO = '2027';
/** Hours after the last FROM race before a rollover may write: the results correction pass runs for 6 h. */
const SETTLE_HOURS = 24;

// Nothing happens on import: the key read and initializeApp sit in initAdmin, which only the
// require.main guard at the foot calls (scripts/seedGuards.test.js holds every op script to this).
let db;
function initAdmin() {
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

/** Replaces the DELETE sentinel with FieldValue.delete() for the write. */
function forWrite(patch, DELETE) {
  return Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === DELETE ? admin.firestore.FieldValue.delete() : v]));
}

/** Batched writes, committed 400 at a time. */
function writer() {
  let batch = db.batch(), n = 0, total = 0;
  return {
    async add(fn) { fn(batch); n++; total++; if (n >= 400) { await batch.commit(); batch = db.batch(); n = 0; } },
    async done() { if (n) await batch.commit(); return total; },
  };
}

async function main(apply) {
  const R = lib('rollover.js');
  const { buildCalendar } = lib('calendar.js');
  console.log(`SEASON ROLLOVER ${FROM} → ${TO} · project ${EXPECTED_PROJECT} · ${apply ? 'APPLY' : 'dry run'} · ${new Date().toISOString()}`);

  // ── preconditions ──────────────────────────────────────────────────────────────────────────
  const blockers = [];
  const fromSeason = (await db.doc(`seasons/${FROM}`).get()).data() || {};
  if (fromSeason.rolledOverAt) blockers.push(`seasons/${FROM} already rolled over at ${new Date(toMs(fromSeason.rolledOverAt)).toISOString()}`);
  const appCfg = (await db.doc('config/app').get()).data() || {};
  if (appCfg.currentSeason !== undefined && appCfg.currentSeason !== FROM && appCfg.currentSeason !== TO) {
    blockers.push(`config/app.currentSeason is ${JSON.stringify(appCfg.currentSeason)}, expected ${FROM}`);
  }
  const fromRaces = (await db.collection('races').where('seasonId', '==', FROM).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const open = fromRaces.filter((r) => r.status !== 'completed' && r.status !== 'cancelled');
  if (open.length) blockers.push(`${open.length} ${FROM} race(s) not completed: ${open.map((r) => `${r.id} (${r.status})`).join(', ')}`);
  const lastMs = Math.max(...fromRaces.filter((r) => r.status === 'completed').map((r) => toMs(r.schedule && r.schedule.race)).filter(Number.isFinite));
  const settledH = (Date.now() - lastMs) / 3600e3;
  if (!(settledH >= SETTLE_HOURS)) blockers.push(`last ${FROM} race was ${settledH.toFixed(1)} h ago; wait ${SETTLE_HOURS} h for corrections`);
  const pending = (await db.collection('pendingResults').where('status', '==', 'pending').get()).docs.map((d) => d.id).filter((id) => id.endsWith(`_${FROM}`));
  if (pending.length) blockers.push(`results still held for review: ${pending.join(', ')}`);
  console.log(`\n== preconditions: ${blockers.length ? 'NOT MET' : 'met'}`);
  for (const b of blockers) console.log(`  ✗ ${b}`);

  // ── teams ──────────────────────────────────────────────────────────────────────────────────
  const teams = (await db.collection('fantasyTeams').get()).docs;
  const teamPlan = teams.filter((d) => d.data().seasonId !== TO).map((d) => ({ ref: d.ref, archive: R.teamArchive(d.data(), FROM), patch: { ...R.teamResetPatch(d.data()), seasonId: TO } }));
  console.log(`\n== teams: ${teams.length} (${teamPlan.length} to reset, ${teams.length - teamPlan.length} already on ${TO})`);
  const top = [...teamPlan].sort((a, b) => b.archive.seasonTotal - a.archive.seasonTotal).slice(0, 5);
  for (const t of top) console.log(`  ${String(t.archive.seasonTotal).padStart(6)}  ${t.archive.name}  (${t.archive.scoredRaces.length} races)`);
  const deleted = new Set(teamPlan.flatMap((t) => Object.entries(t.patch).filter(([, v]) => v === R.DELETE).map(([k]) => k)));
  console.log(`  fields removed where present: ${[...deleted].sort().join(', ') || '(none)'}`);

  // ── leagues ────────────────────────────────────────────────────────────────────────────────
  const leagues = (await db.collection('leagues').get()).docs;
  const leaguePlan = [];
  for (const l of leagues) {
    if (l.data().seasonId === TO) continue;
    const members = (await l.ref.collection('members').get()).docs.map((m) => ({ id: m.id, ref: m.ref, ...m.data() }));
    leaguePlan.push({ ref: l.ref, archive: R.leagueArchive(l.data(), members, FROM), patch: R.leagueResetPatch(TO), members: R.memberResetPatches(members).map((p) => ({ ...p, ref: members.find((m) => m.id === p.id).ref })) });
  }
  console.log(`\n== leagues: ${leagues.length} (${leaguePlan.length} to reset); members: ${leaguePlan.reduce((n, l) => n + l.members.length, 0)}`);
  for (const l of leaguePlan) {
    const champ = l.archive.champions.map((c) => c.displayName).join(' & ') || '(no points)';
    console.log(`  ${String(l.archive.memberCount).padStart(3)} members  ${l.archive.name}  — champion: ${champ}`);
  }

  // ── prices ─────────────────────────────────────────────────────────────────────────────────
  const fromIds = new Set(fromRaces.filter((r) => r.status === 'completed').map((r) => r.id));
  const scores = {};
  for (const d of (await db.collection('raceScores').get()).docs) {
    const s = d.data();
    if (!fromIds.has(s.raceId) || typeof s.entityId !== 'string') continue;
    const e = (scores[s.entityId] ||= { races: 0, points: 0 });
    e.races++;
    e.points += typeof s.totalPoints === 'number' ? s.totalPoints : 0;
  }
  const pricePlan = [];
  const activePrices = {};
  for (const coll of ['drivers', 'constructors']) {
    console.log(`\n== ${coll}: ${FROM} price → ${TO} opening price`);
    const docs = (await db.collection(coll).get()).docs.sort((a, b) => a.id.localeCompare(b.id));
    const rows = [];
    for (const d of docs) {
      const x = d.data();
      const s = scores[d.id] || { races: 0, points: 0 };
      const out = R.openingPrice({ id: d.id, scoredRaces: s.races, scorePoints: s.points, currentPrice: x.price }, { dollarsPerPoint: coll === 'constructors' ? R.CONSTRUCTOR_DOLLARS_PER_POINT : R.DOLLARS_PER_POINT });
      rows.push({ d, x, out });
      if (x.pricedFor !== TO) pricePlan.push({ ref: d.ref, patch: { ...R.entityPricePatch(x, out), pricedFor: TO } });
    }
    rows.sort((a, b) => b.out.price - a.out.price);
    for (const { d, x, out } of rows) {
      console.log(`  ${d.id.padEnd(14)} ${String(x.price).padStart(4)} → ${String(out.price).padStart(4)} ${out.tier}  ${out.basis}${x.isActive === false ? '  (inactive)' : ''}${x.pricedFor === TO ? '  (already priced)' : ''}`);
    }
    const active = rows.filter((r) => r.x.isActive !== false).map((r) => r.out.price).sort((a, b) => a - b);
    activePrices[coll] = active;
    const avg = (a) => Math.round(a.reduce((n, v) => n + v, 0) / Math.max(1, a.length));
    const nowActive = rows.filter((r) => r.x.isActive !== false).map((r) => r.x.price);
    console.log(`  active ${coll}: average opening $${avg(active)} (today's ${FROM} prices average $${avg(nowActive)}); top 5 $${active.slice(-5).reduce((n, v) => n + v, 0)}`);
  }
  const dr = activePrices.drivers, co = activePrices.constructors;
  const sum = (a) => a.reduce((n, v) => n + v, 0);
  console.log(`\n  budget ${R.START_BUDGET}: cheapest lineup (5 drivers + 1 constructor) $${sum(dr.slice(0, 5)) + co[0]}; dearest $${sum(dr.slice(-5)) + co[co.length - 1]}`);

  // ── calendar ───────────────────────────────────────────────────────────────────────────────
  const [meetings, sessions] = await Promise.all([openf1(`meetings?year=${TO}`), openf1(`sessions?year=${TO}`)]);
  const calendar = buildCalendar(Number(TO), meetings, sessions);
  const existing = new Set((await db.collection('races').where('seasonId', '==', TO).get()).docs.map((d) => d.id));
  console.log(`\n== ${TO} calendar from OpenF1: ${calendar.length} races (${calendar.filter((r) => r.hasSprint).length} sprint weekends)`);
  for (const r of calendar) console.log(`  R${String(r.round).padStart(2)} ${r.schedule.race.slice(0, 16)}Z  ${r.id.padEnd(16)} ${r.name}${r.hasSprint ? '  [sprint]' : ''}${existing.has(r.id) ? '  (exists, kept)' : ''}`);
  if (calendar.length === 0) blockers.push(`OpenF1 lists no ${TO} races`);

  // ── backup list for the op ─────────────────────────────────────────────────────────────────
  const backup = ['fantasyTeams', 'leagues', ...leagues.map((l) => `leagues/${l.id}/members`), 'drivers', 'constructors', 'seasons', 'config/app'];
  console.log(`\n== op backup paths:\n${backup.join(',')}`);

  if (!apply) { console.log('\n== dry run: nothing written (add --apply)'); return; }
  if (blockers.length) throw new Error(`refusing to write: ${blockers.length} precondition(s) not met`);

  const ts = admin.firestore.FieldValue.serverTimestamp();
  const w = writer();
  for (const t of teamPlan) {
    await w.add((b) => b.set(t.ref.collection('seasons').doc(FROM), { ...t.archive, archivedAt: ts }));
    await w.add((b) => b.update(t.ref, { ...forWrite(t.patch, R.DELETE), updatedAt: ts }));
  }
  for (const l of leaguePlan) {
    await w.add((b) => b.set(l.ref.collection('seasons').doc(FROM), { ...l.archive, archivedAt: ts }));
    for (const m of l.members) await w.add((b) => b.update(m.ref, forWrite(m.patch, R.DELETE)));
    await w.add((b) => b.update(l.ref, { ...l.patch, updatedAt: ts }));
  }
  const finals = { drivers: {}, constructors: {} };
  for (const p of pricePlan) {
    finals[p.ref.parent.id][p.ref.id] = { fantasyPoints: p.patch.seasonPoints };
    await w.add((b) => b.update(p.ref, p.patch));
  }
  for (const r of calendar) {
    if (existing.has(r.id)) continue;
    const schedule = Object.fromEntries(Object.entries(r.schedule).map(([k, v]) => [k, admin.firestore.Timestamp.fromDate(new Date(v))]));
    await w.add((b) => b.create(db.doc(`races/${r.id}`), { ...r, schedule }));
  }
  const first = calendar[0], last = calendar[calendar.length - 1];
  await w.add((b) => b.set(db.doc(`seasons/${TO}`), {
    id: TO, year: Number(TO), name: `${TO} Season`, isActive: true,
    startDate: admin.firestore.Timestamp.fromDate(new Date(first.schedule.fp1 || first.schedule.race)),
    endDate: admin.firestore.Timestamp.fromDate(new Date(last.schedule.race)),
    totalRaces: calendar.length, currentRound: 1, budget: R.START_BUDGET, teamSize: 5,
  }, { merge: true }));
  await w.add((b) => b.set(db.doc(`seasons/${FROM}`), { isActive: false, rolledOverAt: ts, final: finals }, { merge: true }));
  await w.add((b) => b.set(db.doc('config/app'), { currentSeason: TO }, { merge: true }));
  const n = await w.done();
  console.log(`\n== wrote ${n} document changes: ${teamPlan.length} teams, ${leaguePlan.length} leagues, ${pricePlan.length} prices, ${calendar.filter((r) => !existing.has(r.id)).length} races; config/app.currentSeason = ${TO}`);
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const unknown = argv.filter((a) => a !== '--apply');
  if (unknown.length) { console.error(`"${unknown[0]}" is not a flag this script understands. Nothing was written.`); process.exit(2); }
  initAdmin();
  main(argv.includes('--apply')).then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
}
