// Calibration backtest for Ben's lines. For every settled race: when a line
// said a result had an X% chance of landing in [predictedLo, predictedHi], how
// often did it — and what would backing every WITH or every AGAINST at the
// offered odds have returned? How did Ben's best bets do? What did the book
// make or lose on settled picks? Read-only and advisory — the AIDLC lookback
// runs it as a non-blocking G15 check.
//
// Usage (from the repo root; run `npm run build` in newgame/functions first —
// grading reuses settlement's compiled functions so "in range" means exactly
// what paid out):
//   node newgame/functions/scripts/calibrateBenLines.js [--season=2026] [--report=<file.md>] [--json]
// Without --json it prints the markdown report. With --json it prints G15
// findings ({"findings":[...]}) and, with --report, writes the markdown there.
// Without Firestore credentials (CI) --json reports no findings and exits 0.
//
// Counted: completed races, sessions with official results, lines with a
// predicted range. Left out: backfill_actuals docs (placeholders built from the
// results after the fact), legacy single-number lines, and best bets — their
// ranges and 1.90 odds are Ben's calls, so they are reported on their own.

const fs = require('fs');
const path = require('path');

const SESSIONS = ['qualifying', 'race', 'sprint'];
const RESULTS_KEY = { qualifying: 'qualifyingResults', race: 'raceResults', sprint: 'sprintResults' };
const RETIRED = new Set(['dnf', 'dsq', 'dns']);
// Gross return of a winning AGAINST unit on a best bet: stake back + profit × 1.5 (settlement's boost).
const BEST_BET_AGAINST_GROSS = (odds) => 1 + (odds - 1) * 1.5;

const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const clip = (p) => Math.min(0.99, Math.max(0.01, p));
const pct = (x) => (x == null ? '—' : `${(x * 100).toFixed(1)}%`);
const signedPct = (x) => (x == null ? '—' : `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}%`);
const num = (x, d = 3) => (x == null ? '—' : x.toFixed(d));
const money = (x) => `${x < 0 ? '−' : ''}$${Math.abs(x).toFixed(2)}`;

// Stated chance the result lands in range: the stored model probability, else the odds' implied share.
function statedChance(e) {
  if (typeof e.withProbability === 'number') return e.withProbability;
  const a = 1 / e.withOdds, b = 1 / e.againstOdds;
  return a / (a + b);
}

function zoneOf(e) {
  if (e.entityKind === 'constructor') return 'constructors';
  const p = typeof e.predicted === 'number' ? e.predicted : (e.predictedLo + e.predictedHi) / 2;
  return p < 7.5 ? 'front (P1–P7)' : p < 14.5 ? 'midfield (P8–P14)' : 'back (P15+)';
}

const sourceOf = (s) => (s === 'ben_lite_generator' ? 'generator' : /^ben_model/.test(s || '') ? 'Ben model' : s || 'unknown');

// Per unit staked on every line: WITH pays withOdds when it lands, AGAINST pays againstOdds when it misses.
function summarise(rows) {
  if (!rows.length) return { n: 0, meanP: null, hit: null, brier: null, skill: null, logLoss: null, withReturn: null, againstReturn: null };
  const hit = avg(rows.map((r) => r.y));
  const brier = avg(rows.map((r) => (r.p - r.y) ** 2));
  const ref = hit * (1 - hit); // Brier of always stating the observed base rate
  return {
    n: rows.length,
    meanP: avg(rows.map((r) => r.p)),
    hit,
    brier,
    skill: ref > 0 ? 1 - brier / ref : null,
    logLoss: -avg(rows.map((r) => (r.y ? Math.log(clip(r.p)) : Math.log(1 - clip(r.p))))),
    withReturn: avg(rows.map((r) => (r.y ? r.withOdds : 0))) - 1,
    againstReturn: avg(rows.map((r) => (r.y ? 0 : r.againstOdds))) - 1,
  };
}

