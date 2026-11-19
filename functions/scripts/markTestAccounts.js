// F-163: mark store testers and reviewers so counts of players leave them out.
//
// Reads every user document and its Firebase Auth record, classifies each with
// lib/users/testAccounts.js (the rules are documented and tested there), and writes
// `testAccount: { reason, markedAt, by }` on the ones it recognises. It only ever adds a mark:
// it never removes one, and never touches an admin or a uid in KEEP.
//
// Dry run by default: prints counts per reason and the uid prefixes it would mark, no names or
// addresses. `--apply` writes. Run it through the uc-script op kind (backup=users), which keeps
// the whole users collection for rollback.
//
// A real player marked by mistake: add the uid to KEEP, commit, and remove the field through a
// new op (the rollback restores the whole collection, so it is the wrong tool for one user).
const admin = require('firebase-admin');
const path = require('path');

const EXPECTED_PROJECT = 'f1-app-18077';
/** uids that are never marked, whatever they look like. */
const KEEP = new Set([]);

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

const ms = (s) => (s ? Date.parse(s) || 0 : 0);

async function run(apply) {
  const { testAccountReason } = require(path.join(__dirname, '..', 'lib', 'users', 'testAccounts.js'));
  const users = (await db.collection('users').get()).docs;
  const auth = new Map();
  let token;
  do {
    const page = await admin.auth().listUsers(1000, token);
    for (const u of page.users) auth.set(u.uid, u);
    token = page.pageToken;
  } while (token);

  const counts = { players: 0, alreadyMarked: 0, kept: 0, noAuthRecord: 0 };
  const marks = [];
  for (const doc of users) {
    const d = doc.data();
    if (d.testAccount) { counts.alreadyMarked++; continue; }
    if (KEEP.has(doc.id) || d.isAdmin) { counts.kept++; continue; }
    const a = auth.get(doc.id);
    if (!a) { counts.noAuthRecord++; continue; }
    const reason = testAccountReason({
      email: a.email || d.email,
      displayName: a.displayName || d.displayName,
      createdMs: ms(a.metadata.creationTime),
      lastActiveMs: Math.max(ms(a.metadata.lastSignInTime), ms(a.metadata.lastRefreshTime)),
    });
    if (!reason) { counts.players++; continue; }
    marks.push({ uid: doc.id, reason });
  }

  const byReason = {};
  for (const m of marks) byReason[m.reason] = (byReason[m.reason] || 0) + 1;
  console.log(`users: ${users.length}; to mark: ${marks.length} ${JSON.stringify(byReason)}; ${JSON.stringify(counts)}`);
  for (const m of marks) console.log(`  mark ${m.uid.slice(0, 8)}… ${m.reason}`);
  if (!apply) { console.log('dry run: pass --apply to write'); return; }

  const { FieldValue } = admin.firestore;
  for (let i = 0; i < marks.length; i += 400) {
    const batch = db.batch();
    for (const m of marks.slice(i, i + 400)) {
      // update(): a user deleted since the read is skipped by the failure, not recreated
      batch.update(db.collection('users').doc(m.uid), { testAccount: { reason: m.reason, markedAt: FieldValue.serverTimestamp(), by: 'F-163' } });
    }
    await batch.commit();
  }
  console.log(`marked ${marks.length}`);
}

if (require.main === module) {
  initAdmin();
  run(process.argv.includes('--apply')).then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
}
