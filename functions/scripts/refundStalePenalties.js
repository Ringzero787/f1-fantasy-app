/**
 * Give back the stale-roster penalties taken from the teams auto-filled at Las Vegas 2026 (F-170).
 *
 * Race scoring (calculatePoints.ts, Phase 1) takes (racesSinceTransfer − 5) × 5 points from a team
 * that has made no transfer for more than five races. Auto-fill (lock sweep, autoFill.ts) did not
 * reset racesSinceTransfer, so an abandoned team that auto-fill kept full was penalised more every
 * race; F-170 makes a fill reset it. Owner decision 2026-11-24: every team auto-filled at Las Vegas
 * (lastAutoFill.raceId == 'las_vegas_2026', the first race auto-fill actually filled) gets back
 * EVERY stale-roster penalty it took this season, before the Qatar lock.
 *
 * Where the penalty is recorded: buildRaceSnapshot (raceSnapshots.ts) writes the part of a phase's
 * points that no roster entity earned as `phases.race.adjustment` on
 * fantasyTeams/{id}/raceSnapshots/{raceId}. The stale penalty is the only deduction in a race
 * phase, so a negative race-phase adjustment is that penalty. The only other way to get a nonzero
 * adjustment is a roster that lists the same driver twice (entityPhasePoints keys by driverId and
 * keeps one entry), which can come out either sign. So an adjustment is refunded only when it is
 * negative, a multiple of 5 (every stale penalty is), and the snapshot roster has no repeated
 * driver; anything else negative is listed as UNEXPLAINED and left alone for a person to look at.
 *
 * Refund rule, per team with lastAutoFill.raceId == 'las_vegas_2026':
 *   for each raceSnapshot of season 2026 (`season` '2026', or no season and a doc id ending _2026)
 *   with no `staleRefund` stamp and a stale-penalty adjustment as above: refund −adjustment.
 * In one transaction per team: totalPoints += the sum (set + mergeFields ['totalPoints'] only — the
 * penalty came off totalPoints, through increment(), and update() must never be used on a team doc,
 * see #305 / autoFill.ts), and each refunded snapshot gets staleRefund: { at, points }. The
 * snapshot's phases (points, entities, adjustment) are history and are not changed, so the weekend
 * leaderboards, round reports and bestRacePoints (which mirrors phases.race.points) stay as scored.
 * A second run finds every penalty stamped and refunds nothing.
 *
 * League tables then follow through syncLeaguesForRace — the Phase 4 helper the race-correction
 * path reuses — run for the latest completed race of the season, with each team's race-phase points
 * from that race's (unchanged) snapshot: member totals are re-read from the team docs and re-ranked
 * (previousRank is not re-snapshotted: it is already stamped for that race), lastRacePoints stays
 * what it was, and that race's weekend leaderboard is rewritten with the same numbers.
 *
 * Writes only fantasyTeams/* (+ raceSnapshots) and leagues/*: nothing of Track Limits.
 *
 * Usage:
 *   node scripts/refundStalePenalties.js            # dry run: totals, per race, Vegas subtotal, teams
 *   node scripts/refundStalePenalties.js --apply
 * Needs `npm run build` first (the league sync is the compiled functions code in ../lib).
 */
const admin = require('firebase-admin');
const EXPECTED_PROJECT = 'f1-app-18077';
const SEASON = '2026';
const FILL_RACE = 'las_vegas_2026';
const PENALTY_STEP = 5; // calculatePoints.ts: (racesSinceTransfer - 5) * 5
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

/** The compiled code must be current: a stale ../lib would run old league-sync code against production. */
function requireFreshBuild() {
  const fs = require('fs');
  const path = require('path');
  const src = path.join(__dirname, '..', 'src');
  const lib = path.join(__dirname, '..', 'lib');
  const stale = [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    if (!e.name.endsWith('.ts')) return;
    const out = path.join(lib, path.relative(src, p)).replace(/\.ts$/, '.js');
    if (!fs.existsSync(out) || fs.statSync(out).mtimeMs < fs.statSync(p).mtimeMs) stale.push(path.relative(src, p));
  });
  walk(src);
  if (stale.length) {
    console.error(`Refusing to run: functions/lib is older than src for ${stale.length} file(s) (${stale.slice(0, 3).join(', ')}…). Run \`npm --prefix functions run build\` first.`);
    process.exit(2);
  }
}