function reliability(rows) {
  const buckets = Array.from({ length: 10 }, (_, i) => ({ lo: i / 10, hi: (i + 1) / 10, rows: [] }));
  for (const r of rows) buckets[Math.min(9, Math.floor(r.p * 10))].rows.push(r);
  return buckets.filter((b) => b.rows.length).map((b) => {
    const s = summarise(b.rows);
    return { range: `${Math.round(b.lo * 100)}–${Math.round(b.hi * 100)}%`, n: s.n, meanP: s.meanP, hit: s.hit, gap: s.hit - s.meanP, withReturn: s.withReturn, againstReturn: s.againstReturn };
  });
}

function groupBy(rows, key) {
  const out = {};
  for (const r of rows) (out[r[key]] = out[r[key]] || []).push(r);
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, summarise(v)]));
}

// Settled picks per race, from settlement's own records. Staked calls and free (zero-stake) calls are kept
// apart: a free call's payout is the flat win bonus, a staked call's is stake × odds (plus the bonus).
function bookResults(picks, roundOf) {
  const byRace = {};
  for (const p of picks) {
    if (!p.settledOutcomes) continue;
    const b = (byRace[p.raceId] = byRace[p.raceId] || { race: p.raceId, round: roundOf[p.raceId] ?? null, players: 0, calls: 0, staked: 0, stake: 0, stakedPayout: 0, freePayout: 0, penalties: 0, withCalls: 0, withWins: 0, againstCalls: 0, againstWins: 0 });
    b.players++;
    for (const outs of Object.values(p.settledOutcomes)) {
      for (const o of Object.values(outs || {})) {
        b.calls++;
        if (o.stake > 0) { b.staked++; b.stake += o.stake; b.stakedPayout += o.payout || 0; } else b.freePayout += o.payout || 0;
        b.penalties += o.penalty || 0;
        if (o.side === 'with') { b.withCalls++; if (o.won) b.withWins++; } else { b.againstCalls++; if (o.won) b.againstWins++; }
      }
    }
  }
  const races = Object.values(byRace).sort((a, b) => (a.round ?? 0) - (b.round ?? 0));
  for (const b of races) b.houseNet = b.stake + b.penalties - b.stakedPayout - b.freePayout;
  return races;
}

function bestBetSummary(bets) {
  if (!bets.length) return null;
  const hits = bets.filter((b) => b.y).length;
  return {
    n: bets.length,
    hits,
    hit: hits / bets.length,
    withReturn: avg(bets.map((b) => (b.y ? b.withOdds : 0))) - 1,
    againstReturn: avg(bets.map((b) => (b.y ? 0 : BEST_BET_AGAINST_GROSS(b.againstOdds)))) - 1,
  };
}

