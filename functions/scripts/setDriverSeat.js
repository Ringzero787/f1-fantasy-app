// Change who holds a seat in the game's driver list (F-138): retire one driver, add the one who
// replaces him. São Paulo 2026: Haas dropped Ocon after Mexico City and put Rafael Câmara in the
// car (number 51 — F-139; F-138 first wrote 50, Hirakawa's Mexico City number) for the rest of the season.
//
// A retired driver keeps his document (results and price history stay readable) with
// `isActive: false`: the app lists active drivers only, the buy callable refuses an inactive one,
// the Moonshot seat rule stops counting him as a regular, and the model seeder stops expecting a
// row for him. The replacement is a new document with a starting price and no points; his price
// then moves with his results like everyone's. `add: null` retires a driver with no replacement.
// A new driver given no `price` opens at `seasons/<current season>.newcomerPrice`, which the season
// rollover writes (F-155: the median opening price); the run refuses if that is not there.
//
// Teams that still hold him (F-155). With `refundHolders: false` (the F-138 behaviour) the script
// refuses to write while anyone holds the retiring driver (roster, ace, lockout or streak entry).
// With `refundHolders: true` — the 2027 grid seed (F-156), when the market has been open on the
// 2026 grid since the rollover (owner decision 2026-11-24) — the apply:
//   1. retires him (so nobody can buy him from here on);
//   2. reads the holders AGAIN, after that commit: a team that bought him between the first read and
//      the retirement is on this list and is refunded too;
//   3. takes him off each holding team in its own transaction, his current price credited to its
//      budget, his ace slot, lockout and streak entry cleared (functions/src/teams/retireDriver.ts
//      says what is written and why racesSinceTransfer is not). Inside each transaction the team's
//      isLocked and the live weekend marker are read again: a locked team is skipped and reported, and
//      a weekend that went live stops the run. A re-run finds only the teams still holding him.
// It refuses to start while a weekend is live or he has an open Moonshot.
//
// Why this script and not a new one: retiring a held driver and refunding his holders are one
// change. Split across two ops there would be a window in which teams hold an inactive driver the
// scorer still scores, or are refunded for a driver the market still sells; here one op, one backup
// and one rollback cover both.
//
// Dry run by default: prints the live documents beside DESIRED, the holders, per team the refund it
// would get, and the op's backup line — the two driver documents and the holding teams only, never
// the whole fantasyTeams collection: the market is open, and restoring the collection would undo
// every other player's changes since. `--apply` writes. The uc-script op kind passes only --apply, so
// to change the seat, the price or refundHolders in production, edit DESIRED here, commit, and raise
// a new uc-script op with backup= the line the dry run printed. A team that buys him after that dry
// run is refunded too but is not in the backup; the apply names it. Needs `npm run build` (it reads
// ../lib/teams/retireDriver.js, ../lib/locks/lockState.js and ../lib/season/rollover.js).
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
    // Leave price, previousPrice and tier out for a driver new to the game after the rollover: he
    // then opens at seasons/<season>.newcomerPrice (F-155).
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

/** Teams that hold the driver in any way the retirement must undo. */
async function holdingTeams(fs, driverId, holdsDriver) {
  const teams = await fs.collection('fantasyTeams').get();
  return teams.docs.filter((t) => holdsDriver(t.data(), driverId)).map((t) => ({ id: t.id, data: t.data() }));
}

/** Open Moonshots on him: the open set the eligibility rules use (moonshot/eligibility.ts OPEN_STATUSES). */
async function openMoonshots(fs, driverId) {
  const calls = await fs.collection('moonshots').where('driverId', '==', driverId).get();
  return calls.docs.filter((c) => ['CONFIRMED', 'LOCKED', 'LIVE'].includes(c.data().status)).map((c) => c.id);
}

/** A new driver with no price: the newcomer price the rollover wrote for the current season. */
async function newcomerEconomy(fs, tierOf) {
  const season = (await fs.doc('config/app').get()).data()?.currentSeason;
  const price = typeof season === 'string' ? (await fs.doc(`seasons/${season}`).get()).data()?.newcomerPrice : undefined;
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    throw new Error(`no newcomer price: seasons/${season}.newcomerPrice is ${JSON.stringify(price)} — give DESIRED.add a price, or run the rollover first`);
  }
  return { price, previousPrice: price, tier: tierOf(price), season };
}