const APPLY = process.argv.includes('--apply');

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Pure: the team was filled by the Las Vegas lock sweep. */
function isVegasFilled(team) {
  return !!(team && team.lastAutoFill && typeof team.lastAutoFill === 'object' && team.lastAutoFill.raceId === FILL_RACE);
}

/** Pure: a snapshot belongs to the 2026 season (`season`; older or partial snapshots: the race id). */
function isSeasonSnapshot(snapId, snap) {
  const s = snap ? (snap.season ?? snap.seasonId) : undefined;
  if (s !== undefined && s !== null && s !== '') return String(s) === SEASON;
  return typeof snapId === 'string' && snapId.endsWith(`_${SEASON}`);
}

/**
 * Pure: what one snapshot holds for this repair.
 *   none        — no negative race-phase adjustment (or not 2026)
 *   refunded    — already given back (staleRefund stamp)
 *   refund      — a stale-roster penalty to give back (`points` > 0)
 *   unexplained — negative, but not shaped like a stale penalty: left alone, reported
 */
function classifySnapshot(snapId, snap) {
  if (!snap || !isSeasonSnapshot(snapId, snap)) return { kind: 'none' };
  const race = snap.phases && snap.phases.race;
  const adj = race ? race.adjustment : undefined;
  if (typeof adj !== 'number' || !Number.isFinite(adj) || adj >= 0) return { kind: 'none' };
  if (snap.staleRefund) return { kind: 'refunded', points: num(snap.staleRefund.points) };
  const ids = ((snap.roster && snap.roster.drivers) || []).map((d) => d && d.driverId).filter(Boolean);
  const repeated = new Set(ids).size !== ids.length;
  if (adj % PENALTY_STEP !== 0 || repeated) {
    return { kind: 'unexplained', adjustment: adj, why: repeated ? 'roster lists a driver twice' : `not a multiple of ${PENALTY_STEP}` };
  }
  return { kind: 'refund', points: -adj };
}

/**
 * Pure: one team's refund. `snaps` is [{ id, data }] of its raceSnapshots. Null for a team that was
 * not filled at Las Vegas (it is out of scope whatever its snapshots say).
 */
function planTeamRefund(team, snaps) {
  if (!isVegasFilled(team)) return null;
  const refunds = [];
  const already = [];
  const unexplained = [];
  for (const { id, data } of snaps) {
    const c = classifySnapshot(id, data);
    const round = data && typeof data.round === 'number' ? data.round : null;
    if (c.kind === 'refund') refunds.push({ raceId: id, round, points: c.points });
    else if (c.kind === 'refunded') already.push({ raceId: id, round, points: c.points });
    else if (c.kind === 'unexplained') unexplained.push({ raceId: id, round, adjustment: c.adjustment, why: c.why });
  }
  const byRound = (a, b) => (a.round ?? 99) - (b.round ?? 99) || (a.raceId < b.raceId ? -1 : 1);
  refunds.sort(byRound);
  const points = refunds.reduce((s, r) => s + r.points, 0);
  const vegasPoints = refunds.filter((r) => r.raceId === FILL_RACE).reduce((s, r) => s + r.points, 0);
  return { refunds, already, unexplained, points, vegasPoints };
}

/** Pure: totals across teams for the dry-run printout. `plans` is [{ teamId, name, plan }]. */
function summarize(plans) {
  const byRace = new Map();
  let total = 0;
  let vegas = 0;
  let vegasTeams = 0;
  let worst = null;
  let teams = 0;
  for (const { teamId, name, plan } of plans) {
    if (!plan || !plan.points) continue;
    teams++;
    total += plan.points;
    if (plan.vegasPoints) { vegas += plan.vegasPoints; vegasTeams++; }
    if (!worst || plan.points > worst.points) worst = { teamId, name: name ?? null, points: plan.points, races: plan.refunds.length };
    for (const r of plan.refunds) {
      const e = byRace.get(r.raceId) || { raceId: r.raceId, round: r.round, points: 0, teams: 0 };
      e.points += r.points;
      e.teams++;
      byRace.set(r.raceId, e);
    }
  }
  const races = [...byRace.values()].sort((a, b) => (a.round ?? 99) - (b.round ?? 99) || (a.raceId < b.raceId ? -1 : 1));
  return { teams, total, vegas, vegasTeams, worst, races };
}