// Pure: season data + settlement's grading functions → the report.
function calibrate({ races, linesById, constructors, picks }, grade) {
  const driverToCtor = {}, ctorDrivers = {};
  for (const c of constructors) for (const d of c.drivers || []) { driverToCtor[d] = c.id; (ctorDrivers[c.id] = ctorDrivers[c.id] || []).push(d); }
  const roundOf = Object.fromEntries(races.map((r) => [r.id, r.round]));
  const settled = {};
  for (const p of picks) if (p.settledOutcomes) (settled[p.raceId] = settled[p.raceId] || []).push(p);

  const rows = [], bestBets = [], excluded = [];
  const mismatches = new Map();
  let legacy = 0;
  for (const race of races.filter((r) => r.status === 'completed').sort((a, b) => a.round - b.round)) {
    for (const s of SESSIONS) {
      const doc = linesById[`${race.id}_${s}`];
      if (!doc) continue;
      if (doc.sourceFile === 'backfill_actuals') { excluded.push({ race: race.id, session: s, why: 'placeholder lines built from the results (backfill_actuals)' }); continue; }
      const raw = race.results?.[RESULTS_KEY[s]];
      const results = grade.buildSessionResults(raw, driverToCtor);
      if (!results) { excluded.push({ race: race.id, session: s, why: 'no official results' }); continue; }
      const retired = new Set((raw || []).filter((r) => r.driverId && RETIRED.has(String(r.status || '').toLowerCase())).map((r) => r.driverId));
      for (const e of Object.values(doc.entities || {})) {
        const isCtor = e.entityKind === 'constructor';
        const result = isCtor ? results.constructor[e.entityId] : results.driver[e.entityId];
        if (result == null) continue;
        if (typeof e.predictedLo !== 'number' || typeof e.predictedHi !== 'number') { legacy++; continue; }
        const outcome = grade.decideOutcome(e, result);
        for (const p of settled[race.id] || []) {
          const o = p.settledOutcomes?.[s]?.[e.entityId];
          if (o && o.outcome !== outcome) mismatches.set(`${race.id}/${s}/${e.entityId}`, { race: race.id, session: s, id: e.entityId, settled: o.outcome, now: outcome, result });
        }
        const y = outcome === 'with' ? 1 : 0;
        const dnf = isCtor ? (ctorDrivers[e.entityId] || []).some((d) => retired.has(d)) : retired.has(e.entityId);
        if (e.bestBet) {
          const half = isCtor ? 2 : 1;
          bestBets.push({ race: race.id, round: race.round, session: s, id: e.entityId, call: e.benCall || `P${Math.round(e.predictedLo / half)}–P${Math.round(e.predictedHi / half)}`, result, y, withOdds: e.withOdds, againstOdds: e.againstOdds });
          continue;
        }
        rows.push({ race: race.id, round: race.round, session: s, kind: e.entityKind, zone: zoneOf(e), source: sourceOf(doc.sourceFile), p: statedChance(e), y, dnf, withOdds: e.withOdds, againstOdds: e.againstOdds });
      }
    }
  }
  const raceMisses = rows.filter((r) => r.session !== 'qualifying' && !r.y);
  return {
    overall: summarise(rows),
    reliability: reliability(rows),
    bySource: groupBy(rows, 'source'),
    bySession: groupBy(rows, 'session'),
    byZone: groupBy(rows, 'zone'),
    byRace: groupBy(rows, 'race'),
    retirements: { misses: raceMisses.length, withRetirement: raceMisses.filter((r) => r.dnf).length },
    bestBets,
    bestBetSummary: bestBetSummary(bestBets),
    book: bookResults(picks, roundOf),
    excluded,
    legacy,
    mismatches: [...mismatches.values()],
  };
}

// Advisory G15 findings (the lookback check is configured non-blocking).
function findings(r) {
  const out = [];
  if (r.overall.n && r.overall.n < 200) out.push({ severity: 'info', title: `small sample: ${r.overall.n} graded lines`, detail: 'bucket-level gaps are noisy below a few hundred lines' });
  for (const b of r.reliability) {
    if (b.n >= 20 && Math.abs(b.gap) >= 0.15) {
      out.push({ severity: 'medium', title: `lines stated ${pct(b.meanP)} in the ${b.range} bucket but landed ${pct(b.hit)} (n=${b.n})`, detail: `${b.gap > 0 ? 'under-confident' : 'over-confident'}; backing every WITH returned ${signedPct(b.withReturn)}, every AGAINST ${signedPct(b.againstReturn)}` });
    }
  }
  if (r.overall.skill != null && r.overall.skill <= 0) out.push({ severity: 'medium', title: `no better than the base rate (Brier skill ${num(r.overall.skill)})`, detail: `Brier ${num(r.overall.brier)} vs ${num(r.overall.hit * (1 - r.overall.hit))} for always stating ${pct(r.overall.hit)}` });
  const bb = r.bestBetSummary;
  if (bb && bb.n >= 10 && (bb.withReturn > 0.1 || bb.againstReturn > 0.1)) out.push({ severity: 'medium', title: `Ben's best bets landed ${bb.hits}/${bb.n} (${pct(bb.hit)}): backing WITH returned ${signedPct(bb.withReturn)}, AGAINST ${signedPct(bb.againstReturn)}`, detail: 'best bets are all priced 1.90 / 1.90 whatever their chance' });
  if (r.mismatches.length) out.push({ severity: 'medium', title: `${r.mismatches.length} settled outcome(s) disagree with the current lines and results`, detail: r.mismatches.slice(0, 8).map((m) => `${m.race} ${m.session} ${m.id}: settled ${m.settled}, now ${m.now} (result ${m.result})`).join('\n') + '\nlines edited after settlement, or results corrected without a re-grade' });
  const house = r.book.reduce((a, b) => a + b.houseNet, 0);
  if (r.book.length && house < 0) {
    const stakes = r.book.reduce((a, b) => a + b.stake - b.stakedPayout, 0);
    const free = r.book.reduce((a, b) => a + b.penalties - b.freePayout, 0);
    out.push({ severity: 'low', title: `the book lost ${money(-house)} across ${r.book.length} settled race(s)`, detail: `staked calls ${money(stakes)} for the house; free-call bonuses minus loss penalties ${money(free)}` });
  }
  return out;
}

