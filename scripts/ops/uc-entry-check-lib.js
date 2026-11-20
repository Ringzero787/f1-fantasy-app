// F-165. The race-weekend entry check's rules (uc-entry-check.js), kept pure so they can be tested.
// Why it exists: Mexico (F-134) and Brazil (F-139) were each held for days by a car number that
// nobody had checked against the ingestion map before the race.

/** The weekend opens this far before the race start (FP1 is at most ~3.5 days before)… */
const BEFORE_MS = 5 * 24 * 3600e3;
/** …and stays open this long after it, so a late result is covered. */
const AFTER_MS = 8 * 3600e3;

/**
 * Sessions whose cars score or set the grid. FP1 rookie stand-ins never appear in these
 * (config.ts says so too), so here an unmapped car or a new driver on a number is an alert.
 */
const SCORING_SESSIONS = new Set(['Race', 'Qualifying', 'Sprint', 'Sprint Qualifying', 'Sprint Shootout']);
const isScoringSession = (name) => SCORING_SESSIONS.has(name);

/** OpenF1 text, made safe for a one-line report entry: no control characters, capped. */
function clean(v, max = 60) {
  const s = String(v ?? '').replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * DRIVER_NUMBER_TO_ID from the source of functions/src/ingestion/config.ts, as { "44": "hamilton" }.
 * Only top-level `<number>: '<id>'` lines count; the alias block (`50: { HIR: … }`) does not.
 */
function parseNumberMap(src) {
  const block = String(src).match(/DRIVER_NUMBER_TO_ID[^{]*\{([\s\S]*?)\n\}/);
  if (!block) throw new Error('DRIVER_NUMBER_TO_ID not found in config.ts');
  const map = {};
  for (const m of block[1].matchAll(/^\s*(\d+)\s*:\s*["'](\w+)["']/gm)) map[m[1]] = m[2];
  // a refactor the pattern no longer reads would otherwise turn every car into a false alarm
  if (Object.keys(map).length < 15) throw new Error(`DRIVER_NUMBER_TO_ID parsed to only ${Object.keys(map).length} cars`);
  return map;
}

/** The OpenF1 Race session whose weekend `now` falls in, or undefined. */
function pickRace(races, now) {
  return [...races]
    .sort((a, b) => Date.parse(a.date_start) - Date.parse(b.date_start))
    .find((r) => { const t = Date.parse(r.date_start); return t - now <= BEFORE_MS && now - t <= AFTER_MS; });
}

/** The race before `race`, or undefined. */
function previousRace(races, race) {
  const t = Date.parse(race.date_start);
  return [...races]
    .filter((r) => Date.parse(r.date_start) < t)
    .sort((a, b) => Date.parse(a.date_start) - Date.parse(b.date_start))
    .pop();
}

/**
 * Compare an entry list with the number map and the previous race's line-up.
 * alerting: the list is from a scoring session (isScoringSession). From a practice list nothing
 * is a failure: that is where the FP1 stand-ins are.
 * raceName prefixes each line, so a mail says which weekend it is about.
 * Returns { fail, note }: `fail` lines are alerts, `note` lines are logged only.
 */
function compareEntry({ entry, map, last = [], lastName = 'the last race', raceName, alerting }) {
  const fail = [], note = [];
  const at = raceName ? `${clean(raceName)}: ` : '';
  const who = (d) => `car ${Number(d.driver_number)} ${clean(d.name_acronym, 8)} (${clean(d.team_name)})`;
  for (const d of entry) {
    if (map[d.driver_number]) continue;
    if (alerting) fail.push(`${at}${who(d)} is not in DRIVER_NUMBER_TO_ID; F-152 will try to resolve it by name and holds the result if that is ambiguous. Map it and deploy before the session is scored`);
    else note.push(`${at}${who(d)} is not mapped; fine if it is a practice-only stand-in, a hold risk if it races`);
  }
  const lastBy = new Map(last.map((d) => [d.driver_number, d]));
  for (const d of entry) {
    const was = lastBy.get(d.driver_number);
    if (!was || was.name_acronym === d.name_acronym) continue;
    const line = `${at}car ${Number(d.driver_number)} was ${clean(was.name_acronym, 8)} at ${clean(lastName)}, now ${clean(d.name_acronym, 8)} (${clean(d.team_name)}); mapped to '${map[d.driver_number] || '-'}', check the seat`;
    (alerting ? fail : note).push(line);
  }
  const entered = new Set(entry.map((d) => d.driver_number));
  for (const d of last) if (!entered.has(d.driver_number)) note.push(`${at}${who(d)} raced at ${clean(lastName)} and is not on this entry list`);
  return { fail, note };
}

/** A report in the Pit Wall check's shape, so pitwall-alert.js reads its verdict and ✗ lines. */
function renderReport({ stamp, title, fail, note }) {
  const verdict = fail.length ? 'FAIL' : note.length ? 'WARN' : 'OK';
  const lines = [...fail.map((l) => `- ✗ **entry** ${l}`), ...note.map((l) => `- ⚠ ${l}`)];
  return { verdict, text: `# Pit Wall check · ${stamp} · ${verdict}\n\n${title}\n\n${lines.join('\n')}${lines.length ? '\n' : ''}` };
}

module.exports = { parseNumberMap, pickRace, previousRace, compareEntry, renderReport, isScoringSession, clean, BEFORE_MS, AFTER_MS };
