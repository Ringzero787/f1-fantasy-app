/**
 * Give back the stale-roster penalties taken from the teams auto-filled at Las Vegas 2026 (F-170),
 * and reset their counter as the F-170 rule would have.
 *
 * Race scoring (calculatePoints.ts, Phase 1) takes (racesSinceTransfer − 5) × 5 points from a team
 * that has made no transfer for more than five races, then increments racesSinceTransfer; a
 * purchase or transfer resets it to 0. Auto-fill (lock sweep, autoFill.ts) did not reset it, so an
 * abandoned team that auto-fill kept full was penalised more every race; F-170 makes a fill reset
 * it. Owner decision 2026-11-24: every team auto-filled at Las Vegas gets back EVERY stale-roster
 * penalty it took this season, before the Qatar lock.
 *
 * WHO. The server-written Las Vegas snapshot (raceSnapshots are `allow write: if false`) decides.
 * Since F-044 (2026-09-17) only the lock sweep writes isReservePick: true (player purchases never
 * set it; `drivers`/`constructor` are server-only), and racesHeld 0 means the pick was added for
 * this race. A team is in scope when that snapshot holds such a pick, or when lastAutoFill names
 * Las Vegas — so a refill at Qatar, which overwrites lastAutoFill, does not drop a team. When
 * lastAutoFill names Las Vegas (it was client-writable before F-170), every pick it names must be
 * such a pick on the snapshot; otherwise the team is INELIGIBLE and gets nothing.
 *
 * COUNTER. Every eligible team's racesSinceTransfer becomes min(current, 1): the value the F-170
 * rule gives (reset by the Vegas fill, +1 by Vegas scoring). Without it a team Qatar's sweep does
 * not touch would take the penalty again. This happens whatever the refund (even 0, even refused).
 *
 * WHAT, from snapshots (round 17 on: F-029 started recording snapshots after round 16 had scored).
 * buildRaceSnapshot writes the part of a phase's points that no roster entity earned as
 * `phases.race.adjustment`. The stale penalty is the only deduction in a race phase. A negative
 * adjustment is refunded only when it is shaped like one: a multiple of 5, equal to
 * points − Σentities, every entity finite, race points not 0 (a run coerced to 0 points looks like
 * −Σentities), and no driver listed twice on the roster (the one other way to get a nonzero
 * adjustment). Consecutive snapshots must fit the counter rule; an outlier is UNEXPLAINED.
 *
 * WHAT, reconstructed (races before the first snapshot). The counter before a race is the number of
 * races the team was scored in since its last transfer; the penalty is max(0, (counter − 5) × 5).
 * The earliest snapshot, when it carries a stale penalty, gives c0 = 5 − adjustment / 5. Walking back
 * through the team's scored 2026 races (scoredRaces ∩ this season's race docs, by round; `sprint_`/
 * `quali_` keys are not race scorings), race k back had counter c0 − k, down to 0 (the last transfer).
 * Only races run on or after 2026-06-13 are refunded: before 2df4a16 the counter and scoredRaces
 * were client-writable and the repair paths (including the 2026-05-30 de-doubling) added race ids to
 * scoredRaces without moving the counter. Earlier races still count as steps; they are listed as GAP.
 * No reconstruction (UNEXPLAINED) when:
 *   - the near-end cross-check fails: today's racesSinceTransfer (or, after a first run, the value
 *     it had before this repair reset it) must equal the counter at the latest penalised snapshot
 *     plus the scored races from that snapshot on;
 *   - c0 is longer than the scored races before it;
 *   - scoredRaces holds a 2026 race id no race doc places, or a race in the window is not completed.
 * It also does not run when the first snapshot shows no penalty or is itself unexplained.
 *
 * WRITES, one transaction per team (only when something changes):
 *   fantasyTeams/{id}: totalPoints += refund; racesSinceTransfer = min(current, 1);
 *     staleRefund = { at, races: { raceId: points }, total, counterBefore } (reconstructed races,
 *     merged with any earlier run's; counterBefore is the counter before the first reset) — set +
 *     mergeFields naming only those fields, never update() (#305 / autoFill.ts);
 *   fantasyTeams/{id}/raceSnapshots/{raceId}: staleRefund = { at, points } on each refunded snapshot.
 * Snapshot phases, bestRacePoints and earlier weekend leaderboards do not change. A rerun skips
 * stamped snapshots and races already in staleRefund.races, and finds the counter already ≤ 1.
 *
 * LEAGUES. On every --apply run, every league of an eligible team that has had any refund (this run
 * or an earlier one) is re-synced through syncLeaguesForRace — scoring's own Phase 4, which sets
 * member totals from the team docs, so it is safe to repeat and a run that died before this step is
 * finished by the next. It runs for Las Vegas, the latest completed race, with each team's
 * (unchanged) race points from its snapshot: lastRacePoints stays, previousRank is not re-snapshotted,
 * and the weekend leaderboard is rewritten with the same numbers. --apply is refused once a later
 * race has completed (the sync would rewrite that weekend's lastRacePoints and leaderboard).
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
// Before 2df4a16 (2026-06-13) racesSinceTransfer and scoredRaces were client-writable, and the repair
// paths (repairTeamScoring, the 2026-05-30 de-doubling) added race ids to scoredRaces without moving the
// counter. The walk-back still counts those races; it refunds only races from this date on.
const TRUSTED_FROM = '2026-06-13';
const TRUSTED_FROM_MS = Date.parse(`${TRUSTED_FROM}T00:00:00Z`);
const GAP_UNTRUSTED = `before ${TRUSTED_FROM}: counter and scoredRaces were not server-only, repair paths rewrote scoredRaces`;
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

/** Pure: lastAutoFill names the Las Vegas lock (client-writable before F-170: trusted only once the snapshot confirms it). */
function stampNamesVegas(team) {
  return !!(team && team.lastAutoFill && typeof team.lastAutoFill === 'object' && team.lastAutoFill.raceId === FILL_RACE);
}

