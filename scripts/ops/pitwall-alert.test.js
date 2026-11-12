// node --test scripts/ops/*.test.js — F-140: when a Pit Wall check report becomes an email.
// The failure lines are the real São Paulo 2026 reports (2026-11-08 19:33Z, 11-09 07:03Z, 11-12 07:03Z).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { decide, failures, verdict, normalise, parseEnv, REMIND_MS } = require('./pitwall-alert-lib');

const held = (age) => `- ✗ **scoring** brazil_2026 (round 22, registry status 'in_progress') results fetched ${age} ago are held: "Unmapped driver number(s) — grid is incomplete: Unknown driver number: 51; Unknown driver number in qualifying: 51". Fix: add the driver mapping, deploy the result checkers, then run the requeueBlockedResults op`;
const report = (status, lines, at = '2026-11-09T07:03:04.135Z') => [
  `# Pit Wall check · ${at} · ${status}`,
  '',
  '- ✓ **worker** last tick 2 min ago, round 22',
  '- ✓ **payload** round 22 Sao Paulo published 62 min ago',
  ...lines,
  '- ✓ **calendar** las_vegas_2026 matches Las Vegas Grand Prix session for session',
  '',
  '## Triage',
  '',
  '- ✗ not a check line: the triage is prose, but guard anyway',
].join('\n');

const T0 = Date.parse('2026-11-08T19:33:04Z');
const H = 3600 * 1000;

test('reads the verdict and the failing lines (the triage section is not a check)', () => {
  const r = report('FAIL', [held('30 min')]);
  assert.equal(verdict(r), 'FAIL');
  assert.equal(failures(r).length, 1);   // the ✗ inside the triage section is not counted
  assert.equal(verdict('garbage'), null);
});

test('ages are stripped, so the same held race is one alert across runs', () => {
  assert.equal(normalise(held('30 min')), normalise(held('12.0 h')));
  assert.equal(normalise(held('12.0 h')), normalise(held('3.5 d')));
  assert.notEqual(normalise(held('30 min')), normalise(held('30 min').replace('51', '52')));
});

test('first FAIL sends; the same FAIL an hour later does not; a day later reminds', () => {
  const a = decide(report('FAIL', [held('30 min')]), {}, T0);
  assert.equal(a.send.kind, 'new');
  assert.equal(a.send.subject, 'Undercut ops check FAILED: scoring');
  assert.match(a.send.body, /Unknown driver number: 51/);
  assert.match(a.send.body, /requeueBlockedResults/);

  const b = decide(report('FAIL', [held('90 min')]), a.state, T0 + H);
  assert.equal(b.send, null);
  assert.deepEqual(b.state, a.state);

  const c = decide(report('FAIL', [held('12.0 h')]), a.state, T0 + REMIND_MS);
  assert.equal(c.send.kind, 'reminder');
  assert.match(c.send.subject, /STILL FAILING \(1\.0 d\)/);
  assert.equal(c.state.firstSentAt, T0);
  assert.equal(c.state.lastSentAt, T0 + REMIND_MS);

  const d = decide(report('FAIL', [held('1.2 d')]), c.state, T0 + REMIND_MS + H);
  assert.equal(d.send, null);
});

test('a different failure while one is outstanding sends at once, keeping when it started', () => {
  const a = decide(report('FAIL', [held('30 min')]), {}, T0);
  const other = '- ✗ **worker** last tick 14 h ago';
  const b = decide(report('FAIL', [held('2 h'), other]), a.state, T0 + 2 * H);
  assert.equal(b.send.kind, 'changed');
  assert.equal(b.state.firstSentAt, T0);
});

test('back to OK or WARN after an alert sends one all-clear, then nothing', () => {
  const a = decide(report('FAIL', [held('30 min')]), {}, T0);
  const ok = decide(report('OK', []), a.state, T0 + 3 * 24 * H);
  assert.equal(ok.send.kind, 'cleared');
  assert.deepEqual(ok.state, {});
  assert.equal(decide(report('OK', []), ok.state, T0 + 4 * 24 * H).send, null);
  assert.equal(decide(report('WARN', ['- ✗ never mind']), a.state, T0).send.kind, 'cleared');
});

test('OK with nothing outstanding sends nothing; an unreadable report is never an all-clear', () => {
  assert.equal(decide(report('OK', []), {}, T0).send, null);
  const a = decide(report('FAIL', [held('30 min')]), {}, T0);
  const r = decide('', a.state, T0 + H);
  assert.equal(r.send, null);
  assert.deepEqual(r.state, a.state);
  assert.equal(decide(report('FAIL', []), {}, T0).send, null);   // FAIL title, ✗ only in the triage
});

test('a corrupt state file is treated as nothing outstanding', () => {
  assert.equal(decide(report('FAIL', [held('30 min')]), null, T0).send.kind, 'new');
  assert.equal(decide(report('FAIL', [held('30 min')]), 'x', T0).send.kind, 'new');
});

test('the env file parser takes KEY=value, strips quotes, ignores comments', () => {
  assert.deepEqual(parseEnv('# login\nALERT_TO="a@example.com"\nSMTP_USER=b@example.com\n\nSMTP_PASS=\'x y z\'\nlower=no'), { ALERT_TO: 'a@example.com', SMTP_USER: 'b@example.com', SMTP_PASS: 'x y z' });
});
