// Runs against the compiled output: `npm --prefix functions run build && node --test functions/test`.
//
// F-175 slice 3: membership, Rank Up and the Charter emails — the pure halves. The Firestore
// halves run against the emulator in rules-tests/charter.integration.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../lib/charter/membership.js');
const Mail = require('../lib/charter/mail.js');
const { weekId } = require('../lib/charter/rankUp.js');

test('member changes: join, leave, request, approval, points', () => {
  const c = (b, a) => M.memberChange(b, a);
  assert.deepEqual(c(undefined, { status: 'approved' }), { joined: true, left: false, requested: false, approvedNow: false, pointsMayChange: true });
  assert.deepEqual(c(undefined, { status: 'pending' }), { joined: false, left: false, requested: true, approvedNow: false, pointsMayChange: false });
  assert.deepEqual(c({ status: 'pending' }, { status: 'approved' }), { joined: true, left: false, requested: false, approvedNow: true, pointsMayChange: true });
  assert.equal(c({ status: 'approved' }, undefined).left, true, 'leave / remove');
  assert.equal(c({ status: 'pending' }, undefined).left, false, 'a rejected request had no access to take');
  assert.equal(c({ status: 'approved' }, { status: 'pending' }).left, true);
  assert.equal(c({}, {}).joined, false, 'a legacy doc with no status was already approved');
  assert.equal(c({ status: 'approved', totalPoints: 10 }, { status: 'approved', totalPoints: 12 }).pointsMayChange, true);
  assert.equal(c({ status: 'approved', totalPoints: 10, displayName: 'a' }, { status: 'approved', totalPoints: 10, displayName: 'b' }).pointsMayChange, false, 'a rename is not a points change');
  assert.equal(c({ status: 'pending', totalPoints: 0 }, { status: 'pending', totalPoints: 5 }).pointsMayChange, false, 'pending members contribute nothing');
});

test('search points: approved members only', () => {
  assert.equal(M.searchPoints([{ status: 'approved', totalPoints: 100 }, { totalPoints: 50 }, { status: 'pending', totalPoints: 999 }, { status: 'approved', totalPoints: 'x' }]), 150);
  assert.equal(M.searchPoints([]), 0);
});

test('approve: owner only, pending only, 22 in a chartered league, maxMembers otherwise', () => {
  const base = { callerId: 'o', ownerId: 'o', member: { status: 'pending' }, approvedCount: 5, chartered: false, maxMembers: 22 };
  assert.deepEqual(M.approveDecision(base), { ok: true });
  assert.deepEqual(M.approveDecision({ ...base, callerId: 'admin' }), { ok: false, reason: 'not-owner' });
  assert.deepEqual(M.approveDecision({ ...base, member: { status: 'approved' } }), { ok: false, reason: 'not-pending' });
  assert.deepEqual(M.approveDecision({ ...base, member: null }), { ok: false, reason: 'not-pending' });
  assert.deepEqual(M.approveDecision({ ...base, chartered: true, approvedCount: 22, maxMembers: 42 }), { ok: false, reason: 'full' }, 'a chartered league stops at 22 even if grown');
  assert.deepEqual(M.approveDecision({ ...base, chartered: true, approvedCount: 21 }), { ok: true });
  assert.deepEqual(M.approveDecision({ ...base, approvedCount: 22, maxMembers: 42 }), { ok: true }, 'an ordinary grown league keeps its own size');
  assert.deepEqual(M.approveDecision({ ...base, approvedCount: 42, maxMembers: 42 }), { ok: false, reason: 'full' });
});

test('Rank Up: chartered only, approved giver and receiver, not yourself, once a week', () => {
  const ok = { chartered: true, from: { status: 'approved' }, to: {}, fromUid: 'a', toUid: 'b', alreadyGiven: false };
  assert.deepEqual(M.rankUpDecision(ok), { ok: true });
  assert.equal(M.rankUpDecision({ ...ok, chartered: false }).reason, 'not-chartered');
  assert.equal(M.rankUpDecision({ ...ok, from: null }).reason, 'not-member');
  assert.equal(M.rankUpDecision({ ...ok, from: { status: 'pending' } }).reason, 'not-member');
  assert.equal(M.rankUpDecision({ ...ok, toUid: 'a' }).reason, 'self');
  assert.equal(M.rankUpDecision({ ...ok, to: null }).reason, 'target-not-member');
  assert.equal(M.rankUpDecision({ ...ok, to: { status: 'pending' } }).reason, 'target-not-member');
  assert.equal(M.rankUpDecision({ ...ok, alreadyGiven: true }).reason, 'already-given');
});

test('the league weekly count: +1 within the week, back to 1 in a new week', () => {
  const mon = Date.parse('2027-03-01T00:00:00Z'); // a Monday
  const w = weekId(mon);
  assert.deepEqual(M.nextRankUpsWeek(null, mon), { weekId: w, count: 1 });
  assert.deepEqual(M.nextRankUpsWeek({ weekId: w, count: 2 }, mon + 3600e3), { weekId: w, count: 3 });
  assert.deepEqual(M.nextRankUpsWeek({ weekId: w, count: 9 }, mon + 7 * 86400e3), { weekId: weekId(mon + 7 * 86400e3), count: 1 }, 'a missed week does not carry');
  assert.equal(M.weekStartMs(Date.parse('2027-03-07T23:59:59Z')), mon, 'Sunday belongs to the week that began Monday');
  assert.equal(M.weekStartMs(mon), mon);
});

