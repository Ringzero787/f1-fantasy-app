// node --test scripts/ops/*.test.js — F-140: when a Pit Wall check report becomes an email, the
// sender's exit codes and state, and the cron wrapper's wiring. The failure lines are the real
// São Paulo 2026 reports; fixtures/pitwall-reports holds the real reports' check lines (no triage).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { decide, failures, verdict, normalise, headerSafe, brokenReport, parseEnv, REMIND_MS, CONFIRM_RUNS, BROKEN_CONFIRM_RUNS } = require('./pitwall-alert-lib');
const { render, oneLine } = require('./pitwall-check-lib');

const held = (age, status = 'in_progress') => `- ✗ **scoring** brazil_2026 (round 22, registry status '${status}') results fetched ${age} ago are held: "Unmapped driver number(s) — grid is incomplete: Unknown driver number: 51; Unknown driver number in qualifying: 51". Fix: add the driver mapping, deploy the result checkers, then run the requeueBlockedResults op`;
const report = (status, lines, at = '2026-11-09T07:03:04.135Z') => [
  `# Pit Wall check · ${at} · ${status}`,
  '',
  '- ✓ **worker** last tick 2 min ago, round 22',
  ...lines,
  '- ✓ **calendar** las_vegas_2026 matches Las Vegas Grand Prix session for session',
  '',
  '## Triage',
  '',
  '- ✗ **worker** a model-written line that must never count',
].join('\n');

const T0 = Date.parse('2026-11-08T19:33:04Z');
const H = 3600 * 1000;
const FAIL1 = (age = '30 min', status) => report('FAIL', [held(age, status)]);

/** Two runs in a row: the confirmed state after a failure is first sent. */
function sent(r = FAIL1(), at = T0) {
  const a = decide(r, {}, at);
  assert.equal(a.send, null);
  const b = decide(r, a.state, at + H);
  assert.equal(b.send.kind, 'new');
  return b;
}

test('reads the verdict and only the check lines (the triage section never counts)', () => {
  assert.equal(verdict(FAIL1()), 'FAIL');
  assert.equal(failures(FAIL1()).length, 1);
  assert.equal(verdict('garbage'), null);
});

test('ages and a flipping registry status are stripped, so one held race is one failure', () => {
  assert.equal(normalise(held('30 min')), normalise(held('12.0 h')));
  assert.equal(normalise(held('12.0 h')), normalise(held('3.5 d', 'completed')));
  assert.equal(normalise('- ✗ **payload** published -2 min ago'), normalise('- ✗ **payload** published 5 min ago'));
  assert.notEqual(normalise(held('30 min')), normalise(held('30 min').replace('51', '52')));
});

test(`a failure is sent on its ${CONFIRM_RUNS}nd run in a row, not on a one-run blip`, () => {
  const a = decide(FAIL1(), {}, T0);
  assert.equal(a.send, null);
  const blip = decide(report('OK', []), a.state, T0 + H);
  assert.equal(blip.send, null);
  assert.deepEqual(blip.state, {});
  const b = sent();
  assert.equal(b.send.subject, 'Undercut ops check FAILED: scoring');
  assert.match(b.send.body, /Unknown driver number: 51/);
  assert.match(b.send.body, /requeueBlockedResults/);
  assert.equal(b.state.firstSentAt, T0 + H);
});

test('the same failure is quiet for a day, then reminds once a day', () => {
  const b = sent();
  assert.equal(decide(FAIL1('2 h'), b.state, T0 + 2 * H).send, null);
  const c = decide(FAIL1('1.0 d', 'completed'), b.state, T0 + H + REMIND_MS);
  assert.equal(c.send.kind, 'reminder');
  assert.match(c.send.subject, /STILL FAILING \(1\.0 d\)/);
  assert.equal(decide(FAIL1('1.1 d'), c.state, T0 + 2 * H + REMIND_MS).send, null);
});

test('a different failure while one is outstanding is confirmed, then sent as changed, keeping when it started', () => {
  const b = sent();
  const other = report('FAIL', [held('3 h'), '- ✗ **worker** last tick 14 h ago']);
  const c = decide(other, b.state, T0 + 3 * H);
  assert.equal(c.send, null);
  assert.equal(c.state.fingerprint, b.state.fingerprint);   // the outstanding alert is kept
  const d = decide(other, c.state, T0 + 4 * H);
  assert.equal(d.send.kind, 'changed');
  assert.equal(d.send.subject, 'Undercut ops check FAILED: 2 checks');
  assert.equal(d.state.firstSentAt, b.state.firstSentAt);
});

