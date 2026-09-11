// node --test scripts/ops/*.test.js — the deploy wrapper always puts the ADC file back.
// A stub `firebase` on PATH records what credentials it saw and exits 0 or 1.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const WRAPPER = path.join(__dirname, 'firebase-deploy.sh');

function sandbox({ adc, firebaseExit = 0 }) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-home-'));
  const bin = path.join(home, 'bin');
  fs.mkdirSync(bin);
  const adcPath = path.join(home, '.config', 'gcloud', 'application_default_credentials.json');
  if (adc !== undefined) { fs.mkdirSync(path.dirname(adcPath), { recursive: true }); fs.writeFileSync(adcPath, adc); }
  const saKey = path.join(home, 'sa.json');
  fs.writeFileSync(saKey, 'SERVICE-ACCOUNT');
  const seen = path.join(home, 'seen');
  fs.writeFileSync(path.join(bin, 'firebase'), `#!/bin/sh\ncat "$HOME/.config/gcloud/application_default_credentials.json" > "${seen}"\nexit ${firebaseExit}\n`, { mode: 0o755 });
  const run = () => spawnSync('bash', [WRAPPER, '--only', 'functions:x', '--project', 'demo'], {
    env: { ...process.env, HOME: home, SA_KEY: saKey, PATH: `${bin}:${process.env.PATH}` }, encoding: 'utf8',
  });
  return { home, adcPath, seen, run };
}

test('successful deploy: firebase sees the key, the original ADC comes back, no backup left', () => {
  const s = sandbox({ adc: 'ORIGINAL' });
  const r = s.run();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(s.seen, 'utf8'), 'SERVICE-ACCOUNT');
  assert.equal(fs.readFileSync(s.adcPath, 'utf8'), 'ORIGINAL');
  assert.equal(fs.existsSync(`${s.adcPath}.aidlc-bak`), false);
});

test('failed deploy: the exit code passes through and the original ADC still comes back', () => {
  const s = sandbox({ adc: 'ORIGINAL', firebaseExit: 1 });
  const r = s.run();
  assert.equal(r.status, 1);
  assert.equal(fs.readFileSync(s.adcPath, 'utf8'), 'ORIGINAL');
  assert.equal(fs.existsSync(`${s.adcPath}.aidlc-bak`), false);
});

test('no ADC before: none after', () => {
  const s = sandbox({});
  assert.equal(s.run().status, 0);
  assert.equal(fs.existsSync(s.adcPath), false);
});

test('a stale backup from an interrupted run: refuse and touch nothing', () => {
  const s = sandbox({ adc: 'CURRENT' });
  fs.writeFileSync(`${s.adcPath}.aidlc-bak`, 'OLD');
  const r = s.run();
  assert.equal(r.status, 2);
  assert.match(r.stderr, /did not restore the ADC file/);
  assert.equal(fs.readFileSync(s.adcPath, 'utf8'), 'CURRENT');
  assert.equal(fs.existsSync(s.seen), false, 'firebase never ran');
});

test('SA_KEY is required', () => {
  const s = sandbox({ adc: 'ORIGINAL' });
  const r = spawnSync('bash', [WRAPPER, '--only', 'x'], { env: { ...process.env, HOME: s.home, SA_KEY: '' }, encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /SA_KEY/);
});
