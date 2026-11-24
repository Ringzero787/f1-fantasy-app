// F-155: tell players about the season reset before the rollover (seasonRollover.js) runs. The
// rollover refuses to write until this has run at least NOTICE_LEAD_HOURS before
// (functions/src/season/offseasonNotice.ts, rollover.ts rolloverBlockers).
//
// What it sends, to every user except test accounts (F-164 `testAccount`):
//   - an inbox entry (notifications/{id}, type system_broadcast) — the inbox only shows in the old
//     tabs UI, so this is a record more than a channel;
//   - an Expo push to users with a token who have not switched notifications off (10 tokens on
//     2026-11-24, all from the old UI: the Grid UI registers none).
// The channel that reaches every player is email, which Undercut sends only from Cloud Functions:
// send the same title and body from the admin page's broadcast with "send email" ticked
// (sendGlobalBroadcast, which skips test accounts from F-155). Run this script first: it is the
// record the rollover checks.
//
// Once per user: a ledger entry seasonNotices/{NOTICE_ID}/sent/{uid} is created in the same batch as
// the inbox entry, so a re-run (after a failure, or for players who joined since) sends only to the
// users without one. The ledger matches no rule, so no client can read or forge it. Last, it stamps
// seasons/2026.resetNotice { id, sentAt, inbox, push } — the marker the rollover reads.
//
// Dry run by default: prints the wording and the recipient counts. `--apply` sends. The uc-script
// op passes only --apply, so the reset day goes into RESET_DAY here, committed, before the op
// (backup=seasons/2026). The apply refuses while RESET_DAY is the placeholder. Needs
// `npm run build` (reads ../lib/season/offseasonNotice.js). A push cannot be recalled: a rollback
// restores the marker only.
const path = require('path');
const admin = require('firebase-admin');

const EXPECTED_PROJECT = 'f1-app-18077';
const FROM = '2026';
/** The day the rollover will run, as players read it, e.g. 'Monday 14 December'. Set before the op. */
const RESET_DAY = '<RESET DAY>';

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

/** Expo's push API, 100 messages a request. Returns how many it accepted. */
async function expoPush(messages) {
  let ok = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(chunk),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) { console.warn(`!! Expo push HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`); continue; }
    const body = await res.json().catch(() => ({}));
    ok += (Array.isArray(body.data) ? body.data : []).filter((t) => t && t.status === 'ok').length;
  }
  return ok;
}

/** The whole run against `fs`; `push` sends Expo messages (stubbed in the emulator test). */
async function run(fs, { apply, resetDay = RESET_DAY, push = expoPush, log = console.log }) {
  const N = lib();
  const { FieldValue } = admin.firestore;
  const body = N.noticeBody(resetDay);
  log(`== notice ${N.NOTICE_ID}\n  title: ${N.NOTICE_TITLE}\n  body:  ${body}`);
  const users = (await fs.collection('users').get()).docs.map((d) => ({ id: d.id, data: d.data() }));
  const ledger = fs.collection('seasonNotices').doc(N.NOTICE_ID).collection('sent');
  const sent = new Set((await ledger.get()).docs.map((d) => d.id));
  const r = N.noticeRecipients(users, sent);
  log(`== users ${users.length}: ${r.tests} test account(s) left out, ${r.skipped} already sent; inbox ${r.inbox.length}, push ${r.push.length}`);
  const marker = (await fs.doc(`seasons/${FROM}`).get()).data()?.resetNotice;
  if (marker) log(`== seasons/${FROM}.resetNotice already set (${marker.inbox || 0} inbox, ${marker.push || 0} push so far): a re-run sends only to users without a ledger entry`);
  if (!apply) { log('== dry run: nothing sent (add --apply)'); return { ...r, pushed: 0 }; }
  if (resetDay === N.DAY_PLACEHOLDER || !resetDay.trim()) throw new Error('refusing to send: set RESET_DAY in this script to the rollover day first');

  const pushTo = new Set(r.push.map((p) => p.uid));
  const messages = [];
  for (let i = 0; i < r.inbox.length; i += 200) {
    const batch = fs.batch();
    for (const uid of r.inbox.slice(i, i + 200)) {
      // create: a ledger entry another run wrote meanwhile fails this batch instead of sending twice
      batch.create(ledger.doc(uid), { at: FieldValue.serverTimestamp(), push: pushTo.has(uid) });
      batch.set(fs.collection('notifications').doc(), {
        userId: uid, type: 'system_broadcast', title: N.NOTICE_TITLE, body, data: { type: 'system_broadcast', notice: N.NOTICE_ID },
        read: false, createdAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    for (const p of r.push) if (r.inbox.slice(i, i + 200).includes(p.uid)) messages.push({ to: p.token, sound: 'default', title: N.NOTICE_TITLE, body, data: { type: 'system_broadcast', notice: N.NOTICE_ID } });
  }
  const pushed = messages.length ? await push(messages) : 0;
  await fs.doc(`seasons/${FROM}`).set({ resetNotice: {
    id: N.NOTICE_ID, sentAt: marker && marker.sentAt ? marker.sentAt : FieldValue.serverTimestamp(),
    inbox: (marker ? marker.inbox || 0 : 0) + r.inbox.length, push: (marker ? marker.push || 0 : 0) + pushed,
  } }, { merge: true });
  log(`== sent: ${r.inbox.length} inbox, ${pushed}/${messages.length} push accepted; seasons/${FROM}.resetNotice stamped. Now send the same title and body by email from the admin page broadcast.`);
  return { ...r, pushed };
}

/** The op's entry: production, RESET_DAY as committed. */
function main(apply) {
  return run(db, { apply });
}

module.exports = { run };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const unknown = argv.filter((a) => a !== '--apply');
  if (unknown.length) { console.error(`"${unknown[0]}" is not a flag this script understands. Nothing was sent.`); process.exit(2); }
  initAdmin();
  main(argv.includes('--apply')).then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
}
