/**
 * Give back the stale-roster penalties taken from the teams auto-filled at Las Vegas 2026 (F-170).
 *
 * Race scoring (calculatePoints.ts, Phase 1) takes (racesSinceTransfer − 5) × 5 points from a team
 * that has made no transfer for more than five races, then increments racesSinceTransfer; a
 * purchase or transfer resets it to 0. Auto-fill (lock sweep, autoFill.ts) did not reset it, so an
 * abandoned team that auto-fill kept full was penalised more every race; F-170 makes a fill reset
 * it. Owner decision 2026-11-24: every team auto-filled at Las Vegas gets back EVERY stale-roster
 * penalty it took this season, before the Qatar lock.
 *
 * WHO. lastAutoFill is the scope the owner chose, but before F-170 it was not in the rules' team
 * denylist, so a player could have written it. It is only trusted when the server-written Las Vegas
 * snapshot (raceSnapshots are `allow write: if false`) confirms it: every id in
 * lastAutoFill.driverIds, and lastAutoFill.constructorId when set, is on that snapshot's roster with
 * racesHeld 0 and isReservePick true. Since F-044 (2026-09-17) the lock sweep is the only writer of
 * isReservePick: true (player purchases never set it, and `drivers`/`constructor` are server-only),
 * and racesHeld 0 means the pick was added for this race. A team that fails is listed as
 * INELIGIBLE and gets nothing.
 *
 * WHAT, from snapshots (round 17 on: F-029 started recording snapshots after round 16 had scored).
 * buildRaceSnapshot writes the part of a phase's points that no roster entity earned as
 * `phases.race.adjustment`. The stale penalty is the only deduction in a race phase. A negative
 * adjustment is refunded only when it is shaped like one: a multiple of 5, equal to
 * points − Σentities, every entity finite, and no driver listed twice on the roster (the one other
 * way to get a nonzero adjustment). A run whose teamPoints was coerced to 0 (non-finite roster data)
 * stores a non-finite entity and adjustment, and is never refunded. Anything else negative is
 * UNEXPLAINED and left for a person.
 *
 * WHAT, reconstructed (rounds before the first snapshot). The counter rule is exact: the counter
 * before a race is the number of races the team was scored in since its last transfer, and the
 * penalty is max(0, (counter − 5) × 5). The team's earliest snapshotted race, when it carries a
 * stale penalty, gives the counter there: c0 = 5 − adjustment / 5. Walking back through the team's
 * scored 2026 races (scoredRaces ∩ this season's races, by round; `sprint_`/`quali_` keys are not
 * race scorings), race k back had counter c0 − k, down to 0 (the last transfer). No reconstruction
 * when the earliest snapshot shows no penalty, is unexplained, or disagrees with the next snapshot
 * (consecutive counters must go up by exactly 1 per scored race, unless a transfer between could
 * explain it) — or when c0 is longer than the scored races before it. Scored races that are neither
 * snapshotted nor reconstructed are printed per team as the GAP.
 *
 * WRITES, one transaction per team:
 *   fantasyTeams/{id}: totalPoints += refund; staleRefund = { at, races: { raceId: points }, total }
 *     for the reconstructed races (merged with any earlier run's) — set + mergeFields naming only
 *     those fields, never update() (a team doc has a top-level `constructor`, #305 / autoFill.ts);
 *   fantasyTeams/{id}/raceSnapshots/{raceId}: staleRefund = { at, points } on each refunded snapshot.
 * Snapshot phases (points, entities, adjustment) are history and do not change, so the weekend
 * leaderboards, round reports and bestRacePoints (which mirrors phases.race.points) stay as scored.
 * A rerun skips stamped snapshots and races already in the team's staleRefund.races.
 *
 * LEAGUES. On every --apply run, every league of an eligible team that has had any refund (this run
 * or an earlier one) is re-synced through syncLeaguesForRace — scoring's own Phase 4, which sets
 * member totals from the team docs, so it is safe to repeat and a run that died before this step is
 * finished by the next. It runs for the latest completed race with each team's (unchanged) race
 * points from that race's snapshot: lastRacePoints stays what it was, previousRank is not
 * re-snapshotted (already stamped for that race), and that weekend's leaderboard is rewritten with
 * the same numbers.
 *
 * Writes only fantasyTeams/* (+ raceSnapshots) and leagues/*: nothing of Track Limits.
 *
 * Usage:
 *   node scripts/refundStalePenalties.js            # dry run
 *   node scripts/refundStalePenalties.js --apply
 * Needs `npm run build` first (the league sync is the compiled functions code in ../lib).
 */
