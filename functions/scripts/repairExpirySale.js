/**
 * Repair the contract-expiry sale price for the latest completed race (F-168).
 *
 * Phase 3.5 (contract expiry) read the teams before Phase 3 had written the post-race prices, so
 * an expired pick was sold at its pre-race price and the expiry write put the pre-race prices
 * back on the rest of the roster. Las Vegas 2026: one team was credited 53 too much, another 47
 * too little. F-168 fixes the code; this script fixes the teams it already happened to.
 *
 * For each team with a raceSnapshots/{raceId}: every pick whose contract ran out at this race
 * (racesHeld + 1 >= contractLength) and that is gone from the roster was sold for its snapshot
 * currentPrice; the right price is the post-race price in priceHistory/{raceId}__{id}. The
 * difference goes onto the budget, and the remaining roster gets today's market prices.
 * A team is done once: the snapshot is stamped expirySaleRepair.
 * The budget never goes below 0 (owner decision 2026-11-23): a team that was over-credited and has
 * spent the money gives back what it has, and the rest is forgiven (recorded as `forgiven`).
 *
 * Usage:
 *   node scripts/repairExpirySale.js            # dry run
 *   node scripts/repairExpirySale.js --apply
 *   (--race <id> on the command line names a race; the op uses the latest completed race)
 * Needs `npm run build` first.
 */
const admin = require('firebase-admin');
const EXPECTED_PROJECT = 'f1-app-18077';
const CONTRACT_LENGTH_DEFAULT = 3; // calculatePoints.ts
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

/** The compiled code must be current: a stale ../lib would run old scoring code against production. */
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
const raceArg = (() => { const i = process.argv.indexOf('--race'); return i > 0 ? process.argv[i + 1] : null; })();

/** Pure: the picks a team lost to contract expiry at this race, and the budget correction. */
function planTeam(snap, team, postPrice, marketPrice) {
  const roster = snap.roster || {};
  const picks = [
    ...(roster.drivers || []).map((d) => ({ ...d, id: d.driverId, kind: 'driver' })),
    ...(roster.constructor && roster.constructor.constructorId ? [{ ...roster.constructor, id: roster.constructor.constructorId, kind: 'constructor' }] : []),
  ];
  const stillHeld = (p) => p.kind === 'driver'
    ? (team.drivers || []).some((d) => d.driverId === p.id && (d.racesHeld || 0) >= (p.racesHeld || 0) + 1)
    : !!(team.constructor && team.constructor.constructorId === p.id && (team.constructor.racesHeld || 0) >= (p.racesHeld || 0) + 1);
  const sold = [];
  for (const p of picks) {
    const expired = (p.racesHeld || 0) + 1 >= (p.contractLength || CONTRACT_LENGTH_DEFAULT);
    if (!expired || stillHeld(p)) continue;
    const credited = typeof p.currentPrice === 'number' ? p.currentPrice : 0;
    const right = postPrice(p.id);
    if (right === undefined) continue; // did not race (no price change): sold at the right price
    sold.push({ id: p.id, credited, right, delta: right - credited });
  }
  const budgetDelta = sold.reduce((s, x) => s + x.delta, 0);
  const before = typeof team.budget === 'number' && Number.isFinite(team.budget) ? team.budget : 0;
  const raw = Math.round(before + budgetDelta);
  // A clawback stops at 0 (or at the budget, if that was already below 0): it never adds debt, and
  // never pays off debt the team had before. A credit is applied in full.
  const newBudget = budgetDelta >= 0 ? raw : Math.max(raw, Math.min(Math.round(before), 0));
  const forgiven = newBudget - raw; // > 0 only when the floor applied: the part of this repair not taken back
  // the rest of the roster: put today's market prices back where the expiry write reverted them
  let repriced = 0;
  const drivers = (team.drivers || []).map((d) => {
    const m = marketPrice(d.driverId);
    if (m !== undefined && m !== d.currentPrice) { repriced++; return { ...d, currentPrice: m }; }
    return d;
  });
  // own key only: a team doc with no constructor field would otherwise read Object.prototype.constructor
  // (a function) and the team write would fail on it
  let constructor = Object.prototype.hasOwnProperty.call(team, 'constructor') ? team.constructor || null : null;
  if (constructor && constructor.constructorId) {
    const m = marketPrice(constructor.constructorId);
    if (m !== undefined && m !== constructor.currentPrice) { repriced++; constructor = { ...constructor, currentPrice: m }; }
  }
  return { sold, budgetDelta, newBudget, forgiven, drivers, constructor, repriced };
}

