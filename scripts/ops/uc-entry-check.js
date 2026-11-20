#!/usr/bin/env node
// F-165. Undercut race-weekend entry check. Runs hourly from cron on the ops box (forge). Outside
// a race weekend it does nothing; it reads only public OpenF1 data and git, never Firestore.
//
// In a weekend, it compares the entry list with DRIVER_NUMBER_TO_ID as merged on origin/master,
// and with the previous race's line-up (rules and why: uc-entry-check-lib.js). Alerts go through
// pitwall-alert.js (F-140): a failure is mailed after two runs in a row, with a daily reminder and
// an all-clear after two clean runs, and each race keeps its own alert state. A run that cannot
// finish, or 12 runs in a row that OpenF1 locks out, count as "could not run" (mailed after 4).
// The map is read from master, so an alert clears on merge: the fix still needs a functions deploy.
//
//   node scripts/ops/uc-entry-check.js [--meeting <key>] [--dry]
//   --dry prints the report and sends nothing; --meeting checks one weekend (a replay, a test).
// Cron (owner step; one line per run, appended):
//   13 * * * * node <checkout>/scripts/ops/uc-entry-check.js >> /data/scripts/uc-entry-check.log 2>&1
const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { parseNumberMap, pickRace, previousRace, compareEntry, renderReport, isScoringSession } = require('./uc-entry-check-lib');

const OPENF1 = process.env.OPENF1_BASE || 'https://api.openf1.org/v1';
const REPO = path.join(__dirname, '..', '..');
const CONFIG = 'functions/src/ingestion/config.ts';
const ALERT = path.join(__dirname, 'pitwall-alert.js');
const STATE_DIR = process.env.UC_ENTRY_STATE_DIR || path.join(os.homedir(), '.local', 'state', 'undercut');
const SKIPS = path.join(STATE_DIR, 'entry-skips.json');
const BROKEN = 'entry-alert-broken.json';
const MAX_SKIPS = 12;
const argv = process.argv.slice(2);
const dry = argv.includes('--dry');
const stamp = new Date().toISOString();
const log = (msg) => console.log(`${stamp} ${msg}`);

class Locked extends Error {}
async function get(p) {
  const r = await fetch(`${OPENF1}${p}`, { signal: AbortSignal.timeout(20000) });
  if (r.status === 401) throw new Locked(`${p} → 401 (OpenF1 locks anonymous callers during a live session)`);
  if (r.status === 404) return [];   // OpenF1's "no results" for a list not published yet
  if (!r.ok) throw new Error(`${p} → ${r.status}`);
  const body = await r.json();
  return Array.isArray(body) ? body : [];
}

const isKey = (v) => Number.isSafeInteger(v) && v > 0;

/** The map as merged on master (what the next deploy ships); this checkout's copy if git fails. */
function numberMap() {
  try {
    execFileSync('git', ['-C', REPO, 'fetch', '-q', 'origin', 'master'], { stdio: 'ignore', timeout: 60000 });
    return { map: parseNumberMap(execFileSync('git', ['-C', REPO, 'show', `origin/master:${CONFIG}`], { encoding: 'utf8' })), source: 'origin/master' };
  } catch {
    return { map: parseNumberMap(fs.readFileSync(path.join(REPO, CONFIG), 'utf8')), source: 'checkout copy (git failed)' };
  }
}

/** Hand a report to pitwall-alert.js with its own state file. Report files live in STATE_DIR, not /tmp. */
function alert(args, stateFile, reportText) {
  fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  let file;
  if (reportText !== undefined) {
    file = path.join(STATE_DIR, stateFile.replace(/\.json$/, '.md'));
    fs.writeFileSync(file, reportText, { mode: 0o600 });
  }
  try {
    const out = execFileSync('node', [ALERT, ...(file ? [file, '--report-gone'] : []), ...args, '--quiet'],
      { encoding: 'utf8', env: { ...process.env, PW_ALERT_STATE: path.join(STATE_DIR, stateFile) } });
    if (out.trim()) log(out.trim());
  } catch (e) { log(`alert exit ${e.status}: ${String(e.stderr || '').trim()}`); }
}

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

