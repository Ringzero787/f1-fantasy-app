// Invariant checker for Ben's lines (ben_lines/{raceId}_{session}) — the AIDLC
// G15 domain check for Track Limits. Read-only. Prints {"findings":[...]} on
// stdout (progress on stderr) and exits 0 unless it could not run at all.
//
// Usage (from newgame/functions):
//   node scripts/checkBenLines.js [--race=<raceId>]
// Race: --race, else AIDLC_OP_PARAMS.race when run by `aidlc op`, else the
// next race that is not completed. Credentials: GOOGLE_APPLICATION_CREDENTIALS.
//
// What it guards (each one a way settlement pays out wrongly or the app shows
// no lines): inverted or unreachable ranges, ranges one side can never win,
// odds that are not finite or not above 1.00, a book that gives players an
// edge on both sides, best bets outside the race doc or not exactly 3,
// missing drivers/constructors, lines older than the last completed race (the
// app hides them), and lines edited after their session locked (settlement
// grades against the current doc, not a lock-time snapshot).

const FIELD_SIZE = 22;

const ms = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : typeof v === 'string' ? Date.parse(v) || 0 : typeof v === 'number' ? v : v && typeof v.seconds === 'number' ? v.seconds * 1000 : 0);
const iso = (t) => (t ? new Date(t).toISOString() : 'never');

// Pure: race + its line docs + roster → findings. Exported for unit tests.
// expectLines: false for races further out than the next one, whose docs are
// legitimately empty placeholders.
function checkLines({ race, docs, drivers, constructors, lastCompletedRaceStart = 0, now = Date.now(), expectLines = true }) {
  const findings = [];
  const add = (severity, title, detail) => findings.push(detail ? { severity, title, detail } : { severity, title });
  const sessions = ['qualifying', 'race', ...(race.hasSprint ? ['sprint'] : [])];
  const activeDrivers = drivers.filter((d) => d.isActive !== false).map((d) => d.id);
  const activeCtors = constructors.filter((c) => c.isActive !== false).map((c) => c.id);
  const live = race.status !== 'completed' && race.status !== 'cancelled';

  for (const s of sessions) {
    const where = `${race.id}_${s}`;
    const doc = docs[s];
    const ents = doc?.entities || {};
    if (!Object.keys(ents).length) {
      if (expectLines) add('high', `${where}: no lines posted`);
      continue;
    }
    if (doc.posted !== true) add('medium', `${where}: posted flag is not true`);

    if (live) {
      const stamp = Math.max(ms(doc.postedAt), ms(doc.updatedAt));
      if (lastCompletedRaceStart && stamp && stamp <= lastCompletedRaceStart) {
        add('high', `${where}: lines are older than the last completed race`, `posted ${iso(stamp)}; the app only shows lines posted after ${iso(lastCompletedRaceStart)}`);
      }
      const lockAt = ms(race.schedule?.[s]);
      if (lockAt && now > lockAt && ms(doc.updatedAt) > lockAt) {
        add('high', `${where}: lines changed after the session locked`, `updated ${iso(ms(doc.updatedAt))}, locked ${iso(lockAt)}; picks placed before lock now settle on different lines`);
      }
    }

    for (const id of activeDrivers) if (!ents[id]) add('high', `${where}: no line for driver ${id}`);
    if (s !== 'qualifying') for (const id of activeCtors) if (!ents[id]) add('high', `${where}: no line for constructor ${id}`);

    for (const [id, e] of Object.entries(ents)) {
      if (!activeDrivers.includes(id) && !activeCtors.includes(id)) add('medium', `${where}: ${id} is not an active driver or constructor`, 'settlement skips it; players can pick it but it never grades');
      const isCtor = e.entityKind === 'constructor';
      const lo = e.predictedLo, hi = e.predictedHi;
      if (typeof lo !== 'number' || typeof hi !== 'number') {
        add('high', `${where}: ${id} has no predictedLo/predictedHi`, 'a legacy single-line entity settles on ±1 around `line`');
      } else {
        // Reachable results: a driver finishes 1..22; a constructor is the SUM of
        // both cars, 1+2=3 up to 22+22=44 (settlement counts a missing car as 22).
        const [min, max] = isCtor ? [3, FIELD_SIZE * 2] : [1, FIELD_SIZE];
        if (lo > hi) add('critical', `${where}: ${id} range ${lo}–${hi} is inverted`, 'WITH can never win');
        else if (hi < min || lo > max) add('critical', `${where}: ${id} range ${lo}–${hi} is unreachable (results run ${min}–${max})`, 'WITH can never win');
        else if (lo <= min && hi >= max) add('high', `${where}: ${id} range ${lo}–${hi} covers every result`, 'AGAINST can never win');
      }
      for (const k of ['withOdds', 'againstOdds']) {
        const o = e[k];
        if (typeof o !== 'number' || !Number.isFinite(o)) add('critical', `${where}: ${id} ${k} is ${JSON.stringify(o)}`, 'settlement multiplies stakes by it; a non-number corrupts garage cash');
        else if (o <= 1) add('critical', `${where}: ${id} ${k} ${o} is not above 1.00`, 'a correct call pays back less than the stake');
        else if (o > 50) add('medium', `${where}: ${id} ${k} ${o} is implausibly long`);
      }
      if (e.withOdds > 1 && e.againstOdds > 1 && Number.isFinite(e.withOdds) && Number.isFinite(e.againstOdds)) {
        const book = 1 / e.withOdds + 1 / e.againstOdds;
        if (book < 1) add(book < 0.97 ? 'high' : 'medium', `${where}: ${id} odds ${e.withOdds}/${e.againstOdds} give players an edge on both sides`, `implied book ${(book * 100).toFixed(1)}% (< 100%)`);
      }
      if (e.bestBet && s !== 'race') add('high', `${where}: ${id} is a best bet outside the race session`, 'settlement boosts AGAINST picks on any flagged line');
    }

    if (s === 'race') {
      const best = Object.values(ents).filter((e) => e.bestBet).map((e) => e.entityId);
      if (best.length !== 3) add('medium', `${where}: ${best.length} best bet(s), expected 3`, best.join(', ') || 'none flagged');
      if (!doc.bestBetsSource) add('low', `${where}: bestBetsSource is unset`, 'a generator run would re-pick best bets automatically');
    }
  }
  return findings;
}