function markdown(r, { generatedAt = new Date().toISOString().slice(0, 10), season = null } = {}) {
  const L = [];
  const row = (cells) => L.push(`| ${cells.join(' | ')} |`);
  const table = (head, rows) => { row(head); row(head.map(() => '---')); rows.forEach(row); L.push(''); };
  const splits = (title, groups) => {
    L.push(`### ${title}`, '');
    table(['', 'lines', 'stated', 'landed', 'Brier', 'skill', 'back WITH', 'back AGAINST'], Object.entries(groups).map(([k, s]) => [k, s.n, pct(s.meanP), pct(s.hit), num(s.brier), num(s.skill, 2), signedPct(s.withReturn), signedPct(s.againstReturn)]));
  };
  const o = r.overall;
  L.push(`# Ben's lines — calibration backtest${season ? ` (${season})` : ''}`, '',
    `Generated ${generatedAt}. "Stated" is the chance a line gave of the result landing in its range; "landed" is how often it did. Brier: lower is better (0.25 = coin-flip guessing). Skill: improvement over always stating the observed base rate (0 = no better, 1 = perfect). "Back WITH / AGAINST": what staking 1 on every such line at the offered odds returned (positive = players had the edge).`, '');
  L.push('## Summary', '');
  table(['graded lines', 'stated (mean)', 'landed', 'Brier', 'skill', 'log loss', 'back WITH', 'back AGAINST'], [[o.n, pct(o.meanP), pct(o.hit), num(o.brier), num(o.skill, 2), num(o.logLoss), signedPct(o.withReturn), signedPct(o.againstReturn)]]);
  if (r.retirements.misses) L.push(`Race and sprint: ${r.retirements.withRetirement} of ${r.retirements.misses} misses involved a DNF, DSQ or DNS.`, '');
  L.push('## Reliability', '', 'Lines grouped by stated chance. A well-calibrated book lands close to the stated chance in every row, and neither side makes money.', '');
  table(['stated', 'lines', 'mean stated', 'landed', 'gap', 'back WITH', 'back AGAINST'], r.reliability.map((b) => [b.range, b.n, pct(b.meanP), pct(b.hit), `${b.gap >= 0 ? '+' : '−'}${Math.abs(b.gap * 100).toFixed(1)} pts`, signedPct(b.withReturn), signedPct(b.againstReturn)]));
  L.push('## Splits', '');
  splits('By source', r.bySource);
  splits('By session', r.bySession);
  splits('By zone', r.byZone);
  splits('By race', r.byRace);
  L.push("## Ben's best bets", '');
  const bb = r.bestBetSummary;
  if (bb) {
    L.push(`${bb.hits} of ${bb.n} landed (${pct(bb.hit)}). Priced 1.90 / 1.90, so WITH breaks even at 52.6%. Staking 1 on every best bet returned ${signedPct(bb.withReturn)} backing WITH and ${signedPct(bb.againstReturn)} backing AGAINST (with its ×1.5 profit boost).`, '');
    table(['round', 'race', 'call', 'result', 'landed'], r.bestBets.map((b) => [b.round, `${b.race} ${b.session}`, `${b.id} ${b.call}`, b.result, b.y ? 'yes' : 'no']));
  } else L.push('None in the graded races.', '');
  L.push('## The book', '', 'From settlement records. House net = stakes + loss penalties − payouts. Paid on stakes is stake × odds plus the flat $10 win bonus; free calls (no stake) pay only the bonus. Penalty debits are floored at $0 garage cash, so collected penalties can be lower.', '');
  table(['round', 'race', 'players', 'calls', 'staked', 'stakes', 'paid on stakes', 'free-call bonuses', 'penalties', 'house net', 'WITH won', 'AGAINST won'],
    r.book.map((b) => [b.round ?? '—', b.race, b.players, b.calls, b.staked, money(b.stake), money(b.stakedPayout), money(b.freePayout), money(b.penalties), money(b.houseNet), `${b.withWins}/${b.withCalls}`, `${b.againstWins}/${b.againstCalls}`]));
  const sum = (k) => r.book.reduce((a, b) => a + b[k], 0);
  L.push(`Total house net: ${money(sum('houseNet'))} — staked calls ${money(sum('stake') - sum('stakedPayout'))}, free-call bonuses ${money(-sum('freePayout'))}, penalties ${money(sum('penalties'))}.`, '');
  L.push('## Consistency', '');
  L.push(r.mismatches.length ? `${r.mismatches.length} settled outcome(s) no longer match the current lines and results:` : 'Every settled outcome matches the current lines and results.', '');
  if (r.mismatches.length) table(['race', 'session', 'entity', 'settled', 'now', 'result'], r.mismatches.map((m) => [m.race, m.session, m.id, m.settled, m.now, m.result]));
  L.push('## Not counted', '');
  L.push(`${r.legacy} legacy single-number line(s).`, '');
  if (r.excluded.length) table(['race', 'session', 'why'], r.excluded.map((x) => [x.race, x.session, x.why]));
  return L.join('\n');
}