/** A finished run: no lock-out streak, and an outstanding "could not run" may clear. */
function finished() {
  if (dry) return;
  fs.rmSync(SKIPS, { force: true });
  const state = path.join(STATE_DIR, BROKEN);
  if (!fs.existsSync(state)) return;
  alert([], BROKEN, renderReport({ stamp, title: 'Undercut entry check ran.', fail: [], note: [] }).text);
  const left = readJson(state);
  if (left && Object.keys(left).length === 0) fs.rmSync(state, { force: true });   // nothing outstanding
}

async function main() {
  const now = Date.now();
  const year = new Date(now).getUTCFullYear();
  const races = [...await get(`/sessions?year=${year}&session_name=Race`)];
  // the next season's first race can sit in the window late in the year
  races.push(...await get(`/sessions?year=${year + 1}&session_name=Race`).catch((e) => { if (e instanceof Locked) throw e; return []; }));

  const mi = argv.indexOf('--meeting');
  const race = mi !== -1 ? races.find((r) => String(r.meeting_key) === argv[mi + 1]) : pickRace(races, now);
  if (!race) { if (dry) log('no race weekend in the window'); return; }
  if (!isKey(race.meeting_key) || !isKey(race.session_key)) throw new Error(`OpenF1 race session has a non-integer key: ${JSON.stringify([race.meeting_key, race.session_key])}`);
  const meeting = race.meeting_key;
  const prev = previousRace(races, race);
  const { map, source: mapSource } = numberMap();

  let entry = await get(`/drivers?session_key=${race.session_key}`);
  let session = 'Race';
  if (!entry.length) {
    // the race list is not published yet: look at the latest session that has started
    const started = (await get(`/sessions?meeting_key=${meeting}`))
      .filter((s) => isKey(s.session_key) && Date.parse(s.date_start) <= now)
      .sort((a, b) => Date.parse(b.date_start) - Date.parse(a.date_start));
    if (!started.length) { log(`meeting ${meeting} (${race.location}): no entry list yet`); return; }
    entry = await get(`/drivers?session_key=${started[0].session_key}`);
    session = String(started[0].session_name);
  }
  const last = prev && isKey(prev.session_key) ? await get(`/drivers?session_key=${prev.session_key}`) : [];

  const raceName = `${race.location} ${race.year}`;
  const { fail, note } = compareEntry({ entry, map, last, lastName: prev ? prev.location : undefined, raceName, alerting: isScoringSession(session) });
  const title = `Undercut entry check: ${raceName} (meeting ${meeting}), ${session} entry list: ${entry.length} cars. Map: ${mapSource}.`;
  const { verdict, text } = renderReport({ stamp, title, fail, note });
  const detail = [...fail.map((l) => `✗ ${l}`), ...note.map((l) => `⚠ ${l}`)];
  log(`meeting ${meeting} (${race.location}) ${session} list: ${entry.length} cars, map ${mapSource}, ${verdict}${detail.length ? `\n  ${detail.join('\n  ')}` : ''}`);
  if (dry) { console.log(text); return; }
  alert([], `entry-alert-${meeting}.json`, text);
}

main().then(finished).catch((e) => {
  if (e instanceof Locked) {
    // a live session; but a lock-out that never ends would leave the check silently dead
    const skips = ((readJson(SKIPS) || {}).count || 0) + 1;
    if (!dry) { fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 }); fs.writeFileSync(SKIPS, JSON.stringify({ count: skips }) + '\n'); }
    log(`skipped (${skips} in a row): ${e.message}`);
    if (skips < MAX_SKIPS || dry) return;
    e = new Error(`OpenF1 has refused every run for ${skips} h: ${e.message}`);
  }
  log(`check failed: ${e.message}`);
  if (!dry) alert(['--broken', `entry check: ${e.message}`], BROKEN);
  process.exitCode = 1;
});
