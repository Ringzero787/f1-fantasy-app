// Change who holds a seat in the game's driver list (F-138): retire one driver, add the one who
// replaces him. São Paulo 2026: Haas dropped Ocon after Mexico City and put Rafael Câmara in the
// car (number 51 — F-139; F-138 first wrote 50, Hirakawa's Mexico City number) for the rest of the season.
//
// A retired driver keeps his document (results and price history stay readable) with
// `isActive: false`: the app lists active drivers only, the buy callable refuses an inactive one,
// the Moonshot seat rule stops counting him as a regular, and the model seeder stops expecting a
// row for him. The replacement is a new document with a starting price and no points; his price
// then moves with his results like everyone's. `add: null` retires a driver with no replacement.
//
// Teams that still hold him (F-155). With `refundHolders: false` (the F-138 behaviour) the script
// refuses to write while anyone holds the retiring driver (roster, ace, lockout or streak entry).
// With `refundHolders: true` — the 2027 grid seed (F-156), when the market has been open on the
// 2026 grid since the rollover (owner decision 2026-11-24) — the apply retires him first (so nobody
// can buy him again), then takes him off every holding team in one transaction per team with his
// current price credited to its budget, his ace slot, lockout and streak entry cleared
// (functions/src/teams/retireDriver.ts says what is written and why racesSinceTransfer is not).
// A team that fails is reported and the run goes on; a re-run finds only the teams still holding him.
// Either way it refuses while a weekend is live, a holding team is locked, or he has an open Moonshot.
//
// Why this script and not a new one: retiring a held driver and refunding his holders are one
// change. Split across two ops there would be a window in which teams hold an inactive driver the
// scorer still scores, or are refunded for a driver the market still sells; here one op, one
// backup (drivers/<retire>,drivers/<add>,fantasyTeams) and one rollback cover both.
//
// Dry run by default: prints the live documents beside DESIRED, the holders and, per team, the
// refund it would get. `--apply` writes. The uc-script op kind passes only --apply, so to change the
// seat, the price or refundHolders in production, edit DESIRED here, commit, and raise a new
// uc-script op (backup=drivers/<retire>,drivers/<add>,fantasyTeams). Needs `npm run build` (it
// reads ../lib/teams/retireDriver.js and ../lib/locks/lockState.js).
const path = require('path');
const admin = require('firebase-admin');

const EXPECTED_PROJECT = 'f1-app-18077';

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

/** The seat change. `add` is the whole document for a driver the game has never seen, or null. */
const DESIRED = {
  retire: 'ocon',
  // F-155: true takes him off every team that holds him, with his price refunded (see the header)
  refundHolders: false,
  add: {
    id: 'camara',
    name: 'Rafael Câmara',
    shortName: 'CAM',
    number: 51,
    constructorId: 'haas',
    constructorName: 'MoneyGram Haas F1 Team',
    nationality: 'Brazilian',
    // a debutant in the Haas: top of tier C (TIER_B_THRESHOLD is 120 in scoring), under the ace cap,
    // cheaper than every regular on the grid but not a free pick; the market moves it from here.
    // A driver new in 2027 opens at seasons/2027.newcomerPrice instead (F-155: the median driver).
    price: 120,
    previousPrice: 120,
    tier: 'C',
    fantasyPoints: 0,
    seasonPoints: 0,
    isActive: true,
  },
};

/** Fields a re-run never resets on an existing replacement document: his economy is his own by then. */
const ECONOMY = ['price', 'previousPrice', 'tier', 'fantasyPoints', 'seasonPoints'];

const ID = /^[a-z_]+$/;

function lib(name) {
  try {
    return require(path.join(__dirname, '..', 'lib', ...name.split('/')));
  } catch (e) {
    throw new Error(`functions/lib is not built (${e.message}). Run: npm --prefix functions run build`);
  }
}

/** Everyone the retiring driver would be taken from: teams that hold him in any way, open Moonshots. */
async function holdersOf(fs, driverId, holdsDriver) {
  const teams = await fs.collection('fantasyTeams').get();
  const holders = [];
  for (const t of teams.docs) if (holdsDriver(t.data(), driverId)) holders.push({ id: t.id, data: t.data() });
  const calls = await fs.collection('moonshots').where('driverId', '==', driverId).get();
  // the open set the eligibility rules use (functions/src/moonshot/eligibility.ts OPEN_STATUSES): a call goes LIVE at lights-out
  const open = calls.docs.filter((c) => ['CONFIRMED', 'LOCKED', 'LIVE'].includes(c.data().status)).map((c) => c.id);
  return { holders, open };
}

/**
 * The whole run against `fs` (production, or the emulator in the F-155 test). Returns a summary;
 * throws when an apply is refused.
 */
