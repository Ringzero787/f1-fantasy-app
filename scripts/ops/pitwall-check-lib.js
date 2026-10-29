// Pure checks behind scripts/ops/pitwall-check.js (F-132): given what Firestore and OpenF1 say,
// decide whether Pit Wall is on track. No I/O here so node --test can pin every rule.
'use strict';

const HOUR = 3600 * 1000;

/** OpenF1 session names → the keys the `races` documents use under `schedule`. */
const SESSION_KEYS = {
  'Practice 1': 'fp1', 'Practice 2': 'fp2', 'Practice 3': 'fp3',
  'Sprint Qualifying': 'sprintQualifying', 'Sprint Shootout': 'sprintQualifying', 'Sprint': 'sprint',
  'Qualifying': 'qualifying', 'Race': 'race',
};

const iso = (v) => (v ? new Date(v).toISOString() : null);
/** A round still to be run; `completed` and `cancelled` are settled. */
const live = (r) => r.status === 'upcoming' || r.status === 'in_progress';
const ms = (v) => (v ? new Date(v).getTime() : null);

/** The round the worker should be on: the in-progress race, else the first upcoming one (loadRound's rule). */
function currentRound(races) {
  const byRound = (a, b) => Number(a.round) - Number(b.round);
  return races.filter((r) => r.status === 'in_progress').sort(byRound)[0] ?? races.filter((r) => r.status === 'upcoming').sort(byRound)[0] ?? null;
}

/**
 * Pair each race in the registry with an OpenF1 meeting by the race session's date (the closest
 * meeting whose Race session, or failing that date_start, is within three days). Returns the
 * pairs, the races with no meeting (a cancelled or renamed round) and the meetings with no race
 * (an added round). Meetings before the first upcoming race are ignored: the past is scored.
 */
function pairRounds(races, meetings) {
  const pairs = [];
  const unmatchedRaces = [];
  const used = new Set();
  for (const race of races) {
    const raceAt = ms(race.schedule && race.schedule.race) ?? ms(race.schedule && race.schedule.qualifying);
    let best = null;
    for (const m of meetings) {
      if (used.has(m.meeting_key)) continue;
      const mAt = ms(m.raceStart) ?? ms(m.date_start);
      if (raceAt === null || mAt === null) continue;
      const gap = Math.abs(mAt - raceAt);
      if (gap <= 3 * 24 * HOUR && (!best || gap < best.gap)) best = { m, gap };
    }
    if (best) { used.add(best.m.meeting_key); pairs.push({ race, meeting: best.m }); } else unmatchedRaces.push(race);
  }
  const unmatchedMeetings = meetings.filter((m) => !used.has(m.meeting_key));
  return { pairs, unmatchedRaces, unmatchedMeetings };
}

/** Session-by-session differences between a race's schedule and its meeting's sessions, in minutes. */
function sessionDrift(race, sessions) {
  const out = [];
  const schedule = (race.schedule || {});
  for (const s of sessions) {
    const key = SESSION_KEYS[s.session_name];
    if (!key) continue;
    const ours = ms(schedule[key]);
    const theirs = ms(s.date_start);
    if (ours === null) { out.push({ key, ours: null, theirs: iso(theirs), minutes: null }); continue; }
    const minutes = Math.round((theirs - ours) / 60000);
    if (minutes !== 0) out.push({ key, ours: iso(ours), theirs: iso(theirs), minutes });
  }
  // A session we list that the provider does not (dropped sprint, say)
  for (const key of ['sprintQualifying', 'sprint']) {
    if (schedule[key] && !sessions.some((s) => SESSION_KEYS[s.session_name] === key)) out.push({ key, ours: iso(schedule[key]), theirs: null, minutes: null });
  }
  return out;
}

/**
 * The whole verdict. `state` is what the collector read; every finding has a level (`fail` means
 * the portal is or will be wrong, `warn` means look, `ok` is a line for the record).
 */
