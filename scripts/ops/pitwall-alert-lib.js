// F-140. Decides whether a Pit Wall check report becomes an email to the owner. Pure: the caller
// reads the report and the state file and does the sending (pitwall-alert.js).
//
// Why: the check flagged the held São Paulo result (F-139) as FAIL within 30 minutes of the hold,
// then again 12 h and 3.5 d later, but only into a log and a file on the share. Nobody looked for
// three days. Now a FAIL seen on two runs in a row emails once, reminds once a day while it lasts,
// and an OK/WARN run after it sends an all-clear.

const REMIND_MS = 24 * 3600 * 1000;
// a failure must be seen on this many consecutive runs before it is sent: an hourly check would
// otherwise mail a blip (a queue job claimed a minute late, a worker restart) and its all-clear
const CONFIRM_RUNS = 2;
const SUBJECT_MAX = 120;

/**
 * The ✗ lines of a report: the failing checks. Only the check list counts — the report stops at
 * its first `## ` section (the model-written triage), which must never start or stop an alert.
 */
function failures(report) {
  const text = String(report || '');
  const end = text.search(/^## /m);
  return (end === -1 ? text : text.slice(0, end))
    .split('\n')
    .filter((l) => l.startsWith('- ✗ '))
    .map((l) => l.slice(4).trim());
}

/** The report's overall verdict from its title line (OK / WARN / FAIL), or null. */
function verdict(report) {
  const m = String(report || '').match(/^# Pit Wall check · \S+ · (OK|WARN|FAIL)\s*$/m);
  return m ? m[1] : null;
}

/**
 * A failure line without the parts that change from run to run while it is the same failure:
 * ages ("30 min ago", "12.0 h ago", "-2 min"), and the registry status a held race reports
 * (it can flip from in_progress while the result is still held).
 */
function normalise(line) {
  return line
    .replace(/-?\b\d+(?:\.\d+)?\s*(?:s|sec|min|h|d)\b(?:\s+ago)?/g, '<age>')
    .replace(/registry status '[^']*'/g, "registry status '<status>'");
}

function fingerprint(lines) {
  return lines.map(normalise).sort().join('\n');
}

/** One header-safe line: no control characters, capped. */
function headerSafe(text) {
  const s = String(text).replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').trim();
  return s.length > SUBJECT_MAX ? `${s.slice(0, SUBJECT_MAX - 1)}…` : s;
}

/**
 * state: { fingerprint, firstSentAt, lastSentAt } for the failure last emailed, plus
 * { candidate, seen } for a failure seen but not yet confirmed. {} when nothing is outstanding.
 * confirmRuns: consecutive sightings before a new or changed failure is sent.
 * Returns { send: null | { kind, subject, body }, state }. The caller stores the state only when
 * `send` is null or the send succeeded, so a refused send is retried on the next run.
 */
function decide(report, state, now, { confirmRuns = CONFIRM_RUNS } = {}) {
  const st = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  const v = verdict(report);
  const lines = failures(report);
  const at = new Date(now).toISOString();

  // nothing readable: not a failure and never an all-clear
  if (v === null) return { send: null, state: st };

  if (v !== 'FAIL') {
    // an unconfirmed candidate is forgotten: a blip that cleared on the next run is never mailed
    if (!st.fingerprint) return { send: null, state: {} };
    return {
      send: {
        kind: 'cleared',
        subject: 'Undercut ops check: cleared',
        body: `The Undercut ops check is back to ${v} as of ${at}.\n\nIt had been failing since ${new Date(st.firstSentAt).toISOString()}:\n\n${st.fingerprint}\n`,
      },
      state: {},
    };
  }

  // a FAIL title whose check lines cannot be read is still a failure, never an all-clear
  const effective = lines.length ? lines : ['**check** the report says FAIL but no failing check line could be read'];
  const fp = fingerprint(effective);
  const list = effective.map((l) => `- ${l}`).join('\n');

  if (st.fingerprint === fp) {
    if (now - (st.lastSentAt || 0) < REMIND_MS) return { send: null, state: { fingerprint: st.fingerprint, firstSentAt: st.firstSentAt, lastSentAt: st.lastSentAt } };
    const days = ((now - st.firstSentAt) / REMIND_MS).toFixed(1);
    return {
      send: {
        kind: 'reminder',
        subject: headerSafe(`Undercut ops check STILL FAILING (${days} d)`),
        body: `Still failing at ${at}, first reported ${new Date(st.firstSentAt).toISOString()}.\n\n${list}\n`,
      },
      state: { fingerprint: st.fingerprint, firstSentAt: st.firstSentAt, lastSentAt: now },
    };
  }

  // a new or different failure: confirm it on consecutive runs first
  const seen = st.candidate === fp ? (st.seen || 1) + 1 : 1;
  if (seen < confirmRuns) return { send: null, state: { ...st, candidate: fp, seen } };

  const name = effective.length === 1 ? (effective[0].match(/^\*\*(\w+)\*\*/) || [])[1] : null;
  return {
    send: {
      kind: st.fingerprint ? 'changed' : 'new',
      subject: headerSafe(`Undercut ops check FAILED: ${name || `${effective.length} checks`}`),
      body: `The Undercut ops check failed at ${at} (seen on ${seen} runs in a row).\n\n${list}\n`,
    },
    state: { fingerprint: fp, firstSentAt: st.fingerprint ? st.firstSentAt : now, lastSentAt: now },
  };
}

// A check that cannot run at all waits longer: pitwall-check.js reads OpenF1 anonymously, and the
// provider refuses anonymous callers for the length of a live session (F-128), so two or three
// hourly collection errors on a race day are expected. Four in a row is not.
const BROKEN_CONFIRM_RUNS = 4;

/**
 * A FAIL report for a run that could not produce one (collection error, share not writable, no
 * key), so a check that is broken is mailed like a check that fails.
 */
function brokenReport(now, reason) {
  return `# Pit Wall check · ${new Date(now).toISOString()} · FAIL\n\n- ✗ **check** could not run: ${headerSafe(reason).replace(/\d+(?:\.\d+)?\s*(?:s|sec|min|h|d)\b/g, '')}\n`;
}

/** KEY=value lines (optionally quoted); comments and blanks ignored. */
function parseEnv(text) {
  const out = {};
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

module.exports = { decide, failures, verdict, normalise, fingerprint, headerSafe, brokenReport, parseEnv, REMIND_MS, CONFIRM_RUNS, BROKEN_CONFIRM_RUNS };