async function main() {
  const { currentSeason } = require('../lib/season/current.js');
  let raceDoc;
  if (raceArg) {
    raceDoc = await db.collection('races').doc(raceArg).get();
  } else {
    const season = await currentSeason(db);
    const done = await db.collection('races').where('seasonId', '==', String(season)).where('status', '==', 'completed').get();
    raceDoc = done.docs.sort((a, b) => (b.data().round || 0) - (a.data().round || 0))[0];
  }
  if (!raceDoc || !raceDoc.exists) throw new Error('no race to repair');
  const raceId = raceDoc.id;
  console.log(`race: ${raceId}`);

  const post = new Map();
  (await db.collection('priceHistory').where('raceId', '==', raceId).get()).docs.forEach((d) => post.set(d.data().entityId, d.data().price));
  const market = new Map();
  (await db.collection('drivers').get()).docs.forEach((d) => market.set(d.id, d.data().price));
  (await db.collection('constructors').get()).docs.forEach((d) => market.set(d.id, d.data().price));

  const teams = await db.collection('fantasyTeams').get();
  let changed = 0;
  for (const teamDoc of teams.docs) {
    const snapRef = teamDoc.ref.collection('raceSnapshots').doc(raceId);
    const work = async (tx) => {
      const [t, s] = tx ? await Promise.all([tx.get(teamDoc.ref), tx.get(snapRef)]) : [teamDoc, await snapRef.get()];
      if (!s.exists || !t.exists) return null; // a deleted team is not recreated by the set below
      const snap = s.data();
      if (snap.expirySaleRepair) return null;
      const team = t.data();
      const plan = planTeam(snap, team, (id) => post.get(id), (id) => market.get(id));
      if (!plan.sold.length) return null;
      if (tx) {
        // set + mergeFields, not update(): update() cannot write a top-level `constructor` (see raceCorrection.ts)
        const teamWrite = { budget: plan.newBudget, drivers: plan.drivers, constructor: plan.constructor };
        tx.set(teamDoc.ref, teamWrite, { mergeFields: Object.keys(teamWrite) });
        tx.update(snapRef, { expirySaleRepair: { at: admin.firestore.Timestamp.now(), budgetDelta: plan.budgetDelta, forgiven: plan.forgiven, sold: plan.sold } });
      }
      return { plan, budget: typeof team.budget === 'number' && Number.isFinite(team.budget) ? team.budget : 0 };
    };
    const r = APPLY ? await db.runTransaction((tx) => work(tx)) : await work(null);
    if (!r) continue;
    changed++;
    const { plan, budget } = r;
    console.log(`  ${teamDoc.id}: budget ${budget} → ${plan.newBudget} (${plan.budgetDelta >= 0 ? '+' : ''}${plan.budgetDelta}); ` +
      plan.sold.map((x) => `${x.id} sold at ${x.credited}, should be ${x.right}`).join('; ') + `; ${plan.repriced} roster price(s) refreshed` +
      (plan.forgiven ? `  (floored at 0: ${plan.forgiven} forgiven)` : ''));
  }
  console.log(`${changed} team(s) ${APPLY ? 'repaired' : 'to repair'}; backup paths: ${teams.docs.length ? 'fantasyTeams' : '-'}`);
  if (!APPLY) console.log('DRY RUN — nothing written. Re-run with --apply.');
}

module.exports = { planTeam };

if (require.main === module) {
  requireFreshBuild();
  initAdmin();
  main().then(() => process.exit(0), (e) => { console.error(e.message || e); process.exit(1); });
}