test('Monday reminder: only to players who have not given one and have not opened the app this week', () => {
  const now = Date.parse('2027-03-01T14:00:00Z');
  const start = M.weekStartMs(now);
  assert.equal(M.wantsRankUpReminder({ gaveThisWeek: false, lastOpenAtMs: start - 1, now, optedOut: false }), true);
  assert.equal(M.wantsRankUpReminder({ gaveThisWeek: false, lastOpenAtMs: null, now, optedOut: false }), true);
  assert.equal(M.wantsRankUpReminder({ gaveThisWeek: false, lastOpenAtMs: start + 1, now, optedOut: false }), false);
  assert.equal(M.wantsRankUpReminder({ gaveThisWeek: true, lastOpenAtMs: null, now, optedOut: false }), false);
  assert.equal(M.wantsRankUpReminder({ gaveThisWeek: false, lastOpenAtMs: null, now, optedOut: true }), false);
});

test('emails: black card, red accent, one button, footer Undercut, escaped, no watchlist term', () => {
  const evil = '<script>x</script>"&';
  const all = [
    Mail.charteredMail(evil, 'ABC123'),
    Mail.inviteMail('Sam', evil, 'ABC123', true),
    Mail.inviteMail('Sam', evil, 'ABC123', false),
    Mail.requestMail('Pat', evil, 'ABC123'),
    Mail.approvedMail(evil, 'ABC123'),
    Mail.rankUpMail(evil, 'ABC123', 'https://u.example/x?u=1&t=2'),
    Mail.scoredMail(evil, 'Bahrain', 'ABC123', 'https://u.example/x?u=1&t=2'),
  ];
  for (const m of all) {
    assert.ok(m.html.includes('#FF2E2E'));
    assert.ok(m.html.includes('background:#000000'));
    assert.equal((m.html.match(/<a href=[^>]*display:inline-block/g) || []).length, 1, 'one button');
    assert.match(m.html, />Undercut(<br>|<\/td>)/);
    assert.doesNotMatch(m.html, /<script>/);
    assert.doesNotMatch(m.html, /Leave Me To It|#14B8A6/, 'the teal template is gone');
    assert.ok(m.html.includes('https://undercut.humannpc.com/join?code=ABC123'), 'the join route, not /join/{code}');
    for (const w of [/\bF1\b/, /Formula 1/i, /\bFIA\b/, /Grand Prix/i]) { assert.doesNotMatch(m.subject, w); }
  }
  assert.equal(Mail.charteredMail('Pit Lane', 'C').subject, 'Pit Lane is chartered');
  assert.equal(Mail.inviteMail('Sam', 'Pit Lane', 'C', true).subject, 'Sam chartered Pit Lane');
  assert.equal(Mail.requestMail('Pat', 'Pit Lane', 'C').subject, 'Pat wants in to Pit Lane');
  assert.equal(Mail.approvedMail('Pit Lane', 'C').subject, "You're in Pit Lane. Pit Wall is on.");
  assert.equal(Mail.rankUpMail('Pit Lane', 'C', 'u').subject, 'Your rank up is back');
  assert.equal(Mail.scoredMail('Pit Lane', 'Bahrain', 'C', 'u').subject, 'Pit Lane · Bahrain is scored');
  assert.doesNotMatch(Mail.inviteMail('Sam', 'Pit Lane', 'C', false).html, /Pit Wall/, 'the unchartered invite has no Pit Wall sentence');
  assert.match(Mail.rankUpMail('L', 'C', 'https://u/x').html, /Stop these emails/);
  assert.match(Mail.scoredMail('L', 'R', 'C', 'https://u/x').html, /Stop these emails/);
  assert.doesNotMatch(Mail.approvedMail('L', 'C').html, /Stop these emails/, 'transactional mail has no unsubscribe');
  assert.equal(Mail.cleanText('  a\nb  ', 'x'), 'a b');
  assert.equal(Mail.cleanText('', 'x'), 'x');
});

test('no Charter function calls grantPass/revokePass; Rank Up never writes points; GMAIL is the only secret', () => {
  const strip = (s) => s.replace(/^\s*\*.*$/gm, '').replace(/\/\/.*$/gm, '');
  for (const f of ['functions.ts', 'memberStore.ts', 'membership.ts', 'mail.ts']) {
    const src = strip(fs.readFileSync(path.join(__dirname, '..', 'src', 'charter', f), 'utf8'));
    assert.doesNotMatch(src, /grantPass\(|revokePass\(|\bpass:/, f);
  }
  const store = fs.readFileSync(path.join(__dirname, '..', 'src', 'charter', 'memberStore.ts'), 'utf8');
  const give = strip(store.slice(store.indexOf('export async function giveRankUp')));
  assert.doesNotMatch(give, /totalPoints|lockedPoints|moonshotPoints/);
  const fns = fs.readFileSync(path.join(__dirname, '..', 'src', 'charter', 'functions.ts'), 'utf8');
  assert.deepEqual([...fns.matchAll(/defineSecret\('([^']+)'\)/g)].map((m) => m[1]), ['GMAIL_APP_PASSWORD']);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'src', 'index.ts'), 'utf8'), /export \* as charter from '\.\/charter\/functions'/);
});
