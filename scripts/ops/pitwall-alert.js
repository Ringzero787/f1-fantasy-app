#!/usr/bin/env node
// F-140. Emails the owner when the Pit Wall check report FAILs (pitwall-alert-lib.js decides).
//   node scripts/ops/pitwall-alert.js <report.md>
//
// The mail login lives OUTSIDE this public repo, in PW_ALERT_ENV (default
// ~/.config/undercut/alert.env, chmod 600):
//   ALERT_TO=<owner address>
//   SMTP_USER=<the Gmail account Undercut sends invites from>
//   SMTP_PASS=<a Gmail app password for it>
// Sends through Gmail SMTP with the nodemailer already installed for functions/ (the invite email
// uses the same transport). Without that file it says so on stderr and in syslog (exit 5): an alert
// path that is silently off is the gap this closes.
//
// State (what was last sent) is PW_ALERT_STATE (default ~/.local/state/undercut/pitwall-alert.json)
// and is only advanced after a send succeeds, so a failed send is retried on the next run.
// Reads nothing from Firestore and writes nothing outside the state file.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { decide, parseEnv } = require('./pitwall-alert-lib');

const ROOT = path.resolve(__dirname, '..', '..');
const ENV_FILE = process.env.PW_ALERT_ENV || path.join(os.homedir(), '.config', 'undercut', 'alert.env');
const STATE_FILE = process.env.PW_ALERT_STATE || path.join(os.homedir(), '.local', 'state', 'undercut', 'pitwall-alert.json');

function syslog(msg) {
  try { execFileSync('logger', ['-t', 'pitwall-alert', '-p', 'user.warning', msg]); } catch { /* no logger: stderr has it */ }
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1) + '\n');
}

async function main() {
  const reportPath = process.argv[2];
  if (!reportPath) { console.error('usage: pitwall-alert.js <report.md>'); process.exit(2); }
  const report = fs.readFileSync(reportPath, 'utf8');
  const { send, state } = decide(report, readState(), Date.now());
  if (!send) { console.log('pitwall-alert: nothing to send'); return 0; }

  let cfg;
  try { cfg = parseEnv(fs.readFileSync(ENV_FILE, 'utf8')); } catch { cfg = {}; }
  if (!cfg.ALERT_TO || !cfg.SMTP_USER || !cfg.SMTP_PASS) {
    const msg = `pitwall-alert: ${send.kind} alert NOT sent — ${ENV_FILE} is missing ALERT_TO/SMTP_USER/SMTP_PASS`;
    console.error(msg);
    syslog(msg);
    return 5;
  }

  const nodemailer = require(require.resolve('nodemailer', { paths: [path.join(ROOT, 'functions')] }));
  const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: cfg.SMTP_USER, pass: cfg.SMTP_PASS } });
  const footer = `\nFull report: ${reportPath}\n(Sent by scripts/ops/pitwall-alert.js on ${os.hostname()}.)\n`;
  try {
    await transporter.sendMail({ from: `"Undercut ops" <${cfg.SMTP_USER}>`, to: cfg.ALERT_TO, subject: send.subject, text: send.body + footer });
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

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((e) => { console.error(e); process.exit(1); });
}