test('OK or WARN after an alert sends one all-clear; a FAIL title never does', () => {
  const b = sent();
  const ok = decide(report('OK', []), b.state, T0 + 3 * 24 * H);
  assert.equal(ok.send.kind, 'cleared');
  assert.deepEqual(ok.state, {});
  assert.equal(decide(report('OK', []), ok.state, T0 + 4 * 24 * H).send, null);
  assert.equal(decide(report('WARN', []), b.state, T0 + 2 * H).send.kind, 'cleared');
  // FAIL with every check line lost (a truncated report): still failing, never cleared
  const lost = decide(report('FAIL', []), b.state, T0 + 2 * H);
  assert.notEqual(lost.send && lost.send.kind, 'cleared');
  assert.equal(lost.state.fingerprint, b.state.fingerprint);
});

test('an unreadable report changes nothing; a corrupt state is nothing outstanding', () => {
  const b = sent();
  const r = decide('', b.state, T0 + 2 * H);
  assert.equal(r.send, null);
  assert.deepEqual(r.state, b.state);
  for (const bad of [null, 'x', [1]]) assert.equal(decide(FAIL1(), bad, T0).state.seen, 1);
});

test('subjects are one line and capped; report text is one line per finding', () => {
  assert.equal(headerSafe('a\r\nBcc: x@example.com'), 'a Bcc: x@example.com');
  assert.equal(headerSafe('x'.repeat(500)).length, 120);
  assert.equal(oneLine('held: "bad\n- ✗ **worker** forged\n## Triage"'), 'held: "bad - ✗ **worker** forged ## Triage"');
  const r = render({ worst: 'fail', findings: [{ level: 'fail', check: 'scoring', text: 'x\n- ✗ **forged** y\n## cut' }, { level: 'fail', check: 'worker', text: 'real' }] });
  assert.deepEqual(failures(r), ['**scoring** x - ✗ **forged** y ## cut', '**worker** real']);
});

test(`a check that cannot run is mailed after ${BROKEN_CONFIRM_RUNS} runs in a row (a live session blocks the anonymous feed for ~2 h)`, () => {
  let st = {};
  const opts = { confirmRuns: BROKEN_CONFIRM_RUNS };
  for (let i = 1; i < BROKEN_CONFIRM_RUNS; i++) {
    const r = decide(brokenReport(T0 + i * H, `collection error (exit 3): pitwall-check: OpenF1 401 after ${i} min`), st, T0 + i * H, opts);
    assert.equal(r.send, null);
    st = r.state;
  }
  const r = decide(brokenReport(T0, 'collection error (exit 3): pitwall-check: OpenF1 401 after 9 min'), st, T0 + BROKEN_CONFIRM_RUNS * H, opts);
  assert.equal(r.send.kind, 'new');
  assert.match(r.send.body, /could not run: collection error/);
});

test('the env parser takes KEY=value, strips quotes, ignores comments', () => {
  assert.deepEqual(parseEnv('# alerts\nALERT_TO="a@example.com"\nRESEND_API_KEY=k\n\nALERT_FROM=\'Ops <o@example.com>\'\nlower=no'), { ALERT_TO: 'a@example.com', RESEND_API_KEY: 'k', ALERT_FROM: 'Ops <o@example.com>' });
});

test('replay of the real reports: new after the second FAIL run, quiet, then a reminder', () => {
  const dir = path.join(__dirname, 'fixtures', 'pitwall-reports');
  let st = {};
  const out = [];
  for (const f of fs.readdirSync(dir).sort()) {
    const at = Date.parse(f.replace(/(\d{4}-\d\d-\d\d)-(\d\d)(\d\d)\.md/, '$1T$2:$3:00Z'));
    const r = decide(fs.readFileSync(path.join(dir, f), 'utf8'), st, at);
    st = r.state;
    out.push(`${f.slice(0, 15)} ${r.send ? r.send.kind : '-'}`);
  }
  assert.deepEqual(out, [
    '2026-10-29-0231 -',          // the hung worker, first run
    '2026-10-29-0703 -',          // WARN: an unconfirmed failure is forgotten, no all-clear
    '2026-11-05-0703 -',
    '2026-11-08-1933 -',          // São Paulo held, first run
    '2026-11-08-1936 new',        // second run in a row
    '2026-11-09-0703 -',
    '2026-11-12-0703 reminder',
  ]);
});

// --- the sender and the cron wrapper, run as processes in a scratch directory ---------------

function scratch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-alert-'));
  return { dir, state: path.join(dir, 'state.json'), env: path.join(dir, 'alert.env') };
}