async function main() {
  const admin = require('../node_modules/firebase-admin');
  admin.initializeApp({ projectId: 'f1-app-18077' });
  const db = admin.firestore();
  const arg = process.argv.slice(2).find((a) => a.startsWith('--race='));
  let raceId = arg ? arg.slice('--race='.length) : '';
  if (!raceId && process.env.AIDLC_OP_PARAMS) raceId = JSON.parse(process.env.AIDLC_OP_PARAMS).race || '';

  const races = (await db.collection('races').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const next = races.filter((r) => r.status !== 'completed' && r.status !== 'cancelled').sort((a, b) => a.round - b.round)[0];
  if (!raceId) raceId = next?.id || '';
  const race = races.find((r) => r.id === raceId);
  if (!race) throw new Error(`race ${raceId || '(none upcoming)'} not found`);
  const lastCompleted = races.filter((r) => r.status === 'completed' && r.round < race.round).sort((a, b) => b.round - a.round)[0];
  const expectLines = race.status === 'completed' || race.status === 'in_progress' || race.id === next?.id;

  const docs = {};
  for (const s of ['qualifying', 'race', 'sprint']) {
    const snap = await db.doc(`ben_lines/${race.id}_${s}`).get();
    if (snap.exists) docs[s] = snap.data();
  }
  const drivers = (await db.collection('drivers').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const constructors = (await db.collection('constructors').get()).docs.map((d) => ({ id: d.id, ...d.data() }));

  const findings = checkLines({ race, docs, drivers, constructors, lastCompletedRaceStart: ms(lastCompleted?.schedule?.race), expectLines });
  console.error(`checkBenLines ${race.id} (R${race.round}, ${race.status}): ${Object.keys(docs).join('+') || 'no docs'}, ${findings.length} finding(s)`);
  process.stdout.write(JSON.stringify({ findings }) + '\n');
  // --fail-on=<severity>: exit 2 when a finding is at least that severe, so an
  // aidlc op `verify` step can use the checker directly.
  const failOn = (process.argv.slice(2).find((a) => a.startsWith('--fail-on=')) || '').slice('--fail-on='.length);
  const RANK = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
  return failOn && findings.some((f) => RANK[f.severity] >= RANK[failOn]) ? 2 : 0;
}

module.exports = { checkLines, FIELD_SIZE };

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((e) => { console.error(`checkBenLines: ${e.message}`); process.exit(1); });
}
