// F-140. Decides whether a Pit Wall check report becomes an email to the owner. Pure: the caller
// reads the report and the state file and does the sending (pitwall-alert.js).
//
// Why: the check flagged the held São Paulo result (F-139) as FAIL within 30 minutes of the hold,
// then again 12 h and 3.5 d later, but only into a log and a file on the share. Nobody looked for
// three days. A FAIL now emails once, reminds once a day while it lasts, and says when it clears.

const REMIND_MS = 24 * 3600 * 1000;

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
 * A failure line without the parts that change from run to run ("30 min ago", "12.0 h ago",
 * "3.5 d ago", "62 min"), so the same held race is one alert, not a new one every hour.
 */
function normalise(line) {
  return line.replace(/\b\d+(?:\.\d+)?\s*(?:s|sec|min|h|d)\b(?:\s+ago)?/g, '<age>');
}

function fingerprint(lines) {
  return lines.map(normalise).sort().join('\n');
}

/**
 * state: { fingerprint, firstSentAt, lastSentAt } (ms) or {} when nothing is outstanding.
 * Returns { send: null | { kind, subject, body }, state } — the state to store whether or not
 * the send succeeds is the caller's call (it only stores it after a successful send).
 */
function decide(report, state, now) {
  const st = state && typeof state === 'object' ? state : {};
  const v = verdict(report);
  const lines = failures(report);
  const at = new Date(now).toISOString();

  if (v !== 'FAIL' || lines.length === 0) {
    // a report we cannot read is not an all-clear
    if (v === null) return { send: null, state: st };
    if (st.fingerprint) {
      return {
        send: {
          kind: 'cleared',
          subject: 'Undercut ops check: cleared',
          body: `The Undercut ops check is back to ${v} as of ${at}.\n\nIt had been failing since ${new Date(st.firstSentAt).toISOString()}:\n\n${st.fingerprint}\n`,
        },
        state: {},
      };
    }
    return { send: null, state: st };
  }

  const fp = fingerprint(lines);
  const list = lines.map((l) => `- ${l}`).join('\n');
  if (st.fingerprint !== fp) {
    return {
      send: {
        kind: st.fingerprint ? 'changed' : 'new',
        subject: `Undercut ops check FAILED: ${lines.length === 1 ? lines[0].replace(/^\*\*(\w+)\*\*.*$/, '$1') : `${lines.length} checks`}`,
        body: `The Undercut ops check failed at ${at}.\n\n${list}\n`,
      },
      state: { fingerprint: fp, firstSentAt: st.fingerprint ? st.firstSentAt : now, lastSentAt: now },
    };
  }
  if (now - (st.lastSentAt || 0) >= REMIND_MS) {
    const days = ((now - st.firstSentAt) / REMIND_MS).toFixed(1);
    return {
      send: {
        kind: 'reminder',
        subject: `Undercut ops check STILL FAILING (${days} d)`,
        body: `Still failing at ${at}, first reported ${new Date(st.firstSentAt).toISOString()}.\n\n${list}\n`,
      },
      state: { ...st, lastSentAt: now },
    };
  }
  return { send: null, state: st };
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

module.exports = { decide, failures, verdict, normalise, fingerprint, parseEnv, REMIND_MS };