/** Pure: a pick the lock sweep added for this race (only it writes isReservePick: true since F-044). */
const isFreshFill = (p) => !!p && typeof p === 'object' && p.racesHeld === 0 && p.isReservePick === true;

/** Pure: the server-written Las Vegas snapshot holds a pick the Vegas lock sweep put there. */
function snapshotShowsFill(vegasSnap) {
  const r = vegasSnap && vegasSnap.roster;
  if (!r) return false;
  return (Array.isArray(r.drivers) && r.drivers.some(isFreshFill)) || (own(r, 'constructor') && isFreshFill(r.constructor));
}

/** Pure: in scope for this repair — the Vegas snapshot shows a fill, or lastAutoFill names Vegas. */
function inScope(team, vegasSnap) {
  return snapshotShowsFill(vegasSnap) || stampNamesVegas(team);
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
  if (!vegasSnap || !vegasSnap.roster) return `no ${FILL_RACE} snapshot to confirm the fill`;
  if (!stampNamesVegas(team)) return snapshotShowsFill(vegasSnap) ? null : `no auto-filled pick on the ${FILL_RACE} roster`;
  const f = team.lastAutoFill;
  const driverIds = Array.isArray(f.driverIds) ? f.driverIds : [];
  const ctorId = typeof f.constructorId === 'string' && f.constructorId ? f.constructorId : null;
  if (!driverIds.length && !ctorId) return 'lastAutoFill names no pick';
  const rosterDrivers = Array.isArray(vegasSnap.roster.drivers) ? vegasSnap.roster.drivers : [];
  for (const id of driverIds) {
    if (!isFreshFill(rosterDrivers.find((d) => d && d.driverId === id))) return `${id} is not an auto-filled pick on the ${FILL_RACE} roster`;
  }
  if (ctorId) {
    const c = own(vegasSnap.roster, 'constructor') ? vegasSnap.roster.constructor : null;
    if (!(c && c.constructorId === ctorId && isFreshFill(c))) return `${ctorId} is not the auto-filled constructor on the ${FILL_RACE} roster`;
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
 * Pure: one team's refund. `snaps` is [{ id, data }] of its raceSnapshots; `races` maps this season's
 * race ids to { round, status, raceMs } (raceMs: schedule.race in ms, or null). Null for a team out
 * of scope (no fill on its Vegas snapshot and no lastAutoFill naming Vegas).
 */
function planTeamRefund(team, snaps, races) {
  const seasonSnaps = snaps.filter(({ id, data }) => isSeasonSnapshot(id, data));
  const vegas = seasonSnaps.find((s) => s.id === FILL_RACE);
  if (!team || !inScope(team, vegas && vegas.data)) return null;
  const plan = {
    eligible: true, ineligibleWhy: null,
    snapshotRefunds: [], reconstructed: [], already: [], unexplained: [], gap: [],
    snapshotPoints: 0, reconPoints: 0, points: 0, vegasPoints: 0,
    staleRefund: null, counter: null, crossCheck: null,
  };
  const why = fillUnconfirmedWhy(team, vegas && vegas.data);
  if (why) { plan.eligible = false; plan.ineligibleWhy = why; return plan; }

  const prior = team.staleRefund && typeof team.staleRefund === 'object' ? team.staleRefund : {};
  const priorRaces = prior.races && typeof prior.races === 'object' ? prior.races : {};
  const current = typeof team.racesSinceTransfer === 'number' && Number.isFinite(team.racesSinceTransfer) ? team.racesSinceTransfer : null;
  // the F-170 value: reset by the Vegas fill, +1 by Vegas scoring; a later transfer (0) is kept
  if (current !== null && current > 1) plan.counter = { before: current, after: 1 };
  // what the counter was before this repair first reset it
  const counterBefore = typeof prior.counterBefore === 'number' ? prior.counterBefore : current;

  const round = (id) => {
    if (races.has(id)) return races.get(id).round;
    const s = seasonSnaps.find((x) => x.id === id);
    return s && typeof s.data.round === 'number' ? s.data.round : null;
  };
  const scoredRaces = Array.isArray(team.scoredRaces) ? team.scoredRaces.filter((x) => typeof x === 'string') : [];
  const scored = new Set(scoredRaces.filter((id) => races.has(id)));
  // a 2026 race id in scoredRaces that no race doc explains cannot be placed in the walk
  const unplaced = scoredRaces.filter((id) => !races.has(id) && /_2026$/.test(id) && !/^(quali|sprint)_/.test(id));
  const info = new Map();
  for (const { id, data } of seasonSnaps) {
    const a = analyzeSnapshot(data);
    if (!a.race) continue;
    info.set(id, a);
    scored.add(id);
  }
  const order = [...scored].filter((id) => round(id) !== null).sort((a, b) => round(a) - round(b) || (a < b ? -1 : 1));

  // Consecutive snapshots must agree on the counter. On a disagreement the snapshot that also
  // disagrees with its other neighbour is the outlier; an isolated disagreement blames the earlier
  // one (the earliest snapshots are the least trusted), except on the last pair, where the latest
  // one is the outlier if the pair before agreed.
  const snapIdx = order.map((id, i) => (info.has(id) ? i : -1)).filter((i) => i >= 0);
  const pairs = [];
  for (let k = 0; k + 1 < snapIdx.length; k++) {
    const j = snapIdx[k]; const i = snapIdx[k + 1];
    const a = info.get(order[j]); const b = info.get(order[i]);
    const fails = a.kind !== 'unexplained' && b.kind !== 'unexplained' && !countersAgree(a, b, i - j);
    pairs.push({ j, i, a, b, fails });
  }
  const flag = (idx, why) => {
    const a = info.get(order[idx]);
    if (a.kind === 'unexplained') return;
    info.set(order[idx], { ...a, kind: 'unexplained', why, adjustment: a.kind === 'stale' ? -a.points : 0 });
  };
  pairs.forEach((p, k) => {
    if (!p.fails) return;
    const why = `counter ${p.a.kind === 'stale' ? p.a.counter : '≤5'} at ${order[p.j]} and ${p.b.counter} at ${order[p.i]} do not fit the counter rule`;
    const next = pairs[k + 1]; const prev = pairs[k - 1];
    if (next && next.fails) flag(p.i, why);
    else if (prev && prev.fails) flag(p.j, why);
    else if (!next && prev) flag(p.i, why);
    else flag(p.j, why);
  });

  const at = (id) => ({ raceId: id, round: round(id) });
  for (const i of snapIdx) {
    const id = order[i]; const a = info.get(id);
    if (a.kind === 'stale') {
      if (a.stamped !== null) plan.already.push({ ...at(id), points: a.stamped, source: 'snapshot' });
      else plan.snapshotRefunds.push({ ...at(id), points: a.points });
    } else if (a.kind === 'unexplained' && a.stamped === null && a.why !== 'positive adjustment') {
      plan.unexplained.push({ ...at(id), adjustment: a.adjustment, why: a.why });
    }
  }

  // ── reconstruction before the earliest snapshot ──
  const gapWhy = new Map(); // race id → why it is neither snapshotted nor refunded
  const s0 = snapIdx.length ? snapIdx[0] : order.length;
  const anchor = snapIdx.length ? info.get(order[s0]) : null;
  const before = order.slice(0, s0);
  if (!anchor || anchor.kind !== 'stale') {
    before.forEach((id) => gapWhy.set(id, anchor ? 'first snapshot shows no counter to count back from' : 'no snapshot to count back from'));
  } else {
    // near end: scoring takes the penalty, then increments the counter; only a transfer or a fill
    // (F-170, from the Qatar lock) resets it
    const latest = [...snapIdx].reverse().find((i) => info.get(order[i]).kind === 'stale');
    const expected = info.get(order[latest]).counter + (order.length - latest);
    plan.crossCheck = { expected, actual: counterBefore, ok: counterBefore === expected };
    const window = order.slice(Math.max(0, s0 - anchor.counter), s0);
    const notDone = window.filter((id) => !races.has(id) || races.get(id).status !== 'completed');
    let refused = null;
    if (!plan.crossCheck.ok) refused = `racesSinceTransfer is ${counterBefore ?? 'missing'}, the snapshots imply ${expected}`;
    else if (anchor.counter > s0) refused = `counter ${anchor.counter} but only ${s0} scored race(s) before it`;
    else if (unplaced.length) refused = `scoredRaces holds ${unplaced.join(', ')}, which no race doc places`;
    else if (notDone.length) refused = `scoredRaces holds ${notDone.join(', ')}, which is not a completed race`;
    if (refused) {
      plan.unexplained.push({ ...at(order[s0]), adjustment: -anchor.points, why: `${refused}: earlier races not reconstructed` });
      before.forEach((id) => gapWhy.set(id, 'reconstruction refused (see UNEXPLAINED)'));
    } else {
      before.slice(0, s0 - anchor.counter).forEach((id) => gapWhy.set(id, 'before the last transfer'));
      for (let k = 1; k <= anchor.counter; k++) {
        const id = order[s0 - k];
        const counter = anchor.counter - k;
        const pts = penaltyAt(counter);
        if (pts <= 0) continue; // no penalty there
        const ms = races.get(id).raceMs;
        if (typeof ms !== 'number' || !Number.isFinite(ms)) { gapWhy.set(id, `no race date to place it after ${TRUSTED_FROM}`); continue; }
        if (ms < TRUSTED_FROM_MS) { gapWhy.set(id, GAP_UNTRUSTED); continue; }
        if (own(priorRaces, id)) plan.already.push({ ...at(id), points: num(priorRaces[id]), source: 'reconstructed' });
        else plan.reconstructed.push({ ...at(id), points: pts, counter });
      }
    }
  }
  order.slice(s0).forEach((id) => { if (!info.has(id)) gapWhy.set(id, 'scored with no snapshot'); });
  plan.gap = order.filter((id) => gapWhy.has(id)).map((id) => ({ ...at(id), why: gapWhy.get(id) }));

  const byRound = (a, b) => (a.round ?? 99) - (b.round ?? 99);
  plan.snapshotRefunds.sort(byRound); plan.reconstructed.sort(byRound); plan.already.sort(byRound);
  plan.snapshotPoints = plan.snapshotRefunds.reduce((s, r) => s + r.points, 0);
  plan.reconPoints = plan.reconstructed.reduce((s, r) => s + r.points, 0);
  plan.points = plan.snapshotPoints + plan.reconPoints;
  plan.vegasPoints = plan.snapshotRefunds.filter((r) => r.raceId === FILL_RACE).reduce((s, r) => s + r.points, 0);
  if (plan.reconstructed.length || plan.counter || plan.points) {
    const racesMap = { ...priorRaces };
    plan.reconstructed.forEach((r) => { racesMap[r.raceId] = r.points; });
    plan.staleRefund = { races: racesMap, total: Object.values(racesMap).reduce((s, v) => s + num(v), 0), counterBefore: counterBefore ?? null };
  }
  return plan;
}

/** Pure: something to write for this team. */
const needsWrite = (plan) => !!(plan && plan.eligible && (plan.points || plan.counter || plan.reconstructed.length));

/** Pure: totals across teams for the printout. `plans` is [{ teamId, name, plan }]. */
function summarize(plans) {
  const byRace = new Map();
  const s = { teams: 0, total: 0, snapshotTotal: 0, reconTotal: 0, vegas: 0, vegasTeams: 0, worst: null, races: [], ineligible: [],
    eligible: 0, counterResets: 0, crossChecked: 0, crossCheckPassed: 0 };
  for (const { teamId, name, plan } of plans) {
    if (!plan) continue;
    if (!plan.eligible) { s.ineligible.push({ teamId, why: plan.ineligibleWhy }); continue; }
    s.eligible++;
    if (plan.counter) s.counterResets++;
    if (plan.crossCheck) { s.crossChecked++; if (plan.crossCheck.ok) s.crossCheckPassed++; }
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
  if (!needsWrite(plan)) return;
  // set + mergeFields, never update(): a team doc carries a top-level `constructor`, and update()
  // expands keys as field paths into Object.prototype.constructor (#305, autoFill.ts). Only the
  // fields this repair changes are named, so nothing else on the team can be rewritten.
  const teamWrite = {};
  if (plan.points) teamWrite.totalPoints = num(team.totalPoints) + plan.points;
  if (plan.counter) teamWrite.racesSinceTransfer = plan.counter.after;
  if (plan.staleRefund) teamWrite.staleRefund = { at, ...plan.staleRefund };
  tx.set(teamRef, teamWrite, { mergeFields: Object.keys(teamWrite) });
  for (const r of plan.snapshotRefunds) {
    tx.update(teamRef.collection('raceSnapshots').doc(r.raceId), { staleRefund: { at, points: r.points } });
  }
}

const seasonQuery = (fs) => fs.collection('races').where('seasonId', 'in', [SEASON, Number(SEASON)]);
const millis = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : typeof v === 'string' || typeof v === 'number' ? new Date(v).getTime() : null);

/**
 * The repair against a Firestore handle (production from main(); the emulator in the test).
 * `syncLeagues` is calculatePoints.syncLeaguesForRace, `currentSeason` season/current.currentSeason.
 */
async function runRefund(fs, { dryRun, syncLeagues, currentSeason, log = console.log }) {
  const season = await currentSeason(fs);
  if (season !== SEASON) throw new Error(`refusing: the current season is ${season}, not ${SEASON} — after the rollover these are new teams`);

  // race docs may store seasonId as '2026' or 2026
  const raceDocs = (await seasonQuery(fs).get()).docs;
  const races = new Map(raceDocs.filter((d) => typeof d.data().round === 'number').map((d) => {
    const r = d.data();
    const ms = millis(r.schedule && r.schedule.race);
    return [d.id, { round: r.round, status: r.status, raceMs: Number.isFinite(ms) ? ms : null }];
  }));
  const latest = raceDocs.filter((d) => d.data().status === 'completed').sort((a, b) => (b.data().round || 0) - (a.data().round || 0))[0] || null;
  if (latest && latest.id !== FILL_RACE) {
    const msg = `a race after ${FILL_RACE} has completed (${latest.id}): the league sync would rewrite that weekend's lastRacePoints and leaderboard, and fills since are out of the owner's decision`;
    if (!dryRun) throw new Error(`refusing --apply: ${msg}`);
    log(`WARNING *** ${msg}. --apply will refuse. ***`);
  }

  const teamsSnap = await fs.collection('fantasyTeams').get();
  // every team's Las Vegas snapshot: the server-written record of who was filled there
  const vegasSnaps = teamsSnap.size ? await fs.getAll(...teamsSnap.docs.map((d) => d.ref.collection('raceSnapshots').doc(FILL_RACE))) : [];
  const candidates = teamsSnap.docs.filter((d, i) => inScope(d.data(), vegasSnaps[i].exists ? vegasSnaps[i].data() : null));
  const refilled = candidates.filter((d) => { const f = d.data().lastAutoFill; return f && f.raceId && f.raceId !== FILL_RACE; }).length;

  const at = admin.firestore.Timestamp.now();
  const plans = [];
  for (const teamDoc of candidates) {
    const snapsRef = teamDoc.ref.collection('raceSnapshots');
    const work = async (tx) => {
      const [t, s] = tx ? await Promise.all([tx.get(teamDoc.ref), tx.get(snapsRef)]) : [teamDoc, await snapsRef.get()];
      if (!t.exists) return null; // deleted since the list was read: set() must not recreate it
      const team = t.data();
      const plan = planTeamRefund(team, s.docs.map((d) => ({ id: d.id, data: d.data() })), races);
      if (!plan) return null;
      if (tx) writeRefund(tx, teamDoc.ref, team, plan, at);
      return { plan, before: num(team.totalPoints) };
    };
    const r = dryRun ? await work(null) : await fs.runTransaction((tx) => work(tx));
    if (!r) continue;
    const t = teamDoc.data();
    plans.push({ teamId: teamDoc.id, name: t.name, leagueId: t.leagueId || null, plan: r.plan, before: r.before });
  }

  const sum = summarize(plans);
  const sign = (n) => `+${n}`;
  log(`season ${SEASON}; in scope (fill on the ${FILL_RACE} snapshot, or lastAutoFill names it): ${candidates.length} team(s) of ${teamsSnap.size}; eligible: ${sum.eligible}`);
  if (refilled) log(`  ${refilled} of them were auto-filled again since (lastAutoFill names a later race): kept in by their ${FILL_RACE} snapshot`);
  if (sum.ineligible.length) {
    log(`\nINELIGIBLE (lastAutoFill not confirmed by the server-written snapshot), NOT refunded: ${sum.ineligible.length}`);
    sum.ineligible.forEach((x) => log(`  ${x.teamId}: ${x.why}`));
  }
  const alreadyTeams = plans.filter((p) => p.plan.eligible && p.plan.already.length).length;
  log(`\nteams ${dryRun ? 'to refund' : 'refunded'}: ${sum.teams}` + (alreadyTeams ? ` (${alreadyTeams} team(s) refunded by an earlier run: not refunded twice)` : ''));
  log(`TOTAL refund: ${sign(sum.total)} points`);
  log(`  from snapshots (recorded penalties):   ${sign(sum.snapshotTotal)}`);
  log(`  reconstructed from the counter:        ${sign(sum.reconTotal)}  (races from ${TRUSTED_FROM} only)`);
  log(`  ${FILL_RACE} only: ${sign(sum.vegas)} points across ${sum.vegasTeams} team(s)`);
  log(`counter reset to 1 (the F-170 value): ${sum.counterResets} team(s)`);
  log(`near-end counter cross-check: ${sum.crossCheckPassed} of ${sum.crossChecked} team(s) with a penalised first snapshot passed`);
  log('per race:                          snapshot  reconstructed  teams');
  sum.races.forEach((r) => log(`  R${String(r.round ?? '?').padStart(2)} ${r.raceId.padEnd(26)} ${sign(r.snapshot).padStart(8)}  ${sign(r.reconstructed).padStart(13)}  ${String(r.teams).padStart(5)}`));
  if (sum.worst) log(`worst team: ${sum.worst.teamId}${sum.worst.name ? ` (${sum.worst.name})` : ''} ${sign(sum.worst.points)} over ${sum.worst.races} race(s)`);
  log('\nper team:');
  plans.filter((p) => needsWrite(p.plan)).sort((a, b) => b.plan.points - a.plan.points).forEach((p) => {
    const parts = [...p.plan.snapshotRefunds.map((r) => `${r.raceId} +${r.points}`), ...p.plan.reconstructed.map((r) => `${r.raceId} +${r.points} (reconstructed, counter ${r.counter})`)];
    log(`  ${p.teamId}: totalPoints ${p.before} → ${p.before + p.plan.points} (+${p.plan.points}${parts.length ? `; ${parts.join(', ')}` : ''})` +
      (p.plan.counter ? `; counter ${p.plan.counter.before} → ${p.plan.counter.after}` : ''));
  });
  const gaps = plans.filter((p) => p.plan.eligible && p.plan.gap.length);
  if (gaps.length) {
    log(`\nGAP — scored 2026 races with no snapshot and nothing reconstructed (any penalty there is NOT refunded): ${gaps.length} team(s)`);
    gaps.forEach((p) => {
      const byWhy = new Map();
      p.plan.gap.forEach((g) => byWhy.set(g.why, [...(byWhy.get(g.why) || []), `R${g.round}`]));
      log(`  ${p.teamId}: ${[...byWhy.entries()].map(([w, rs]) => `${rs.length} race(s): ${rs.join(' ')} (${w})`).join('; ')}`);
    });
  }
  const unexplained = plans.filter((p) => p.plan.eligible).flatMap((p) => p.plan.unexplained.map((u) => ({ teamId: p.teamId, ...u })));
  if (unexplained.length) {
    log(`\nUNEXPLAINED, NOT refunded (review by hand): ${unexplained.length}`);
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
    if (!needsWrite(p.plan)) continue;
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
  return { ...sum, plans, unexplained, leagues, synced, latestRaceId: latest ? latest.id : null, refilled };
}

async function main() {
  // The compiled modules create their Firestore client on load: require them after initAdmin.
  const { syncLeaguesForRace } = require('../lib/scoring/calculatePoints.js');
  const { currentSeason } = require('../lib/season/current.js');
  await runRefund(db, { dryRun: !APPLY, syncLeagues: syncLeaguesForRace, currentSeason });
}

module.exports = {
  SEASON, FILL_RACE, TRUSTED_FROM, stampNamesVegas, snapshotShowsFill, inScope, isSeasonSnapshot, fillUnconfirmedWhy,
  analyzeSnapshot, countersAgree, planTeamRefund, needsWrite, summarize, writeRefund, runRefund,
};

if (require.main === module) {
  requireFreshBuild();
  initAdmin();
  main().then(() => process.exit(0), (e) => { console.error(e.message || e); process.exit(1); });
}
