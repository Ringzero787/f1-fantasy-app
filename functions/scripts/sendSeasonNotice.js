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
// (sendGlobalBroadcast, which skips test accounts from F-155), then stamp it with
// stampSeasonNoticeEmail.js. Run this script first: the stamp refuses without it.
//
// Once per user: a ledger entry seasonNotices/{NOTICE_ID}/sent/{uid} is created in the same batch as
// the inbox entry, so a re-run (after a failure, or for players who joined since) sends only to the
// users without one. The ledger matches no rule, so no client can read or forge it. Each batch's
// pushes go out right after it commits; a failed batch or push is counted, never fatal before the
// stamp. Last, always, it stamps seasons/2026.resetNotice { id, sentAt, inbox, push, pushFailed }
// with the real counts — sentAt is set once anything went out, and is the marker the rollover reads.
// The rollover also needs resetNotice.emailAt, stamped by stampSeasonNoticeEmail.js after the owner
// sends the email broadcast.
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
/** Users per inbox batch (two writes each). */
const DEFAULT_BATCH = 200;

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
async function run(fs, { apply, resetDay = RESET_DAY, push = expoPush, log = console.log, batchSize }) {
  const BATCH = batchSize || DEFAULT_BATCH;
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

  const tokenOf = new Map(r.push.map((p) => [p.uid, p.token]));
  const counts = { inbox: 0, pushTried: 0, pushed: 0, pushFailed: 0, batchesFailed: 0 };
  // one batch, then its pushes, then the next: a failure later in the run never strands pushes for
  // users whose ledger entry (and so "already sent") is committed, and every failure is counted
  for (let i = 0; i < r.inbox.length; i += BATCH) {
    const uids = r.inbox.slice(i, i + BATCH);
    try {
      const batch = fs.batch();
      for (const uid of uids) {
        // create: a ledger entry another run wrote meanwhile fails this batch instead of sending twice
        batch.create(ledger.doc(uid), { at: FieldValue.serverTimestamp(), push: tokenOf.has(uid) });
        batch.set(fs.collection('notifications').doc(), {
          userId: uid, type: 'system_broadcast', title: N.NOTICE_TITLE, body, data: { type: 'system_broadcast', notice: N.NOTICE_ID },
          read: false, createdAt: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
      counts.inbox += uids.length;
    } catch (e) {
      counts.batchesFailed++;
      log(`!! inbox batch ${i / BATCH + 1} (${uids.length} users) failed, nothing sent to them: ${e.message}`);
      continue;
    }
    const messages = uids.filter((u) => tokenOf.has(u)).map((u) => ({ to: tokenOf.get(u), sound: 'default', title: N.NOTICE_TITLE, body, data: { type: 'system_broadcast', notice: N.NOTICE_ID } }));
    if (!messages.length) continue;
    counts.pushTried += messages.length;
    try {
      const ok = await push(messages);
      counts.pushed += ok;
      counts.pushFailed += messages.length - ok;
    } catch (e) {
      counts.pushFailed += messages.length;
      log(`!! push for batch ${i / BATCH + 1} failed (${messages.length} message(s)): ${e.message}`);
    }
  }
  // always stamped with what really went out; sentAt only once something has (the rollover's gate)
  const any = counts.inbox > 0 || (marker && marker.sentAt);
  if (any) {
    await fs.doc(`seasons/${FROM}`).set({ resetNotice: {
      id: N.NOTICE_ID, sentAt: marker && marker.sentAt ? marker.sentAt : FieldValue.serverTimestamp(),
      inbox: (marker ? marker.inbox || 0 : 0) + counts.inbox, push: (marker ? marker.push || 0 : 0) + counts.pushed,
      pushFailed: (marker ? marker.pushFailed || 0 : 0) + counts.pushFailed,
    } }, { merge: true });
  }
  log(`== sent: ${counts.inbox} inbox, ${counts.pushed}/${counts.pushTried} push accepted (${counts.pushFailed} failed), ${counts.batchesFailed} batch(es) failed; seasons/${FROM}.resetNotice ${any ? 'stamped' : 'NOT stamped (nothing went out)'}.`);
  log('== next: send the same title and body by email from the admin page broadcast, then run stampSeasonNoticeEmail.js (uc-script op) — the rollover waits for both.');
  if (counts.batchesFailed) throw new Error(`${counts.batchesFailed} inbox batch(es) failed; re-run to reach those users (the ledger skips everyone already sent)`);
  return { ...r, ...counts };
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