function evaluate(state, now = new Date()) {
  const findings = [];
  const add = (level, check, text) => findings.push({ level, check, text });
  const t = now.getTime();

  // 1. the worker is alive
  const beat = state.worker && state.worker.lastTickAt ? t - state.worker.lastTickAt : null;
  if (beat === null) add('fail', 'worker', 'no heartbeat document');
  else if (beat > 20 * 60 * 1000) add('fail', 'worker', `last tick ${fmtAge(beat)} ago (should be under 5 min); the worker is hung or stopped`);
  else add('ok', 'worker', `last tick ${fmtAge(beat)} ago, round ${state.worker.round}`);
  if (state.worker && state.worker.lastRun && state.worker.lastRun.ok === false) add('warn', 'worker', `last job ${state.worker.lastRun.jobId} failed: ${state.worker.lastRun.error}`);

  // 2. the published payload is for the current round and fresh
  const cur = currentRound(state.races);
  if (!cur) add('fail', 'round', 'no upcoming race in the registry: the season is over or the registry is empty');
  else {
    add('ok', 'round', `current round ${cur.round} ${cur.id} (${cur.status})`);
    const pub = state.newestPublic;
    if (!pub) add('fail', 'payload', 'nothing published in pw_public');
    else {
      const pubRound = pub.round && typeof pub.round === 'object' ? pub.round.number : pub.round;
      const age = t - ms(pub.asOf);
      if (Number(pubRound) !== Number(cur.round)) add('fail', 'payload', `portal shows round ${pubRound} (${pub.round && pub.round.name ? pub.round.name : '?'}), the calendar is on round ${cur.round} ${cur.id}`);
      else if (age > 30 * HOUR) add('fail', 'payload', `round ${pubRound} payload is ${fmtAge(age)} old (over 30 h)`);
      else add('ok', 'payload', `round ${pubRound} ${pub.round && pub.round.name ? pub.round.name : ''} published ${fmtAge(age)} ago`);
    }
    if (state.worker && state.worker.round !== undefined && state.worker.round !== null && Number(state.worker.round) !== Number(cur.round)) add('warn', 'worker', `worker heartbeat says round ${state.worker.round}, calendar says ${cur.round}`);
    const proj = state.projectionRounds || [];
    if (!proj.includes(Number(cur.round))) add('warn', 'projections', `no pw_projections for round ${cur.round} yet (app Pit Wall block and picker PROJ column)`);
  }

  // 3. a race whose sessions have passed but is still 'upcoming' / 'in_progress' (scoring did not run)
  for (const r of state.races) {
    const raceAt = ms(r.schedule && r.schedule.race);
    if (raceAt && raceAt < t - 12 * HOUR && live(r)) add('fail', 'scoring', `${r.id} (round ${r.round}) raced ${fmtAge(t - raceAt)} ago and is still '${r.status}'`);
  }

  // 4. the calendar against the provider: cancelled, added, moved
  for (const r of state.races) if (r.status === 'cancelled') add('ok', 'calendar', `${r.id} (round ${r.round}) is cancelled in the registry`);
  const upcoming = state.races.filter(live);
  const firstAt = upcoming.length ? Math.min(...upcoming.map((r) => ms(r.schedule && r.schedule.race) ?? Infinity)) : Infinity;
  // meetings from the first upcoming race onward (a day's slack); earlier ones are scored rounds
  const futureMeetings = (state.meetings || []).filter((m) => (ms(m.raceStart) ?? ms(m.date_start) ?? 0) >= firstAt - 24 * HOUR);
  const { pairs, unmatchedRaces, unmatchedMeetings } = pairRounds(upcoming, futureMeetings);
  for (const r of unmatchedRaces) add('fail', 'calendar', `${r.id} (round ${r.round}, race ${iso(r.schedule && r.schedule.race)}) has no provider meeting within three days: cancelled or moved?`);
  for (const m of unmatchedMeetings) add('warn', 'calendar', `provider lists ${m.meeting_name} (${m.date_start}) with no race in the registry: added round?`);
  for (const { race, meeting } of pairs) {
    const drift = sessionDrift(race, meeting.sessions || []);
    if (drift.length === 0) add('ok', 'calendar', `${race.id} matches ${meeting.meeting_name} session for session`);
    for (const d of drift) {
      if (d.minutes === null) add('warn', 'calendar', `${race.id} ${d.key}: registry ${d.ours ?? 'missing'}, provider ${d.theirs ?? 'missing'}`);
      else add(Math.abs(d.minutes) >= 60 ? 'fail' : 'warn', 'calendar', `${race.id} ${d.key} moved ${d.minutes > 0 ? '+' : ''}${d.minutes} min: registry ${d.ours}, provider ${d.theirs}`);
    }
  }

  // 5. alerts the worker raised this week
  for (const a of state.alerts || []) add('warn', 'alerts', `${iso(a.at)} ${a.subject}`);

  const worst = findings.some((f) => f.level === 'fail') ? 'fail' : findings.some((f) => f.level === 'warn') ? 'warn' : 'ok';
  return { worst, findings, round: cur ? cur.round : null };
}

function fmtAge(msAge) {
  if (msAge < 90 * 1000) return `${Math.round(msAge / 1000)} s`;
  if (msAge < 90 * 60 * 1000) return `${Math.round(msAge / 60000)} min`;
  if (msAge < 48 * HOUR) return `${(msAge / HOUR).toFixed(1)} h`;
  return `${(msAge / (24 * HOUR)).toFixed(1)} d`;
}

function render(result, now = new Date()) {
  const mark = { ok: '✓', warn: '!', fail: '✗' };
  const lines = [`# Pit Wall check · ${now.toISOString()} · ${result.worst.toUpperCase()}`, ''];
  for (const f of result.findings) lines.push(`- ${mark[f.level]} **${f.check}** ${f.text}`);
  return lines.join('\n') + '\n';
}

module.exports = { SESSION_KEYS, currentRound, pairRounds, sessionDrift, evaluate, render, fmtAge };