class WeekendLive extends Error {}

/**
 * The whole run against `fs` (production, or the emulator in the F-155 test). Returns a summary;
 * throws when an apply is refused or a team failed. `afterRead` is a test seam: awaited after the
 * first holder read, before the retirement commits.
 */
async function run(fs, desired, { apply, log = console.log, warn = console.warn, afterRead = null }) {
  const { retireSale, holdsDriver, retireBlockers, retireBackupPaths } = lib('teams/retireDriver.js');
  const { liveLockState, lockStateFrom, LOCK_STATE_PATH } = lib('locks/lockState.js');
  const { tierOf } = lib('season/rollover.js');
  const { FieldValue } = admin.firestore;
  const { retire, add, refundHolders } = desired;
  if (!ID.test(retire) || (add && (!ID.test(add.id) || retire === add.id))) throw new Error('DESIRED ids must be plain ids and differ');

  const retireRef = fs.doc(`drivers/${retire}`);
  const addRef = add ? fs.doc(`drivers/${add.id}`) : null;
  const [retireSnap, addSnap] = await Promise.all([retireRef.get(), addRef ? addRef.get() : null]);
  if (!retireSnap.exists) throw new Error(`drivers/${retire} not found`);
  const live = retireSnap.data();
  log(`== retire drivers/${retire}: ${live.name} (${live.constructorId}, $${live.price}, isActive=${live.isActive})`);

  const holders = await holdingTeams(fs, retire, holdsDriver);
  const open = await openMoonshots(fs, retire);
  log(`== holders of ${retire}: ${holders.length} team(s), ${open.length} open Moonshot(s)`);
  for (const h of holders) {
    const s = retireSale(h.data, retire, live.price);
    log(`  ${h.id}: ${s.onRoster ? `refund $${s.refund}${s.banked ? `, ${s.banked} pts banked` : ''}` : 'not on the roster'}${s.aceCleared ? ', ace cleared' : ''}${s.lockoutCleared ? ', lockout cleared' : ''}${s.streakCleared ? ', streak cleared' : ''}${h.data.isLocked === true ? '  (LOCKED: will be skipped)' : ''}`);
  }
  const backup = retireBackupPaths(retire, add ? add.id : null, holders.map((h) => h.id));
  log(`== op backup (uc-script backup=): ${backup.join(',')}`);
  const blockers = retireBlockers({ weekendLive: !!(await liveLockState(fs)), openMoonshots: open });
  if (holders.length && !refundHolders) blockers.push(`${retire} is still held by ${holders.length} team(s) and DESIRED.refundHolders is false`);
  for (const b of blockers) warn(`!! ${b} — nothing will be written`);

  let addDoc = null;
  if (add) {
    const addLive = addSnap.exists ? addSnap.data() : null;
    let base = { ...add };
    if (!addLive && typeof add.price !== 'number') {
      const n = await newcomerEconomy(fs, tierOf);
      log(`== ${add.id} has no price: newcomer price $${n.price} (seasons/${n.season}.newcomerPrice), tier ${n.tier}`);
      base = { ...base, price: n.price, previousPrice: n.price, tier: n.tier };
    }
    addDoc = addLive ? { ...base, ...Object.fromEntries(ECONOMY.filter((k) => k in addLive).map((k) => [k, addLive[k]])) } : base;
    log(`== add drivers/${add.id}: ${addLive ? 'exists — identity fields merged, economy kept' : 'new'}`);
    log(JSON.stringify(addDoc, null, 2));
    if (live.constructorId !== add.constructorId) warn(`!! ${retire} drives ${live.constructorId}, ${add.id} would drive ${add.constructorId}: not the same seat`);
    addDoc = { doc: addDoc, isNew: !addLive };
  } else {
    log('== no replacement (add: null)');
  }

  const summary = { holders: holders.length, refunded: 0, refundTotal: 0, failed: [], skippedLocked: [], blockers, notInBackup: [] };
  if (!apply) { log('== dry run: nothing written (add --apply)'); return summary; }
  if (blockers.length) throw new Error(`refusing to retire ${retire}: ${blockers.join('; ')}`);
  if (afterRead) await afterRead();

  // 1. retire: from here nobody can buy him, so the holder list can only shrink
  const batch = fs.batch();
  // a re-run on a driver already retired keeps the original retiredAt
  const retiredAlready = live.isActive === false && live.retiredAt;
  batch.set(retireRef, { isActive: false, ...(retiredAlready ? {} : { retiredAt: FieldValue.serverTimestamp() }), retiredFor: add ? add.id : null }, { merge: true });
  if (add) batch.set(addRef, { ...addDoc.doc, ...(addDoc.isNew ? { createdAt: FieldValue.serverTimestamp() } : {}) }, { merge: true });
  await batch.commit();
  log(`== wrote drivers/${retire} (isActive=false)${add ? ` and drivers/${add.id} (isActive=true, $${addDoc.doc.price})` : ''}`);

  // 2. the holders now, after the retirement: one who bought him since the first read is included
  const now = await holdingTeams(fs, retire, holdsDriver);
  const inBackup = new Set(holders.map((h) => h.id));
  summary.holders = now.length;
  summary.notInBackup = now.map((h) => h.id).filter((id) => !inBackup.has(id));
  if (summary.notInBackup.length) warn(`!! ${summary.notInBackup.length} holder(s) since the dry run, refunded but NOT in its backup line: ${summary.notInBackup.join(', ')}`);

  // 3. one transaction per team, everything it decides on re-read inside it
  const lockRef = fs.doc(LOCK_STATE_PATH);
  for (const h of now) {
    const teamRef = fs.doc(`fantasyTeams/${h.id}`);
    try {
      const done = await fs.runTransaction(async (tx) => {
        const [teamSnap, driverSnap, lockSnap] = await Promise.all([tx.get(teamRef), tx.get(retireRef), tx.get(lockRef)]);
        // as assertOwnedUnlockedTeam (teamOperations.ts): no sale while a weekend is live or the team is locked
        if (lockStateFrom(lockSnap.exists ? lockSnap.data() : undefined)) throw new WeekendLive('a race weekend went live (config/lockState)');
        // set + mergeFields would create a missing team: one deleted since the read stays deleted
        if (!teamSnap.exists) return null;
        const team = teamSnap.data();
        if (team.isLocked === true) return 'locked';
        const sale = retireSale(team, retire, driverSnap.data().price);
        if (!sale) return null;
        const data = { ...sale.patch, updatedAt: FieldValue.serverTimestamp() };
        // set + mergeFields, NOT update(): update() expands keys as field paths and cannot write a
        // top-level `constructor` (#305). Each name is a literal FieldPath segment.
        tx.set(teamRef, data, { mergeFields: Object.keys(data).map((k) => new admin.firestore.FieldPath(k)) });
        return sale;
      });
      if (done === 'locked') {
        summary.skippedLocked.push(h.id);
        warn(`!! ${h.id} is locked: skipped (re-run after the weekend)`);
      } else if (done) {
        summary.refunded++;
        summary.refundTotal += done.refund;
        log(`  ✔ ${h.id}: ${done.onRoster ? `refunded $${done.refund}` : 'cleared'}`);
      } else {
        log(`  – ${h.id}: no longer holds ${retire} (or deleted)`);
      }
    } catch (e) {
      if (e instanceof WeekendLive) {
        summary.failed.push(`stopped before ${h.id}: ${e.message}`);
        warn(`!! ${e.message}: stopping; re-run after the weekend is scored`);
        break;
      }
      summary.failed.push(`${h.id}: ${e.message}`);
      warn(`!! ${h.id} failed and was skipped: ${e.message}`);
    }
  }
  log(`== ${summary.refunded} team(s) written, $${summary.refundTotal} refunded; the market cache refreshes within 30 minutes`);
  const left = [...summary.skippedLocked.map((id) => `${id}: locked`), ...summary.failed];
  if (left.length) throw new Error(`${left.length} team(s) not done (${left.join('; ')}); ${summary.refunded} written. Re-run: only teams still holding ${retire} are touched.`);
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
