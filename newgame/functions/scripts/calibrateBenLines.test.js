// node --test newgame/functions/scripts/*.test.js (after `npm run build` in newgame/functions) — synthetic season, no Firestore.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const admin = require('../node_modules/firebase-admin');

// Grading reuses settlement's compiled functions; settleWeekend.js creates its Firestore client on load.
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-tracklimits-test' });
const grade = require('../lib/triggers/settleWeekend.js');
const { calibrate, findings, markdown, summarise, reliability, statedChance } = require('./calibrateBenLines');

const close = (a, b) => Math.abs(a - b) < 1e-9;
const line = (id, lo, hi, p, over = {}) => ({ entityId: id, entityKind: 'driver', predictedLo: lo, predictedHi: hi, withProbability: p, withOdds: 1.9, againstOdds: 1.9, ...over });
const rows = [
  { position: 1, driverId: 'a', constructorId: 't1', status: 'finished' },
  { position: 4, driverId: 'b', constructorId: 't1', status: 'finished' },
  { position: 9, driverId: 'c', status: 'dnf' },
  { position: 2, driverId: 'd', status: 'finished' },
  { position: 3, driverId: 'e', status: 'finished' },
];
const season = () => ({
  races: [
    { id: 'r1', round: 1, status: 'completed', results: { raceResults: rows, qualifyingResults: rows } },
    { id: 'r2', round: 2, status: 'upcoming' },
  ],
  constructors: [{ id: 't1', drivers: ['a', 'b'] }],
  linesById: {
    r1_race: {
      sourceFile: 'ben_model_R1',
      entities: {
        a: line('a', 1, 4, 0.7), // lands (P1)
        b: line('b', 1, 3, 0.7), // misses (P4)
        c: line('c', 1, 5, 0.3), // misses (P9, retired)
        t1: line('t1', 3, 6, 0.6, { entityKind: 'constructor' }), // lands (1 + 4 = 5)
        d: line('d', 1, 5, 0.67, { bestBet: true, benCall: 'U 5.5' }), // Ben's call, lands (P2)
        e: { entityId: 'e', entityKind: 'driver', line: 5, withOdds: 1.9, againstOdds: 1.9 }, // legacy
      },
    },
    r1_qualifying: { sourceFile: 'backfill_actuals', entities: { a: line('a', 1, 2, 0.5) } },
    r2_race: { sourceFile: 'ben_model_R2', entities: { a: line('a', 1, 4, 0.7) } },
  },
  picks: [
    { raceId: 'r1', settledOutcomes: { race: {
      a: { side: 'with', stake: 10, outcome: 'with', won: true, payout: 29 },
      b: { side: 'with', stake: 0, outcome: 'with', won: true, payout: 10 }, // settled on lines since changed
    } } },
    { raceId: 'r1', settledOutcomes: { race: {
      c: { side: 'against', stake: 5, outcome: 'against', won: true, payout: 19.5 },
      t1: { side: 'against', stake: 10, outcome: 'with', won: false, payout: 0, penalty: 10 },
    } } },
    { raceId: 'r1', picks: {} }, // unsettled
  ],
});

test("grades model lines with settlement's rules and scores them", () => {
  const r = calibrate(season(), grade);
  assert.equal(r.overall.n, 4, 'a, b, c, t1 — not the best bet, the legacy line, the placeholder session or the upcoming race');
  assert.equal(r.overall.hit, 0.5);
  assert.ok(close(r.overall.meanP, 0.575));
  assert.ok(close(r.overall.brier, 0.2075)); // (0.09 + 0.49 + 0.09 + 0.16) / 4
  assert.ok(close(r.overall.skill, 0.17)); // 1 − 0.2075 / 0.25
  assert.ok(close(r.overall.withReturn, -0.05)); // (1.9 + 0 + 0 + 1.9) / 4 − 1
  assert.ok(close(r.overall.againstReturn, -0.05));
  assert.equal(r.legacy, 1);
  assert.deepEqual(r.excluded.map((x) => [x.race, x.session]), [['r1', 'qualifying']]);
  assert.deepEqual(r.retirements, { misses: 2, withRetirement: 1 }, 'b missed on pace, c retired');
  assert.deepEqual(Object.keys(r.byZone).sort(), ['constructors', 'front (P1–P7)']);
});

test("best bets are reported on their own, with returns at 1.90 and the ×1.5 AGAINST boost", () => {
  const r = calibrate(season(), grade);
  assert.deepEqual(r.bestBets.map((b) => [b.id, b.call, b.result, b.y]), [['d', 'U 5.5', 2, 1]]);
  assert.ok(close(r.bestBetSummary.withReturn, 0.9));
  assert.ok(close(r.bestBetSummary.againstReturn, -1));
});

test('the book from settlement records, staked and free calls apart; outcomes that no longer match', () => {
  const r = calibrate(season(), grade);
  const [b] = r.book;
  assert.deepEqual([b.race, b.players, b.calls, b.staked, b.stake, b.stakedPayout, b.freePayout, b.penalties, b.houseNet], ['r1', 2, 4, 3, 25, 48.5, 10, 10, -23.5]);
  assert.deepEqual([b.withWins, b.withCalls, b.againstWins, b.againstCalls], [2, 2, 1, 2]);
  assert.deepEqual(r.mismatches.map((m) => [m.id, m.settled, m.now]), [['b', 'with', 'against']]);
});

test('findings: small sample, mismatch and a losing book; reliability gaps need 20 lines', () => {
  const titles = findings(calibrate(season(), grade)).map((f) => `${f.severity} ${f.title}`);
  assert.ok(titles.includes('info small sample: 4 graded lines'));
  assert.ok(titles.includes('medium 1 settled outcome(s) disagree with the current lines and results'));
  assert.ok(titles.includes('low the book lost $23.50 across 1 settled race(s)'));
  assert.ok(!titles.some((t) => t.includes('bucket')));
  const overconfident = Array.from({ length: 25 }, (_, i) => ({ p: 0.8, y: i < 10 ? 1 : 0, withOdds: 1.2, againstOdds: 4 }));
  const gaps = findings({ overall: summarise(overconfident), reliability: reliability(overconfident), mismatches: [], book: [], bestBetSummary: null });
  const bucket = gaps.find((f) => /stated 80\.0% in the 80–90% bucket but landed 40\.0% \(n=25\)/.test(f.title));
  assert.ok(bucket && bucket.severity === 'medium');
  assert.match(bucket.detail, /over-confident; backing every WITH returned −52\.0%, every AGAINST \+140\.0%/);
  assert.ok(gaps.some((f) => /no better than the base rate/.test(f.title)));
});

test('stated chance falls back to the odds when no probability was stored', () => {
  assert.equal(statedChance({ withOdds: 1.9, againstOdds: 1.9 }), 0.5);
  assert.equal(statedChance({ withProbability: 0.3, withOdds: 1.9, againstOdds: 1.9 }), 0.3);
});

test('the markdown report has every section', () => {
  const md = markdown(calibrate(season(), grade), { generatedAt: '2026-09-11', season: '2026' });
  for (const h of ["# Ben's lines — calibration backtest (2026)", '## Summary', '## Reliability', '## Splits', "## Ben's best bets", '## The book', '## Consistency', '## Not counted']) assert.ok(md.includes(h), h);
  assert.match(md, /Race and sprint: 1 of 2 misses involved a DNF, DSQ or DNS\./);
  assert.match(md, /Total house net: −\$23\.50 — staked calls −\$23\.50, free-call bonuses −\$10\.00, penalties \$10\.00\./);
});