const admin = require('firebase-admin');
const EXPECTED_PROJECT = 'f1-app-18077';
const SEASON = '2026';
const FILL_RACE = 'las_vegas_2026';
const STALE_AFTER = 5; // calculatePoints.ts: penalty (racesSinceTransfer - 5) * 5 once racesSinceTransfer > 5
const STEP = 5;
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
const penaltyAt = (counter) => Math.max(0, (counter - STALE_AFTER) * STEP);
const own = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);

/** Pure: lastAutoFill names the Las Vegas lock (the owner's scope; trusted only once confirmed). */
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
 * Pure: the fill is confirmed by the server-written Las Vegas snapshot. Returns null when it is,
 * else the reason it is not.
 */
function fillUnconfirmedWhy(team, vegasSnap) {
  const f = team.lastAutoFill;
  const driverIds = Array.isArray(f.driverIds) ? f.driverIds : [];
  const ctorId = typeof f.constructorId === 'string' && f.constructorId ? f.constructorId : null;
  if (!driverIds.length && !ctorId) return 'lastAutoFill names no pick';
  if (!vegasSnap || !vegasSnap.roster) return `no ${FILL_RACE} snapshot to confirm the fill`;
  const fresh = (p) => !!p && p.racesHeld === 0 && p.isReservePick === true;
  const rosterDrivers = Array.isArray(vegasSnap.roster.drivers) ? vegasSnap.roster.drivers : [];
  for (const id of driverIds) {
    if (!fresh(rosterDrivers.find((d) => d && d.driverId === id))) return `${id} is not an auto-filled pick on the ${FILL_RACE} roster`;
  }
  if (ctorId) {
    const c = own(vegasSnap.roster, 'constructor') ? vegasSnap.roster.constructor : null;
    if (!(c && c.constructorId === ctorId && fresh(c))) return `${ctorId} is not the auto-filled constructor on the ${FILL_RACE} roster`;
  }
  return null;
}

/**
 * Pure: what one snapshot's race phase says.
 *   { race: false }                         no race phase
 *   { race: true, kind: 'zero' }            no penalty (counter ≤ 5)
 *   { race: true, kind: 'stale', counter, points }   a stale penalty of `points`, counter before the race
 *   { race: true, kind: 'unexplained', why, adjustment }
 * plus `stamped` (points) when an earlier run already refunded it.
 */
function analyzeSnapshot(snap) {
  const race = snap && snap.phases && snap.phases.race;
  if (!race) return { race: false };
  const stamped = snap.staleRefund ? num(snap.staleRefund.points) : null;
  const adj = race.adjustment;
  const entities = race.entities && typeof race.entities === 'object' ? Object.values(race.entities) : [];
  const badEntity = entities.some((v) => typeof v !== 'number' || !Number.isFinite(v));
  if (adj === undefined || adj === 0) return badEntity ? { race: true, kind: 'unexplained', why: 'non-finite entity points', adjustment: adj, stamped } : { race: true, kind: 'zero', stamped };
  const out = (why) => ({ race: true, kind: 'unexplained', why, adjustment: adj, stamped });
  if (typeof adj !== 'number' || !Number.isFinite(adj)) return out('non-finite adjustment (a coerced scoring run)');
  if (badEntity) return out('non-finite entity points (a coerced scoring run)');
  if (adj > 0) return out('positive adjustment');
  if (adj % STEP !== 0) return out(`not a multiple of ${STEP}`);
  const ids = ((snap.roster && snap.roster.drivers) || []).map((d) => d && d.driverId).filter(Boolean);
  if (new Set(ids).size !== ids.length) return out('roster lists a driver twice');
  const sum = entities.reduce((s, v) => s + v, 0);
  if (num(race.points) - sum !== adj) return out('adjustment is not points − Σentities');
  // A run whose teamPoints was non-finite is stored with points 0 (calculatePoints' coercion), while
  // buildRaceSnapshot reads the damaged pointsScored as 0, so its entities stay finite and the
  // adjustment is exactly −Σentities: indistinguishable from a real penalty equal to the race score.
  // Both are left for a person.
  if (num(race.points) === 0) return out('race points are 0 (adjustment = −Σentities): possibly a coerced scoring run');
  return { race: true, kind: 'stale', counter: STALE_AFTER - adj / STEP, points: -adj, stamped };
}