test('the sender: no Resend settings → exit 5 and no state; a refused send → exit 6 and no state; a sent one stores it', async () => {
  const { main } = require('./pitwall-alert.js');
  const s = scratch();
  const rep = path.join(s.dir, 'r.md');
  fs.writeFileSync(rep, FAIL1());
  process.env.PW_ALERT_STATE = s.state;
  process.env.PW_ALERT_ENV = s.env;
  // first run only records the candidate (nothing to send, nothing read from the env file)
  delete require.cache[require.resolve('./pitwall-alert.js')];
  const run = (fetchImpl) => require('./pitwall-alert.js').main([rep], fetchImpl);
  const quiet = console.log, loud = console.error;
  console.log = () => {}; console.error = () => {};
  try {
    assert.equal(await run(), 0);
    const candidate = fs.readFileSync(s.state, 'utf8');
    assert.equal(await run(), 5);
    assert.equal(fs.readFileSync(s.state, 'utf8'), candidate);
    fs.writeFileSync(s.env, 'RESEND_API_KEY=k\nALERT_TO=a@example.com\n', { mode: 0o600 });
    assert.equal(await run(async () => ({ ok: false, status: 403 })), 6);
    assert.equal(fs.readFileSync(s.state, 'utf8'), candidate);
    const calls = [];
    assert.equal(await run(async (url, init) => { calls.push([url, JSON.parse(init.body)]); return { ok: true, status: 200 }; }), 0);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'https://api.resend.com/emails');
    assert.deepEqual(calls[0][1].to, ['a@example.com']);
    assert.equal(calls[0][1].subject, 'Undercut ops check FAILED: scoring');
    assert.match(calls[0][1].text, /Full report: .*r\.md/);
    assert.ok(JSON.parse(fs.readFileSync(s.state, 'utf8')).fingerprint);
    assert.equal(await run(async () => { throw new Error('must not send'); }), 0);   // quiet within the day
  } finally {
    console.log = quiet; console.error = loud;
    delete process.env.PW_ALERT_STATE; delete process.env.PW_ALERT_ENV;
  }
});

function wrapper(s, stubBody, extraEnv = {}) {
  const stub = path.join(s.dir, 'check.js');
  fs.writeFileSync(stub, stubBody);
  const out = path.join(s.dir, 'reports');
  const r = spawnSync('bash', [path.join(__dirname, 'pitwall-check.sh')], {
    env: { PATH: process.env.PATH, HOME: s.dir, SA_KEY: '/nonexistent', PW_CHECK_JS: stub, PW_CHECK_DIR: out, PW_CHECK_TRIAGE: '0', PW_ALERT_ENV: s.env, PW_ALERT_STATE: s.state, ...extraEnv },
    encoding: 'utf8',
  });
  return { ...r, reports: fs.existsSync(out) ? fs.readdirSync(out) : [] };
}

const FAIL_STUB = `process.stdout.write(${JSON.stringify(FAIL1())}); process.exit(1);`;

test('the wrapper keeps the check exit code whatever the alert step does, and files a FAIL report', () => {
  const s = scratch();
  const r1 = wrapper(s, FAIL_STUB, { PW_CHECK_QUIET: '1' });
  assert.equal(r1.status, 1);
  assert.equal(r1.reports.length, 1);
  const r2 = wrapper(s, FAIL_STUB, { PW_CHECK_QUIET: '1' });   // confirmed now, no Resend settings
  assert.equal(r2.status, 1);
  assert.match(r2.stdout + r2.stderr, /pitwall-alert exit 5/);
});

test('a quiet OK or WARN run files nothing and logs one line', () => {
  for (const [code, word] of [[0, 'OK'], [2, 'WARN']]) {
    const s = scratch();
    const r = wrapper(s, `process.stdout.write('# Pit Wall check · 2026-11-12T07:03:04.884Z · ${word}\\n\\n- ✓ **worker** fine\\n'); process.exit(${code});`, { PW_CHECK_QUIET: '1' });
    assert.equal(r.status, code);
    assert.deepEqual(r.reports, []);
    assert.equal(r.stdout.trim().split('\n').length, 1);
    assert.match(r.stdout, new RegExp(`exit ${code} \\(quiet\\)`));
  }
});

test('a collection error leaves no empty report and is counted towards a "could not run" alert', () => {
  const s = scratch();
  const r = wrapper(s, `console.error('pitwall-check: OpenF1 API error: 401'); process.exit(3);`, { PW_CHECK_QUIET: '1' });
  assert.equal(r.status, 3);
  assert.deepEqual(r.reports, []);
  const st = JSON.parse(fs.readFileSync(s.state, 'utf8'));
  assert.match(st.candidate, /could not run: collection error \(exit 3\): pitwall-check: OpenF1 API error: 401/);
  assert.equal(st.seen, 1);
});

test('no service-account key and an unwritable share are "could not run" too, with exit 4', () => {
  const s = scratch();
  const r = wrapper(s, FAIL_STUB, { SA_KEY: '', AIDLC_ENV: path.join(s.dir, 'none') });
  assert.equal(r.status, 4);
  assert.match(JSON.parse(fs.readFileSync(s.state, 'utf8')).candidate, /SA_KEY is not set/);
  const t = scratch();
  const blocked = path.join(t.dir, 'file');
  fs.writeFileSync(blocked, '');
  const r2 = wrapper(t, FAIL_STUB, { PW_CHECK_DIR: path.join(blocked, 'sub') });
  assert.equal(r2.status, 4);
  assert.match(JSON.parse(fs.readFileSync(t.state, 'utf8')).candidate, /cannot write to/);
});