/** The writes of one team's refund, inside the caller's transaction (exported for the emulator test). */
function writeRefund(tx, teamRef, team, plan, at) {
  // set + mergeFields, never update(): a team doc carries a top-level `constructor`, and update()
  // expands keys as field paths into Object.prototype.constructor (#305, autoFill.ts). Only the one
  // field this repair changes is named, so nothing else on the team can be rewritten.
  tx.set(teamRef, { totalPoints: num(team.totalPoints) + plan.points }, { mergeFields: ['totalPoints'] });
  for (const r of plan.refunds) {
    tx.update(teamRef.collection('raceSnapshots').doc(r.raceId), { staleRefund: { at, points: r.points } });
  }
}

/**
 * The repair against a Firestore handle (production from main(); the emulator in the F-171-style
 * test). `syncLeagues` is calculatePoints.syncLeaguesForRace.
 */
async function runRefund(fs, { dryRun, syncLeagues, currentSeason, log = console.log }) {
  const season = await currentSeason(fs);
  if (season !== SEASON) throw new Error(`refusing: the current season is ${season}, not ${SEASON} — after the rollover these are new teams`);

  const teamsSnap = await fs.collection('fantasyTeams').get();
  const candidates = teamsSnap.docs.filter((d) => isVegasFilled(d.data()));
  // Auto-fill overwrites lastAutoFill each time it fills. Nothing was filled before Las Vegas, so a
  // team stamped with another race was filled AGAIN after it and is no longer selected.
  const refilled = new Map();
  teamsSnap.docs.forEach((d) => {
    const f = d.data().lastAutoFill;
    if (f && f.raceId && f.raceId !== FILL_RACE) refilled.set(f.raceId, (refilled.get(f.raceId) || 0) + 1);
  });

  const at = admin.firestore.Timestamp.now();
  const plans = [];
  let alreadyTeams = 0;
  const unexplained = [];
  for (const teamDoc of candidates) {
    const snapsRef = teamDoc.ref.collection('raceSnapshots');
    const work = async (tx) => {
      const [t, s] = tx ? await Promise.all([tx.get(teamDoc.ref), tx.get(snapsRef)]) : [teamDoc, await snapsRef.get()];
      if (!t.exists) return null; // deleted since the list was read: set() must not recreate it
      const team = t.data();
      const plan = planTeamRefund(team, s.docs.map((d) => ({ id: d.id, data: d.data() })));
      if (!plan) return null;
      if (tx && plan.points) writeRefund(tx, teamDoc.ref, team, plan, at);
      return { plan, before: num(team.totalPoints) };
    };
    const r = dryRun ? await work(null) : await fs.runTransaction((tx) => work(tx));
    if (!r) continue;
    const t = teamDoc.data();
    plans.push({ teamId: teamDoc.id, name: t.name, leagueId: t.leagueId || null, plan: r.plan, before: r.before });
    if (r.plan.already.length) alreadyTeams++;
    r.plan.unexplained.forEach((u) => unexplained.push({ teamId: teamDoc.id, ...u }));
  }

  const sum = summarize(plans);
  log(`season ${SEASON}; teams auto-filled at ${FILL_RACE}: ${candidates.length} (of ${teamsSnap.size})`);
  if (refilled.size) {
    log(`WARNING: ${[...refilled.values()].reduce((a, b) => a + b, 0)} team(s) were auto-filled again after ${FILL_RACE} ` +
      `(${[...refilled.entries()].map(([k, v]) => `${k}: ${v}`).join(', ')}); their lastAutoFill no longer names ${FILL_RACE}, so this run leaves them out. ` +
      'The owner decision was to apply before the Qatar lock.');
  }
  log(`\nteams ${dryRun ? 'to refund' : 'refunded'}: ${sum.teams}` + (alreadyTeams ? ` (${alreadyTeams} team(s) carry earlier staleRefund stamps, not refunded twice)` : ''));
  log(`TOTAL refund: +${sum.total} points`);
  log(`  of which ${FILL_RACE} only: +${sum.vegas} points across ${sum.vegasTeams} team(s)`);
  log('per race:');
  sum.races.forEach((r) => log(`  R${String(r.round ?? '?').padStart(2)} ${r.raceId.padEnd(24)} +${String(r.points).padStart(5)}  ${r.teams} team(s)`));
  if (sum.worst) log(`worst team: ${sum.worst.teamId}${sum.worst.name ? ` (${sum.worst.name})` : ''} +${sum.worst.points} over ${sum.worst.races} race(s)`);
  log('\nper team:');
  plans.filter((p) => p.plan.points).sort((a, b) => b.plan.points - a.plan.points).forEach((p) =>
    log(`  ${p.teamId}: totalPoints ${p.before} → ${p.before + p.plan.points} (+${p.plan.points}; ${p.plan.refunds.map((r) => `${r.raceId} +${r.points}`).join(', ')})`));
  if (unexplained.length) {
    log(`\nUNEXPLAINED negative race adjustments, NOT refunded (review by hand): ${unexplained.length}`);
    unexplained.forEach((u) => log(`  ${u.teamId} ${u.raceId}: ${u.adjustment} (${u.why})`));
  }

  // League tables: from the team docs, through the scoring pipeline's own Phase 4 sync
  const leagues = [...new Set(plans.filter((p) => p.plan.points && p.leagueId).map((p) => p.leagueId))];
  const done = await fs.collection('races').where('seasonId', '==', SEASON).where('status', '==', 'completed').get();
  const latest = done.docs.sort((a, b) => (b.data().round || 0) - (a.data().round || 0))[0];
  let synced = [];
  if (leagues.length && !latest) log('WARNING: no completed race this season to sync the leagues against; league tables NOT re-synced');
  if (leagues.length && latest) {
    if (dryRun) {
      log(`\nleagues to re-sync against ${latest.id}: ${leagues.length}`);
    } else {
      const updates = [];
      for (const teamDoc of teamsSnap.docs) {
        const t = teamDoc.data();
        if (!t.leagueId || !leagues.includes(t.leagueId) || !t.userId) continue;
        const s = (await teamDoc.ref.collection('raceSnapshots').doc(latest.id).get()).data();
        if (!s) continue;
        updates.push({ leagueId: t.leagueId, userId: t.userId, points: num(s.phases && s.phases.race && s.phases.race.points) });
      }
      const race = latest.data();
      synced = await syncLeagues(latest.id, { season: race.seasonId, round: race.round, name: race.name ?? null }, updates);
      log(`\nleagues re-synced against ${latest.id}: ${synced.length}`);
    }
  }

  // What the op's backup step must take (a collection backup does not include subcollections)
  const paths = [];
  for (const p of plans) {
    if (!p.plan.points) continue;
    paths.push(`fantasyTeams/${p.teamId}`);
    p.plan.refunds.forEach((r) => paths.push(`fantasyTeams/${p.teamId}/raceSnapshots/${r.raceId}`));
  }
  for (const l of leagues) {
    paths.push(`leagues/${l}`, `leagues/${l}/members`);
    if (latest) paths.push(`leagues/${l}/raceResults/${latest.id}`);
  }
  log(`\nbackup paths: ${paths.length ? paths.join(',') : '-'}`);
  log('TRACK LIMITS: not touched (this writes fantasyTeams and leagues only; no races, no tl_* collections).');
  if (dryRun) log('\nDRY RUN — nothing written. Re-run with --apply.');
  return { ...sum, plans, unexplained, leagues, synced, latestRaceId: latest ? latest.id : null, refilled: Object.fromEntries(refilled) };
}

async function main() {
  // The compiled modules create their Firestore client on load: require them after initAdmin.
  const { syncLeaguesForRace } = require('../lib/scoring/calculatePoints.js');
  const { currentSeason } = require('../lib/season/current.js');
  await runRefund(db, { dryRun: !APPLY, syncLeagues: syncLeaguesForRace, currentSeason });
}

module.exports = { SEASON, FILL_RACE, isVegasFilled, isSeasonSnapshot, classifySnapshot, planTeamRefund, summarize, writeRefund, runRefund };

if (require.main === module) {
  requireFreshBuild();
  initAdmin();
  main().then(() => process.exit(0), (e) => { console.error(e.message || e); process.exit(1); });
}