/**
 * Pure: can the snapshot at index i follow the one at index j (j < i, both race phases), given the
 * counter rule? `between` scored races lie between them.
 */
function countersAgree(a, b, steps) {
  const between = steps - 1;
  if (b.kind !== 'stale') return true; // a no-penalty race after anything: a transfer explains it
  if (a.kind === 'stale') return b.counter === a.counter + steps || b.counter <= between;
  if (a.kind === 'zero') return (b.counter - steps >= 0 && b.counter - steps <= STALE_AFTER) || b.counter <= between;
  return true;
}

/**
 * Pure: one team's refund. `snaps` is [{ id, data }] of its raceSnapshots; `roundOf` maps this
 * season's race ids to their round. Null for a team whose lastAutoFill does not name Las Vegas.
 */
function planTeamRefund(team, snaps, roundOf) {
  if (!isVegasFilled(team)) return null;
  const plan = {
    eligible: true, ineligibleWhy: null,
    snapshotRefunds: [], reconstructed: [], already: [], unexplained: [], gap: [],
    snapshotPoints: 0, reconPoints: 0, points: 0, vegasPoints: 0, staleRefund: null,
  };
  const seasonSnaps = snaps.filter(({ id, data }) => isSeasonSnapshot(id, data));
  const vegas = seasonSnaps.find((s) => s.id === FILL_RACE);
  const why = fillUnconfirmedWhy(team, vegas && vegas.data);
  if (why) { plan.eligible = false; plan.ineligibleWhy = why; return plan; }

  const round = (id) => {
    if (roundOf.has(id)) return roundOf.get(id);
    const s = seasonSnaps.find((x) => x.id === id);
    return s && typeof s.data.round === 'number' ? s.data.round : null;
  };
  const scored = new Set((Array.isArray(team.scoredRaces) ? team.scoredRaces : []).filter((id) => roundOf.has(id)));
  const info = new Map();
  for (const { id, data } of seasonSnaps) {
    const a = analyzeSnapshot(data);
    if (!a.race) continue;
    info.set(id, a);
    scored.add(id);
  }
  const races = [...scored].filter((id) => round(id) !== null).sort((a, b) => round(a) - round(b) || (a < b ? -1 : 1));

  // Consecutive snapshots must agree on the counter. On a disagreement the snapshot that also
  // disagrees with its other neighbour is the outlier; an isolated disagreement blames the earlier
  // one (the earliest snapshots are the least trusted), except on the last pair, where the latest
  // one is the outlier if the pair before agreed.
  const snapIdx = races.map((id, i) => (info.has(id) ? i : -1)).filter((i) => i >= 0);
  const pairs = [];
  for (let k = 0; k + 1 < snapIdx.length; k++) {
    const j = snapIdx[k]; const i = snapIdx[k + 1];
    const a = info.get(races[j]); const b = info.get(races[i]);
    const fails = a.kind !== 'unexplained' && b.kind !== 'unexplained' && !countersAgree(a, b, i - j);
    pairs.push({ j, i, a, b, fails });
  }
  const flag = (idx, why) => {
    const a = info.get(races[idx]);
    if (a.kind === 'unexplained') return;
    info.set(races[idx], { ...a, kind: 'unexplained', why, adjustment: a.kind === 'stale' ? -a.points : 0 });
  };
  pairs.forEach((p, k) => {
    if (!p.fails) return;
    const why = `counter ${p.a.kind === 'stale' ? p.a.counter : '≤5'} at ${races[p.j]} and ${p.b.counter} at ${races[p.i]} do not fit the counter rule`;
    const next = pairs[k + 1]; const prev = pairs[k - 1];
    if (next && next.fails) flag(p.i, why);
    else if (prev && prev.fails) flag(p.j, why);
    else if (!next && prev) flag(p.i, why);
    else flag(p.j, why);
  });

  const at = (id) => ({ raceId: id, round: round(id) });
  for (const i of snapIdx) {
    const id = races[i]; const a = info.get(id);
    if (a.kind === 'stale') {
      if (a.stamped !== null) plan.already.push({ ...at(id), points: a.stamped, source: 'snapshot' });
      else plan.snapshotRefunds.push({ ...at(id), points: a.points });
    } else if (a.kind === 'unexplained' && a.stamped === null && a.why !== 'positive adjustment') {
      plan.unexplained.push({ ...at(id), adjustment: a.adjustment, why: a.why });
    }
  }

  // reconstruction before the earliest snapshot
  const prior = team.staleRefund && typeof team.staleRefund === 'object' && team.staleRefund.races && typeof team.staleRefund.races === 'object' ? team.staleRefund.races : {};
  const covered = new Set(snapIdx.map((i) => races[i]));
  const s0 = snapIdx.length ? snapIdx[0] : races.length;
  const anchor = snapIdx.length ? info.get(races[s0]) : null;
  if (anchor && anchor.kind === 'stale') {
    if (anchor.counter > s0) {
      plan.unexplained.push({ ...at(races[s0]), adjustment: -anchor.points, why: `counter ${anchor.counter} but only ${s0} scored race(s) before it: not reconstructed` });
    } else {
      for (let k = 1; k <= anchor.counter; k++) {
        const id = races[s0 - k];
        covered.add(id);
        const pts = penaltyAt(anchor.counter - k);
        if (pts <= 0) continue;
        if (own(prior, id)) plan.already.push({ ...at(id), points: num(prior[id]), source: 'reconstructed' });
        else plan.reconstructed.push({ ...at(id), points: pts, counter: anchor.counter - k });
      }
    }
  }
  plan.gap = races.filter((id) => !covered.has(id)).map(at);

  const byRound = (a, b) => (a.round ?? 99) - (b.round ?? 99);
  plan.snapshotRefunds.sort(byRound); plan.reconstructed.sort(byRound); plan.already.sort(byRound);
  plan.snapshotPoints = plan.snapshotRefunds.reduce((s, r) => s + r.points, 0);
  plan.reconPoints = plan.reconstructed.reduce((s, r) => s + r.points, 0);
  plan.points = plan.snapshotPoints + plan.reconPoints;
  plan.vegasPoints = plan.snapshotRefunds.filter((r) => r.raceId === FILL_RACE).reduce((s, r) => s + r.points, 0);
  if (plan.reconstructed.length) {
    const racesMap = { ...prior };
    plan.reconstructed.forEach((r) => { racesMap[r.raceId] = r.points; });
    plan.staleRefund = { races: racesMap, total: Object.values(racesMap).reduce((s, v) => s + num(v), 0) };
  }
  return plan;
}