async function load(db, season) {
  let q = db.collection('races');
  if (season) q = q.where('seasonId', '==', season);
  const races = (await q.get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const linesById = Object.fromEntries((await db.collection('ben_lines').get()).docs.map((d) => [d.id, d.data()]));
  const constructors = (await db.collection('constructors').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const ids = new Set(races.map((r) => r.id));
  const picks = (await db.collection('tl_picks').get()).docs.map((d) => d.data()).filter((p) => ids.has(p.raceId));
  return { races, linesById, constructors, picks };
}

async function main() {
  const argv = process.argv.slice(2);
  const value = (k) => { const a = argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
  const json = argv.includes('--json');
  const season = value('season');
  const reportPath = value('report');

  // As a G15 check (--json) it must never fail where it cannot run — CI's lookback has no Firestore
  // credentials and may not even install the functions' dependencies — so it reports nothing and says why.
  const skip = (why) => {
    console.error(`calibrateBenLines: skipped — ${why}`);
    process.stdout.write(JSON.stringify({ findings: [] }) + '\n');
  };
  let admin, grade;
  try {
    admin = require('../node_modules/firebase-admin');
  } catch {
    if (json) return skip('newgame/functions dependencies are not installed here');
    throw new Error('firebase-admin not installed — run npm ci in newgame/functions');
  }
  if (!admin.apps.length) admin.initializeApp({ projectId: 'f1-app-18077' });
  try {
    grade = require('../lib/triggers/settleWeekend.js');
  } catch {
    if (json) return skip('compiled functions not found (npm run build in newgame/functions)');
    throw new Error('compiled functions not found — run `npm run build` in newgame/functions first');
  }
  let data;
  try {
    data = await load(admin.firestore(), season);
  } catch (e) {
    if (json && /credential|default credentials|UNAUTHENTICATED|PERMISSION_DENIED/i.test(e.message)) return skip(`no Firestore access here (${e.message.split('\n')[0]})`);
    throw e;
  }
  const report = calibrate(data, grade);
  const md = markdown(report, { season });
  if (reportPath) {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, md + '\n');
    console.error(`calibrateBenLines: report written to ${reportPath}`);
  }
  if (json) process.stdout.write(JSON.stringify({ findings: findings(report) }) + '\n');
  else if (!reportPath) process.stdout.write(md + '\n');
}

module.exports = { calibrate, findings, markdown, summarise, reliability, statedChance, bookResults, bestBetSummary };

if (require.main === module) {
  main().then(() => process.exit(0)).catch((e) => { console.error(`calibrateBenLines: ${e.message}`); process.exit(1); });
}
