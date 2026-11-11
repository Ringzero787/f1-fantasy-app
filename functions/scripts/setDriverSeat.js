// Change who holds a seat in the game's driver list (F-138): retire one driver, add the one who
// replaces him. São Paulo 2026: Haas dropped Ocon after Mexico City and put Rafael Câmara in the
// car (number 51 — F-139; F-138 first wrote 50, Hirakawa's Mexico City number) for the rest of the season.
//
// A retired driver keeps his document (results and price history stay readable) with
// `isActive: false`: the app lists active drivers only, the buy callable refuses an inactive one,
// the Moonshot seat rule stops counting him as a regular, and the model seeder stops expecting a
// row for him. The replacement is a new document with a starting price and no points; his price
// then moves with his results like everyone's.
//
// Refuses to write while anyone still holds the retiring driver (roster or ace) or has an open
// Moonshot on him: those need a sell/void path first, and that is a different decision.
//
// Dry run by default: prints the live documents beside DESIRED and the holder counts. `--apply`
// writes. The uc-script op kind passes only --apply, so to change the seat or the price in
// production, edit DESIRED here, commit, and raise a new uc-script op
// (backup=drivers/<retire>,drivers/<add>).
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

/** The seat change. `add` is the whole document for a driver the game has never seen. */
const DESIRED = {
  retire: 'ocon',
  add: {
    id: 'camara',
    name: 'Rafael Câmara',
    shortName: 'CAM',
    number: 51,
    constructorId: 'haas',
    constructorName: 'MoneyGram Haas F1 Team',
    nationality: 'Brazilian',
    // a debutant in the Haas: top of tier C (TIER_B_THRESHOLD is 120 in scoring), under the ace cap,
    // cheaper than every regular on the grid but not a free pick; the market moves it from here
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

/** Everyone the retiring driver would be taken from: rosters, aces, open Moonshots. */
async function holdersOf(driverId) {
  const teams = await db.collection('fantasyTeams').get();
  const roster = [];
  const ace = [];
  for (const t of teams.docs) {
    const d = t.data();
    if ((Array.isArray(d.drivers) ? d.drivers : []).some((x) => x && (x.driverId === driverId || x.id === driverId))) roster.push(t.id);
    if (d.aceDriverId === driverId) ace.push(t.id);
  }
  const calls = await db.collection('moonshots').where('driverId', '==', driverId).get();
  // the open set the eligibility rules use (functions/src/moonshot/eligibility.ts OPEN_STATUSES): a call goes LIVE at lights-out
  const open = calls.docs.filter((c) => ['CONFIRMED', 'LOCKED', 'LIVE'].includes(c.data().status)).map((c) => c.id);
  return { roster, ace, open };
}

async function main(apply) {
  const { retire, add } = DESIRED;
  if (!ID.test(retire) || !ID.test(add.id) || retire === add.id) throw new Error('DESIRED ids must be plain ids and differ');

  const retireRef = db.doc(`drivers/${retire}`);
  const addRef = db.doc(`drivers/${add.id}`);
  const [retireSnap, addSnap] = await Promise.all([retireRef.get(), addRef.get()]);
  if (!retireSnap.exists) throw new Error(`drivers/${retire} not found`);
  const live = retireSnap.data();
  console.log(`== retire drivers/${retire}: ${live.name} (${live.constructorId}, $${live.price}, isActive=${live.isActive})`);

  const held = await holdersOf(retire);
  console.log(`== holders of ${retire}: ${held.roster.length} roster(s), ${held.ace.length} ace(s), ${held.open.length} open Moonshot(s)`);
  const blocked = held.roster.length + held.ace.length + held.open.length > 0;
  if (blocked) console.warn(`!! ${retire} is still held — retiring him would strand those teams; nothing will be written`);

  const addLive = addSnap.exists ? addSnap.data() : null;
  const addDoc = addLive ? { ...add, ...Object.fromEntries(ECONOMY.filter((k) => k in addLive).map((k) => [k, addLive[k]])) } : { ...add };
  console.log(`== add drivers/${add.id}: ${addLive ? 'exists — identity fields merged, economy kept' : 'new'}`);
  console.log(JSON.stringify(addDoc, null, 2));
  if (live.constructorId !== add.constructorId) console.warn(`!! ${retire} drives ${live.constructorId}, ${add.id} would drive ${add.constructorId}: not the same seat`);

  if (!apply) { console.log('== dry run: nothing written (add --apply)'); return; }
  if (blocked) throw new Error(`refusing to retire ${retire} while held`);

  const batch = db.batch();
  batch.set(retireRef, { isActive: false, retiredAt: admin.firestore.FieldValue.serverTimestamp(), retiredFor: add.id }, { merge: true });
  batch.set(addRef, { ...addDoc, ...(addLive ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }) }, { merge: true });
  await batch.commit();
  console.log(`== wrote drivers/${retire} (isActive=false) and drivers/${add.id} (isActive=true, $${addDoc.price}); the market cache refreshes within 30 minutes`);
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const unknown = argv.filter((a) => a !== '--apply');
  if (unknown.length) { console.error(`"${unknown[0]}" is not a flag this script understands. Nothing was written.`); process.exit(2); }
  initAdmin();
  main(argv.includes('--apply')).then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
}