/** Pure: totals across teams for the printout. `plans` is [{ teamId, name, plan }]. */
function summarize(plans) {
  const byRace = new Map();
  const s = { teams: 0, total: 0, snapshotTotal: 0, reconTotal: 0, vegas: 0, vegasTeams: 0, worst: null, races: [], ineligible: [] };
  for (const { teamId, name, plan } of plans) {
    if (!plan) continue;
    if (!plan.eligible) { s.ineligible.push({ teamId, why: plan.ineligibleWhy }); continue; }
    if (!plan.points) continue;
    s.teams++;
    s.total += plan.points;
    s.snapshotTotal += plan.snapshotPoints;
    s.reconTotal += plan.reconPoints;
    if (plan.vegasPoints) { s.vegas += plan.vegasPoints; s.vegasTeams++; }
    if (!s.worst || plan.points > s.worst.points) s.worst = { teamId, name: name ?? null, points: plan.points, races: plan.snapshotRefunds.length + plan.reconstructed.length };
    const add = (r, key) => {
      const e = byRace.get(r.raceId) || { raceId: r.raceId, round: r.round, snapshot: 0, reconstructed: 0, teams: 0 };
      e[key] += r.points; e.teams++;
      byRace.set(r.raceId, e);
    };
    plan.snapshotRefunds.forEach((r) => add(r, 'snapshot'));
    plan.reconstructed.forEach((r) => add(r, 'reconstructed'));
  }
  s.races = [...byRace.values()].sort((a, b) => (a.round ?? 99) - (b.round ?? 99) || (a.raceId < b.raceId ? -1 : 1));
  return s;
}

