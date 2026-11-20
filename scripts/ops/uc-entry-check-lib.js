// The race-weekend entry check's rules (uc-entry-check.js), kept pure so they can be tested.
// Why it exists: Mexico (F-134) and Brazil (F-139) were each held for days by a car number that
// nobody had checked against the ingestion map before the race.

/** The race start this far ahead opens the weekend: FP1 is at most ~3.5 days before the race. */
const BEFORE_MS = 5 * 24 * 3600e3;
/** And this long after the start it is still the weekend, so a late result is covered. */
const AFTER_MS = 8 * 3600e3;

/**
 * DRIVER_NUMBER_TO_ID from the source of functions/src/ingestion/config.ts, as { "44": "hamilton" }.
 * Only the top-level `<number>: '<id>'` lines count; the alias block (`50: { HIR: … }`) does not.
 */
function parseNumberMap(src) {
  const block = String(src).match(/DRIVER_NUMBER_TO_ID[^{]*\{([\s\S]*?)\n\}/);
  if (!block) throw new Error('DRIVER_NUMBER_TO_ID not found in config.ts');
  const map = {};
  for (const m of block[1].matchAll(/^\s*(\d+)\s*:\s*["'](\w+)["']/gm)) map[m[1]] = m[2];
  // a refactor that the pattern no longer reads would otherwise turn every car into a false alarm
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
 * isRaceList: the race's own list (true) or, before that is published, the latest practice
 * session's (false). FP1 rookie stand-ins appear only in the latter, so from a practice list
 * nothing is a failure.
 * Returns { fail, note }: `fail` lines are alerts, `note` lines are logged only.
 */
function compareEntry({ entry, map, last = [], lastName = 'the last race', isRaceList }) {
  const fail = [], note = [];
  for (const d of entry) {
    if (map[d.driver_number]) continue;
    if (isRaceList) fail.push(`car ${d.driver_number} ${d.name_acronym} (${d.team_name}) is not in DRIVER_NUMBER_TO_ID; this race's results will be held until it is mapped and deployed`);
    else note.push(`car ${d.driver_number} ${d.name_acronym} (${d.team_name}) is not mapped; fine if it is a practice-only stand-in, a hold if it races`);
  }
  const lastBy = new Map(last.map((d) => [d.driver_number, d]));
  for (const d of entry) {
    const was = lastBy.get(d.driver_number);
    if (!was || was.name_acronym === d.name_acronym) continue;
    const line = `car ${d.driver_number} was ${was.name_acronym} at ${lastName}, now ${d.name_acronym} (${d.team_name}); mapped to '${map[d.driver_number] || '-'}', check the seat`;
    (isRaceList ? fail : note).push(line);
  }
  const entered = new Set(entry.map((d) => d.driver_number));
  for (const d of last) if (!entered.has(d.driver_number)) note.push(`car ${d.driver_number} ${d.name_acronym} raced at ${lastName} and is not on this entry list`);
  return { fail, note };
}

/** A report in the Pit Wall check's shape, so pitwall-alert.js can read its verdict and ✗ lines. */
function renderReport({ stamp, title, fail, note }) {
  const verdict = fail.length ? 'FAIL' : note.length ? 'WARN' : 'OK';
  const lines = [...fail.map((l) => `- ✗ **entry** ${l}`), ...note.map((l) => `- ⚠ ${l}`)];
  return { verdict, text: `# Pit Wall check · ${stamp} · ${verdict}\n\n${title}\n\n${lines.join('\n')}${lines.length ? '\n' : ''}` };
}

module.exports = { parseNumberMap, pickRace, previousRace, compareEntry, renderReport, BEFORE_MS, AFTER_MS };
