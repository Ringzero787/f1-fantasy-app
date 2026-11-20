#!/usr/bin/env node
// Undercut race-weekend entry check. Runs hourly from cron on the ops box; it does nothing outside
// a race weekend, reads only public OpenF1 data and never touches Firestore.
//
// In a weekend, it compares the race entry list with DRIVER_NUMBER_TO_ID as merged on
// origin/master, and with the previous race's line-up (rules and why: uc-entry-check-lib.js).
// Alerts go through pitwall-alert.js (F-140). A failure is mailed after two runs in a row, with a
// daily reminder and an all-clear after two clean runs. Each race keeps its own alert state.
// A run that cannot finish 4 times in a row mails a "could not run".
//
//   node scripts/ops/uc-entry-check.js [--meeting <key>] [--dry]
//   --dry prints the report and sends nothing; --meeting checks one weekend (a replay, a test).
// Cron (one line per run, appended):
//   13 * * * * node <checkout>/scripts/ops/uc-entry-check.js >> /data/scripts/uc-entry-check.log 2>&1
const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { parseNumberMap, pickRace, previousRace, compareEntry, renderReport } = require('./uc-entry-check-lib');

const OPENF1 = process.env.OPENF1_BASE || 'https://api.openf1.org/v1';
const REPO = path.join(__dirname, '..', '..');
const CONFIG = 'functions/src/ingestion/config.ts';
const ALERT = path.join(__dirname, 'pitwall-alert.js');
const STATE_DIR = path.join(os.homedir(), '.local', 'state', 'undercut');
const argv = process.argv.slice(2);
const dry = argv.includes('--dry');
const stamp = new Date().toISOString();
const log = (msg) => console.log(`${stamp} ${msg}`);

class Locked extends Error {}
async function get(p) {
  const r = await fetch(`${OPENF1}${p}`, { signal: AbortSignal.timeout(20000) });
  if (r.status === 401) throw new Locked(`${p} → 401 (OpenF1 locks anonymous callers during a live session)`);
  if (!r.ok) throw new Error(`${p} → ${r.status}`);
  return r.json();
}

/** The map as merged on master (what the next deploy ships); this checkout's copy if git fails. */
function numberMap() {
  try {
    execFileSync('git', ['-C', REPO, 'fetch', '-q', 'origin', 'master'], { stdio: 'ignore', timeout: 60000 });
    return parseNumberMap(execFileSync('git', ['-C', REPO, 'show', `origin/master:${CONFIG}`], { encoding: 'utf8' }));
  } catch {
    return parseNumberMap(fs.readFileSync(path.join(REPO, CONFIG), 'utf8'));
  }
}

function alert(args, stateFile) {
  try {
    const out = execFileSync('node', [ALERT, ...args, '--quiet'], { encoding: 'utf8', env: { ...process.env, PW_ALERT_STATE: path.join(STATE_DIR, stateFile) } });
    if (out.trim()) log(out.trim());
  } catch (e) { log(`alert exit ${e.status}: ${String(e.stderr || '').trim()}`); }
}

async function main() {
  const now = Date.now();
  const year = new Date(now).getUTCFullYear();
  const races = [...await get(`/sessions?year=${year}&session_name=Race`)];
  // a weekend can straddle New Year's only in theory, but the next season's first race can sit in the window
  races.push(...await get(`/sessions?year=${year + 1}&session_name=Race`).catch(() => []));

  const mi = argv.indexOf('--meeting');
  const race = mi !== -1 ? races.find((r) => String(r.meeting_key) === argv[mi + 1]) : pickRace(races, now);
  if (!race) { if (dry) log('no race weekend in the window'); return; }
  const meeting = race.meeting_key;
  const prev = previousRace(races, race);
  const map = numberMap();

  let entry = await get(`/drivers?session_key=${race.session_key}`);
  let source = 'race entry list';
  const isRaceList = entry.length > 0;
  if (!isRaceList) {
    // the race list is not published yet: look at the latest session that has started
    const started = (await get(`/sessions?meeting_key=${meeting}`))
      .filter((s) => Date.parse(s.date_start) <= now)
      .sort((a, b) => Date.parse(b.date_start) - Date.parse(a.date_start));
    if (!started.length) { log(`meeting ${meeting} (${race.location}): no entry list yet`); return; }
    entry = await get(`/drivers?session_key=${started[0].session_key}`);
    source = `${started[0].session_name} entry list (race list not published yet)`;
  }
  const last = prev ? await get(`/drivers?session_key=${prev.session_key}`) : [];

  const { fail, note } = compareEntry({ entry, map, last, lastName: prev ? prev.location : undefined, isRaceList });
  const title = `Undercut entry check: ${race.location} ${race.year} (meeting ${meeting}), ${source}: ${entry.length} cars.`;
  const { verdict, text } = renderReport({ stamp, title, fail, note });
  const detail = [...fail.map((l) => `✗ ${l}`), ...note.map((l) => `⚠ ${l}`)];
  log(`meeting ${meeting} (${race.location}) ${source}: ${entry.length} cars, ${verdict}${detail.length ? `\n  ${detail.join('\n  ')}` : ''}`);
  if (dry) { console.log(text); return; }

  const f = path.join(os.tmpdir(), `uc-entry-${meeting}.md`);
  fs.writeFileSync(f, text);
  alert([f, '--report-gone'], `entry-alert-${meeting}.json`);
}

/** A run that finished: let a "could not run" alert, if one is outstanding, clear itself. */
function clearBroken() {
  if (dry || !fs.existsSync(path.join(STATE_DIR, 'entry-alert-broken.json'))) return;
  const f = path.join(os.tmpdir(), 'uc-entry-ran.md');
  fs.writeFileSync(f, renderReport({ stamp, title: 'Undercut entry check ran.', fail: [], note: [] }).text);
  alert([f, '--report-gone'], 'entry-alert-broken.json');
}

main().then(clearBroken).catch((e) => {
  if (e instanceof Locked) { log(`skipped: ${e.message}`); return; }
  log(`check failed: ${e.message}`);
  if (!dry) alert(['--broken', `entry check: ${e.message}`], 'entry-alert-broken.json');
  process.exitCode = 1;
});