/** The writes of one team's refund, inside the caller's transaction (exported for the emulator test). */
function writeRefund(tx, teamRef, team, plan, at) {
  // set + mergeFields, never update(): a team doc carries a top-level `constructor`, and update()
  // expands keys as field paths into Object.prototype.constructor (#305, autoFill.ts). Only the
  // fields this repair changes are named, so nothing else on the team can be rewritten.
  const teamWrite = { totalPoints: num(team.totalPoints) + plan.points };
  if (plan.staleRefund) teamWrite.staleRefund = { at, ...plan.staleRefund };
  tx.set(teamRef, teamWrite, { mergeFields: Object.keys(teamWrite) });
  for (const r of plan.snapshotRefunds) {
    tx.update(teamRef.collection('raceSnapshots').doc(r.raceId), { staleRefund: { at, points: r.points } });
  }
}

const seasonQuery = (fs) => fs.collection('races').where('seasonId', 'in', [SEASON, Number(SEASON)]);

/**
 * The repair against a Firestore handle (production from main(); the emulator in the test).
 * `syncLeagues` is calculatePoints.syncLeaguesForRace, `currentSeason` season/current.currentSeason.
 */
async function runRefund(fs, { dryRun, syncLeagues, currentSeason, log = console.log }) {
  const season = await currentSeason(fs);
  if (season !== SEASON) throw new Error(`refusing: the current season is ${season}, not ${SEASON} — after the rollover these are new teams`);

  // race docs may store seasonId as '2026' or 2026
  const raceDocs = (await seasonQuery(fs).get()).docs;
  const roundOf = new Map(raceDocs.filter((d) => typeof d.data().round === 'number').map((d) => [d.id, d.data().round]));
  const latest = raceDocs.filter((d) => d.data().status === 'completed').sort((a, b) => (b.data().round || 0) - (a.data().round || 0))[0] || null;

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
  for (const teamDoc of candidates) {
    const snapsRef = teamDoc.ref.collection('raceSnapshots');
    const work = async (tx) => {
      const [t, s] = tx ? await Promise.all([tx.get(teamDoc.ref), tx.get(snapsRef)]) : [teamDoc, await snapsRef.get()];
      if (!t.exists) return null; // deleted since the list was read: set() must not recreate it
      const team = t.data();
      const plan = planTeamRefund(team, s.docs.map((d) => ({ id: d.id, data: d.data() })), roundOf);
      if (!plan) return null;
      if (tx && plan.eligible && plan.points) writeRefund(tx, teamDoc.ref, team, plan, at);
      return { plan, before: num(team.totalPoints) };
    };
    const r = dryRun ? await work(null) : await fs.runTransaction((tx) => work(tx));
    if (!r) continue;
    const t = teamDoc.data();
    plans.push({ teamId: teamDoc.id, name: t.name, leagueId: t.leagueId || null, userId: t.userId || null, plan: r.plan, before: r.before });
  }

  const sum = summarize(plans);
  const sign = (n) => `+${n}`;
  log(`season ${SEASON}; lastAutoFill names ${FILL_RACE}: ${candidates.length} team(s) (of ${teamsSnap.size}); confirmed by the ${FILL_RACE} snapshot: ${candidates.length - sum.ineligible.length}`);
  if (refilled.size) {
    log(`WARNING: ${[...refilled.values()].reduce((a, b) => a + b, 0)} team(s) were auto-filled again after ${FILL_RACE} ` +
      `(${[...refilled.entries()].map(([k, v]) => `${k}: ${v}`).join(', ')}); their lastAutoFill no longer names ${FILL_RACE}, so this run leaves them out. ` +
      'The owner decision was to apply before the Qatar lock.');
  }
  if (sum.ineligible.length) {
    log(`\nINELIGIBLE (lastAutoFill not confirmed by the server-written snapshot), NOT refunded: ${sum.ineligible.length}`);
    sum.ineligible.forEach((x) => log(`  ${x.teamId}: ${x.why}`));
  }
  const alreadyTeams = plans.filter((p) => p.plan.eligible && p.plan.already.length).length;
  log(`\nteams ${dryRun ? 'to refund' : 'refunded'}: ${sum.teams}` + (alreadyTeams ? ` (${alreadyTeams} team(s) refunded by an earlier run: not refunded twice)` : ''));
  log(`TOTAL refund: ${sign(sum.total)} points`);
  log(`  from snapshots (recorded penalties):   ${sign(sum.snapshotTotal)}`);
  log(`  reconstructed from the counter:        ${sign(sum.reconTotal)}`);
  log(`  ${FILL_RACE} only: ${sign(sum.vegas)} points across ${sum.vegasTeams} team(s)`);
  log('per race:                          snapshot  reconstructed  teams');
  sum.races.forEach((r) => log(`  R${String(r.round ?? '?').padStart(2)} ${r.raceId.padEnd(26)} ${sign(r.snapshot).padStart(8)}  ${sign(r.reconstructed).padStart(13)}  ${String(r.teams).padStart(5)}`));
  if (sum.worst) log(`worst team: ${sum.worst.teamId}${sum.worst.name ? ` (${sum.worst.name})` : ''} ${sign(sum.worst.points)} over ${sum.worst.races} race(s)`);
  log('\nper team:');
  plans.filter((p) => p.plan.eligible && p.plan.points).sort((a, b) => b.plan.points - a.plan.points).forEach((p) => {
    const parts = [...p.plan.snapshotRefunds.map((r) => `${r.raceId} +${r.points}`), ...p.plan.reconstructed.map((r) => `${r.raceId} +${r.points} (reconstructed, counter ${r.counter})`)];
    log(`  ${p.teamId}: totalPoints ${p.before} → ${p.before + p.plan.points} (+${p.plan.points}; ${parts.join(', ')})`);
  });
  const gaps = plans.filter((p) => p.plan.eligible && p.plan.gap.length);
  if (gaps.length) {
    log(`\nGAP — scored 2026 races with no snapshot and no reconstruction (any penalty there is NOT refunded): ${gaps.length} team(s)`);
    gaps.forEach((p) => log(`  ${p.teamId}: ${p.plan.gap.length} race(s): ${p.plan.gap.map((g) => `R${g.round}`).join(' ')}`));
  }
  const unexplained = plans.filter((p) => p.plan.eligible).flatMap((p) => p.plan.unexplained.map((u) => ({ teamId: p.teamId, ...u })));
  if (unexplained.length) {
    log(`\nUNEXPLAINED race adjustments, NOT refunded (review by hand): ${unexplained.length}`);
    unexplained.forEach((u) => log(`  ${u.teamId} ${u.raceId}: ${u.adjustment} (${u.why})`));
  }

  // League tables: every league of a team refunded now OR by an earlier run, so a run that died
  // before this step is finished by the next one. syncLeaguesForRace SETs member totals from the
  // team docs and re-ranks: repeating it changes nothing.
  const refundedEver = (p) => p.plan.eligible && (p.plan.points > 0 || p.plan.already.length > 0);
  const leagues = [...new Set(plans.filter((p) => refundedEver(p) && p.leagueId).map((p) => p.leagueId))];
  let synced = [];
  if (leagues.length && !latest) log('WARNING: no completed race this season to sync the leagues against; league tables NOT re-synced');
  if (leagues.length && latest) {
    if (dryRun) {
      log(`\nleagues to re-sync against ${latest.id}: ${leagues.length}`);
    } else {
      const members = teamsSnap.docs.filter((d) => { const t = d.data(); return t.leagueId && leagues.includes(t.leagueId) && t.userId; });
      const snaps = members.length ? await fs.getAll(...members.map((d) => d.ref.collection('raceSnapshots').doc(latest.id))) : [];
      const updates = [];
      members.forEach((d, i) => {
        if (!snaps[i].exists) return;
        const s = snaps[i].data();
        updates.push({ leagueId: d.data().leagueId, userId: d.data().userId, points: num(s.phases && s.phases.race && s.phases.race.points) });
      });
      const race = latest.data();
      synced = await syncLeagues(latest.id, { season: race.seasonId, round: race.round, name: race.name ?? null }, updates);
      log(`\nleagues re-synced against ${latest.id}: ${synced.length}`);
    }
  }

  // What the op's backup step must take (a collection backup does not include subcollections)
  const paths = [];
  for (const p of plans) {
    if (!p.plan.eligible || !p.plan.points) continue;
    paths.push(`fantasyTeams/${p.teamId}`);
    p.plan.snapshotRefunds.forEach((r) => paths.push(`fantasyTeams/${p.teamId}/raceSnapshots/${r.raceId}`));
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

module.exports = {
  SEASON, FILL_RACE, isVegasFilled, isSeasonSnapshot, fillUnconfirmedWhy, analyzeSnapshot, countersAgree,
  planTeamRefund, summarize, writeRefund, runRefund,
};

if (require.main === module) {
  requireFreshBuild();
  initAdmin();
  main().then(() => process.exit(0), (e) => { console.error(e.message || e); process.exit(1); });
}
