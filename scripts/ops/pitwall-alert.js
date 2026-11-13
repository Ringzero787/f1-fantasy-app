#!/usr/bin/env node
// F-140. Emails the owner when the Pit Wall check fails (pitwall-alert-lib.js decides).
//   node scripts/ops/pitwall-alert.js <report.md> [--report-gone] [--quiet]
//   node scripts/ops/pitwall-alert.js --broken "<why the check could not run>"
//
// Same transport and settings as the Pit Wall worker's own alerts (workers/pitwall/src/cli/serve.ts):
// Resend, with RESEND_API_KEY, ALERT_TO and optional ALERT_FROM read from the worker's env file
// (PW_ALERT_ENV, default /data/pitwall-worker/env, chmod 600) — one setup turns on both. Only those
// three keys are read from it. Without them it says so on stderr and in syslog (exit 5): an alert
// path that is silently off is the gap this closes. A refused send exits 6.
//
// State is PW_ALERT_STATE (default ~/.local/state/undercut/pitwall-alert.json), written atomically,
// and only after the send succeeds or when nothing needed sending, so a failed send retries next run.
// Reads nothing from Firestore.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { decide, parseEnv, brokenReport, BROKEN_CONFIRM_RUNS } = require('./pitwall-alert-lib');

const ENV_FILE = process.env.PW_ALERT_ENV || '/data/pitwall-worker/env';
const STATE_FILE = process.env.PW_ALERT_STATE || path.join(os.homedir(), '.local', 'state', 'undercut', 'pitwall-alert.json');
const DEFAULT_FROM = 'Undercut ops <noreply@humannpc.com>';

function syslog(msg) {
  if (process.env.PW_ALERT_SYSLOG === '0') return;   // the tests: keep their lines out of the real journal
  try { execFileSync('logger', ['-t', 'pitwall-alert', '-p', 'user.warning', msg]); } catch { /* no logger: stderr has it */ }
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const tmp = `${STATE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 1) + '\n');
  fs.renameSync(tmp, STATE_FILE);
}

function readSettings() {
  let text = '';
  try {
    const st = fs.statSync(ENV_FILE);
    if (st.mode & 0o077) syslog(`${ENV_FILE} is readable by other users (mode ${(st.mode & 0o777).toString(8)}); chmod 600 it`);
    text = fs.readFileSync(ENV_FILE, 'utf8');
  } catch { /* missing: reported by the caller */ }
  const all = parseEnv(text);
  return { apiKey: all.RESEND_API_KEY, to: all.ALERT_TO, from: all.ALERT_FROM || DEFAULT_FROM };
}

async function main(argv, fetchImpl = globalThis.fetch) {
  const brokenAt = argv.indexOf('--broken');
  let report;
  let reportPath = null;
  if (brokenAt !== -1) {
    report = brokenReport(Date.now(), argv[brokenAt + 1] || 'unknown reason');
  } else {
    reportPath = argv.find((a) => !a.startsWith('--'));
    if (!reportPath) { console.error('usage: pitwall-alert.js <report.md> [--report-gone] | --broken "<reason>"'); return 2; }
    report = fs.readFileSync(reportPath, 'utf8');
    if (argv.includes('--report-gone')) reportPath = null;
  }

  const { send, state } = decide(report, readState(), Date.now(), brokenAt !== -1 ? { confirmRuns: BROKEN_CONFIRM_RUNS } : {});
  if (!send) { writeState(state); if (!argv.includes('--quiet')) console.log('pitwall-alert: nothing to send'); return 0; }

  const { apiKey, to, from } = readSettings();
  if (!apiKey || !to) {
    const msg = `pitwall-alert: ${send.kind} alert NOT sent — ${ENV_FILE} has no RESEND_API_KEY/ALERT_TO`;
    console.error(msg);
    syslog(msg);
    return 5;
  }

  const footer = `\n${reportPath ? `Full report: ${reportPath}\n` : ''}(Sent by scripts/ops/pitwall-alert.js on ${os.hostname()}.)\n`;
  try {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: send.subject, text: send.body + footer }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Resend answered ${res.status}`);
  } catch (e) {
    const msg = `pitwall-alert: ${send.kind} alert send FAILED: ${e && e.message ? e.message : e}`;
    console.error(msg);
    syslog(msg);
    return 6;
  }
  writeState(state);
  console.log(`pitwall-alert: sent ${send.kind} — ${send.subject}`);
  syslog(`sent ${send.kind}: ${send.subject}`);
  return 0;
}

module.exports = { main };

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code)).catch((e) => { console.error(`pitwall-alert: ${e.message}`); syslog(`pitwall-alert crashed: ${e.message}`); process.exit(1); });
}
