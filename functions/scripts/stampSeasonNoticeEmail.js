// F-155: record that the owner has sent the season-reset email. The rollover refuses to write until
// seasons/2026.resetNotice has BOTH sentAt (sendSeasonNotice.js: inbox + push, which reach about 10
// of 66 players) at least 24 h old AND emailAt (this script) — email is the channel that reaches every
// player, and Undercut sends it only from Cloud Functions, through the admin page's broadcast with
// "send email" ticked. Nothing can see that broadcast from here, so the owner says it went out by
// applying this op, after sending it.
//
// A script of its own, not a flag on sendSeasonNotice.js: the uc-script op passes only `--apply`.
//
// Writes only seasons/2026.resetNotice.emailAt (a merge: the counts sendSeasonNotice.js wrote stay).
// Refuses unless sendSeasonNotice.js has run (sentAt set): the email is the second half of one notice.
// Dry run by default; `--apply` writes. Op: uc-script, script=stampSeasonNoticeEmail.js,
// backup=seasons/2026. Needs `npm run build` (reads ../lib/season/offseasonNotice.js).
const path = require('path');
const admin = require('firebase-admin');

const EXPECTED_PROJECT = 'f1-app-18077';
const FROM = '2026';

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

function lib() {
  try {
    return require(path.join(__dirname, '..', 'lib', 'season', 'offseasonNotice.js'));
  } catch (e) {
    throw new Error(`functions/lib is not built (${e.message}). Run: npm --prefix functions run build`);
  }
}

async function run(fs, { apply, log = console.log }) {
  const N = lib();
  const ref = fs.doc(`seasons/${FROM}`);
  const season = (await ref.get()).data() || {};
  const sent = N.noticeSentMs(season);
  const email = N.noticeEmailMs(season);
  log(`== seasons/${FROM}.resetNotice: sentAt ${sent === null ? 'absent' : `${Math.round((Date.now() - sent) / 3600e3)} h ago`}, emailAt ${email === null ? 'absent' : `${Math.round((Date.now() - email) / 3600e3)} h ago`}`);
  if (!apply) { log('== dry run: nothing written (add --apply once the admin broadcast email has gone out)'); return { sent, email }; }
  if (sent === null) throw new Error('refusing: sendSeasonNotice.js has not run (resetNotice.sentAt absent)');
  if (email !== null) { log('== emailAt already set: left alone'); return { sent, email }; }
  await ref.set({ resetNotice: { emailAt: admin.firestore.FieldValue.serverTimestamp() } }, { merge: true });
  log(`== stamped seasons/${FROM}.resetNotice.emailAt`);
  return { sent, email: Date.now() };
}

/** The op's entry: production. */
function main(apply) {
  return run(db, { apply });
}

module.exports = { run };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const unknown = argv.filter((a) => a !== '--apply');
  if (unknown.length) { console.error(`"${unknown[0]}" is not a flag this script understands. Nothing was written.`); process.exit(2); }
  initAdmin();
  main(argv.includes('--apply')).then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
}