async function run(fs, desired, { apply, log = console.log, warn = console.warn }) {
  const { retireSale, holdsDriver, retireBlockers } = lib('teams/retireDriver.js');
  const { liveLockState } = lib('locks/lockState.js');
  const { FieldValue } = admin.firestore;
  const { retire, add, refundHolders } = desired;
  if (!ID.test(retire) || (add && (!ID.test(add.id) || retire === add.id))) throw new Error('DESIRED ids must be plain ids and differ');

  const retireRef = fs.doc(`drivers/${retire}`);
  const addRef = add ? fs.doc(`drivers/${add.id}`) : null;
  const [retireSnap, addSnap] = await Promise.all([retireRef.get(), addRef ? addRef.get() : null]);
  if (!retireSnap.exists) throw new Error(`drivers/${retire} not found`);
  const live = retireSnap.data();
  log(`== retire drivers/${retire}: ${live.name} (${live.constructorId}, $${live.price}, isActive=${live.isActive})`);

  const { holders, open } = await holdersOf(fs, retire, holdsDriver);
  const plans = holders.map((h) => ({ id: h.id, sale: retireSale(h.data, retire, live.price), locked: h.data.isLocked === true }));
  const onRoster = plans.filter((p) => p.sale.onRoster).length;
  log(`== holders of ${retire}: ${holders.length} team(s) (${onRoster} roster, ${plans.filter((p) => p.sale.aceCleared).length} ace, ${plans.filter((p) => p.sale.lockoutCleared || p.sale.streakCleared).length} lockout/streak), ${open.length} open Moonshot(s)`);
  for (const p of plans) {
    log(`  ${p.id}: ${p.sale.onRoster ? `refund $${p.sale.refund}${p.sale.banked ? `, ${p.sale.banked} pts banked` : ''}` : 'not on the roster'}${p.sale.aceCleared ? ', ace cleared' : ''}${p.sale.lockoutCleared ? ', lockout cleared' : ''}${p.sale.streakCleared ? ', streak cleared' : ''}${p.locked ? '  (LOCKED)' : ''}`);
  }
  const blockers = retireBlockers({ lockedHolders: plans.filter((p) => p.locked).map((p) => p.id), weekendLive: !!(await liveLockState(fs)), openMoonshots: open });
  if (holders.length && !refundHolders) blockers.push(`${retire} is still held by ${holders.length} team(s) and DESIRED.refundHolders is false`);
  for (const b of blockers) warn(`!! ${b} — nothing will be written`);

  let addDoc = null;
  if (add) {
    const addLive = addSnap.exists ? addSnap.data() : null;
    addDoc = addLive ? { ...add, ...Object.fromEntries(ECONOMY.filter((k) => k in addLive).map((k) => [k, addLive[k]])) } : { ...add };
    log(`== add drivers/${add.id}: ${addLive ? 'exists — identity fields merged, economy kept' : 'new'}`);
    log(JSON.stringify(addDoc, null, 2));
    if (live.constructorId !== add.constructorId) warn(`!! ${retire} drives ${live.constructorId}, ${add.id} would drive ${add.constructorId}: not the same seat`);
    addDoc._new = !addLive;
  } else {
    log('== no replacement (add: null)');
  }

  const summary = { holders: holders.length, refunded: 0, refundTotal: 0, failed: [], blockers };
  if (!apply) { log('== dry run: nothing written (add --apply)'); return summary; }
  if (blockers.length) throw new Error(`refusing to retire ${retire}: ${blockers.join('; ')}`);

  // 1. retire first: from here nobody can buy him, so the holder list can only shrink
  const batch = fs.batch();
  batch.set(retireRef, { isActive: false, retiredAt: FieldValue.serverTimestamp(), retiredFor: add ? add.id : null }, { merge: true });
  if (add) {
    const { _new, ...doc } = addDoc;
    batch.set(addRef, { ...doc, ...(_new ? { createdAt: FieldValue.serverTimestamp() } : {}) }, { merge: true });
  }
  await batch.commit();
  log(`== wrote drivers/${retire} (isActive=false)${add ? ` and drivers/${add.id} (isActive=true, $${addDoc.price})` : ''}`);

  // 2. one transaction per holding team, re-read inside it: a team edited since the read is planned again
  for (const h of holders) {
    const teamRef = fs.doc(`fantasyTeams/${h.id}`);
    try {
      const done = await fs.runTransaction(async (tx) => {
        const [teamSnap, driverSnap] = await Promise.all([tx.get(teamRef), tx.get(retireRef)]);
        // set + mergeFields would create a missing team: one deleted since the read stays deleted
        if (!teamSnap.exists) return null;
        const team = teamSnap.data();
        if (team.isLocked === true) throw new Error('team is locked');
        const sale = retireSale(team, retire, driverSnap.data().price);
        if (!sale) return null;
        const data = { ...sale.patch, updatedAt: FieldValue.serverTimestamp() };
        // set + mergeFields, NOT update(): update() expands keys as field paths and cannot write a
        // top-level `constructor` (#305). Each name is a literal FieldPath segment.
        tx.set(teamRef, data, { mergeFields: Object.keys(data).map((k) => new admin.firestore.FieldPath(k)) });
        return sale;
      });
      if (done) {
        summary.refunded++;
        summary.refundTotal += done.refund;
        log(`  ✔ ${h.id}: ${done.onRoster ? `refunded $${done.refund}` : 'cleared'}`);
      } else {
        log(`  – ${h.id}: no longer holds ${retire} (or deleted)`);
      }
    } catch (e) {
      summary.failed.push(`${h.id}: ${e.message}`);
      warn(`!! ${h.id} failed and was skipped: ${e.message}`);
    }
  }
  if (summary.failed.length) throw new Error(`${summary.failed.length} team(s) failed (${summary.failed.join('; ')}); ${summary.refunded} written. Re-run: only teams still holding ${retire} are touched.`);
  log(`== ${summary.refunded} team(s) written, $${summary.refundTotal} refunded; the market cache refreshes within 30 minutes`);
  return summary;
}

/** The op's entry: production, DESIRED as committed. */
function main(apply) {
  return run(db, DESIRED, { apply });
}

module.exports = { run, DESIRED };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const unknown = argv.filter((a) => a !== '--apply');
  if (unknown.length) { console.error(`"${unknown[0]}" is not a flag this script understands. Nothing was written.`); process.exit(2); }
  initAdmin();
  main(argv.includes('--apply')).then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
}
