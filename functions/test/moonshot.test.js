// F-106: Moonshot pricing, distributions, eligibility and model carry-forward are pure and tested here.
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-uc-test';
process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || JSON.stringify({ projectId: 'demo-uc-test', storageBucket: 'demo-uc-test.appspot.com' });
const { mergeConfig, DEFAULT_CONFIG } = require('../lib/moonshot/config.js');
const { discretise, balance, distribute, predictionProbability, summarise, zoneSigma } = require('../lib/moonshot/distribution.js');
const { bandFor, price, potentialReward, expectedValue } = require('../lib/moonshot/pricing.js');
const { eligibility, quoteRefusal } = require('../lib/moonshot/eligibility.js');
const { pickModel, parseRaceTable, buildModel } = require('../lib/moonshot/models.js');
const index = require('../lib/index.js');

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('config: absent means disabled; the document overrides defaults; bad values fall back', () => {
  assert.equal(mergeConfig(undefined).enabled, false);
  const c = mergeConfig({ enabled: true, unlockRound: 11, pointsStakeLevels: [25, 50], pricing: { mode: 'continuous', vig: 0.05 }, dnfRule: 'VOID', tokensPerTeam: 'three' });
  assert.equal(c.enabled, true); assert.equal(c.unlockRound, 11); assert.deepEqual(c.pointsStakeLevels, [25, 50]);
  assert.equal(c.pricing.mode, 'continuous'); assert.equal(c.pricing.vig, 0.05); assert.equal(c.dnfRule, 'VOID');
  assert.equal(c.tokensPerTeam, DEFAULT_CONFIG.tokensPerTeam);
  assert.equal(c.pricing.bands.length, 5);
  assert.deepEqual(mergeConfig({ copy: { intro: 'Make the call', bad: 3, worse: 'Place your bet' } }).copy, { intro: 'Make the call' });   // a forbidden word drops the override
  const wild = mergeConfig({ enabled: true, tokensPerTeam: 99, maxPerRace: 0, pricing: { vig: 8, maxMultiplier: 500, minMultiplier: 0 } });
  assert.deepEqual([wild.tokensPerTeam, wild.maxPerRace, wild.pricing.vig, wild.pricing.maxMultiplier, wild.pricing.minMultiplier], [20, 1, 0.5, 50, 0.1]);   // a typo cannot go live as an 800% margin
});

test('distribution: a discretised finish sums to one and peaks at the prediction', () => {
  const d = discretise(10.0, 2.0, 22);
  near(d.reduce((a, b) => a + b, 0), 1);
  assert.equal(d.indexOf(Math.max(...d)), 9);
  const front = discretise(3.0, 2.0, 22);                      // the tail below P1 folds into P1
  assert.ok(front[0] > front[2] && front[2] > front[5]);
  assert.equal(zoneSigma(3), 2.0); assert.equal(zoneSigma(10), 5.0); assert.equal(zoneSigma(18), 2.0);
  near(zoneSigma(7.5), 3.5); near(zoneSigma(14.5), 3.5);   // ramped, not stepped
  assert.ok(d.every((v) => v > 0));                           // nothing is impossible
});

test('distribution: balancing makes every driver finish somewhere and every position taken once', () => {
  const preds = { a: 1.5, b: 2.5, c: 4, d: 6, e: 9, f: 11, g: 13, h: 15, i: 17, j: 19 };
  const model = Object.fromEntries(Object.entries(preds).map(([id, p]) => [id, { predicted: p, sigma: zoneSigma(p) }]));
  const out = distribute(model);
  const ids = Object.keys(out);
  for (const id of ids) near(out[id].positions.reduce((a, b) => a + b, 0), 1, 1e-4);
  for (let k = 0; k < ids.length; k++) near(ids.reduce((a, id) => a + out[id].positions[k], 0), 1, ids.length * 1e-4 + 1e-3);   // n × FLOOR for the post-balance floor, 1e-3 for the residual of 50 balancing passes
  assert.ok(out.a.positions[0] > out.e.positions[0]);   // the favourite is likeliest to win
  assert.ok(out.j.positions[0] > 0 && out.a.positions[9] > 0);   // balancing keeps the floor: no call is refused as impossible
});

test('prediction probabilities aggregate the right positions', () => {
  const positions = [0.16, 0.15, 0.12, 0.11, 0.10, 0.08, 0.07, 0.21];
  near(predictionProbability(positions, 'WIN'), 0.16);
  near(predictionProbability(positions, 'PODIUM'), 0.43);
  near(predictionProbability(positions, 'TOP_5'), 0.64);
  near(predictionProbability(positions, 'EXACT_FINISH', 3), 0.12);
  assert.equal(predictionProbability(positions, 'EXACT_FINISH'), null);
  assert.equal(predictionProbability(positions, 'EXACT_FINISH', 9), null);
  const s = summarise(positions); assert.ok(s.lo >= 1 && s.hi <= 8 && s.expected > 1);
});

test('banded pricing: the document table, closed at the top, with the edges the simulation must weigh', () => {
  const pr = DEFAULT_CONFIG.pricing;
  assert.deepEqual(price(0.76, pr), { band: 'SAFE', multiplier: 0.5 });
  assert.deepEqual(price(0.43, pr), { band: 'BOLD', multiplier: 1.25 });
  assert.deepEqual(price(0.16, pr), { band: 'MOONSHOT', multiplier: 5 });
  assert.deepEqual(price(0.05, pr), { band: 'EXTREME', multiplier: 8 });
  assert.equal(bandFor(0.65, pr.bands).label, 'SAFE');       // boundary belongs to the upper band
  assert.equal(bandFor(0.6499, pr.bands).label, 'BOLD');
  assert.equal(bandFor(1, pr.bands).label, 'SAFE');
  near(expectedValue(0.64, 1.25), 0.44);                       // the exploitable top edge
  near(expectedValue(0.08, 8), -0.28);
});

test('continuous pricing: fair less the vig, rounded, floored and capped, same labels', () => {
  const pr = { ...DEFAULT_CONFIG.pricing, mode: 'continuous' };
  assert.deepEqual(price(0.5, pr), { band: 'BOLD', multiplier: 1 });        // (1/1)×0.92 → 0.92 → 1.00
  assert.deepEqual(price(0.16, pr), { band: 'MOONSHOT', multiplier: 4.75 }); // 5.25×0.92 = 4.83 → 4.75
  assert.equal(price(0.02, pr).multiplier, 8);                                // capped
  assert.equal(price(0.95, pr).multiplier, 0.25);                             // floored
  assert.equal(potentialReward(100, 4.75), 475);
});

const cfg = mergeConfig({ enabled: true });
const okInput = { cfg, race: { round: 15, lockAtMs: 2_000 }, nowMs: 1_000, tokensUsed: 0, callsOnRace: 0, type: 'PODIUM', currency: 'POINTS', stake: 100, balance: 2000, openStake: 0, modelAvailable: true, driverInModel: true, probability: 0.3, multiplier: 2.5 };

test('eligibility: the happy path and every refusal', () => {
  assert.equal(eligibility(okInput), null);
  assert.equal(eligibility({ ...okInput, cfg: mergeConfig({ enabled: false }) }).code, 'failed-precondition');
  assert.match(eligibility({ ...okInput, race: { round: 5, lockAtMs: 2_000 } }).message, /midseason/);
  assert.match(eligibility({ ...okInput, race: { round: 15, lockAtMs: null } }).message, /no lock time/);
  assert.match(eligibility({ ...okInput, nowMs: 2_000 }).message, /locked/);
  assert.equal(eligibility({ ...okInput, type: 'EXACT_FINISH', target: 3 }).code, 'invalid-argument');   // off in V1
  assert.match(eligibility({ ...okInput, stake: 75 }).message, /offered stakes/);
  assert.match(eligibility({ ...okInput, balance: 50 }).message, /points to risk/);
  assert.match(eligibility({ ...okInput, currency: 'CASH', balance: 50 }).message, /bank/);
  assert.equal(eligibility({ ...okInput, tokensUsed: 3 }).code, 'resource-exhausted');
  assert.match(eligibility({ ...okInput, callsOnRace: 1 }).message, /already have/);
  assert.equal(eligibility({ ...okInput, callsOnRace: 1, cfg: mergeConfig({ enabled: true, maxPerRace: 2 }) }), null);   // the knob is honoured
  assert.match(eligibility({ ...okInput, driverInModel: false }).message, /No model for that driver/);
  assert.match(eligibility({ ...okInput, modelAvailable: false, driverInModel: false }).message, /No model is published/);
  assert.match(eligibility({ ...okInput, race: { round: null, lockAtMs: 2_000 } }).message, /no round number/);
  assert.match(eligibility({ ...okInput, seasonMismatch: true }).message, /not in the current season/);
  assert.match(eligibility({ ...okInput, balance: 250, openStake: 200 }).message, /points to risk/);     // what is already at risk is not available again
  assert.equal(eligibility({ ...okInput, balance: 300, openStake: 200 }), null);
  const exact = { ...okInput, cfg: mergeConfig({ enabled: true, predictionTypesEnabled: ['EXACT_FINISH'] }), type: 'EXACT_FINISH' };
  assert.equal(eligibility({ ...exact, target: 20, positionsCount: 20 }), null);
  assert.match(eligibility({ ...exact, target: 21, positionsCount: 20 }).message, /finishing position/);
  assert.match(eligibility({ ...okInput, stake: 200, multiplier: 8 }).message, /at most 1000/);
  assert.equal(eligibility({ ...okInput, currency: 'CASH', stake: 200, multiplier: 8 }), null);          // the points cap is for points
});

test('a quote confirms once and only before it expires', () => {
  assert.equal(quoteRefusal({ used: false, expiresAtMs: 2_000 }, 1_000), null);
  assert.match(quoteRefusal({ used: true, expiresAtMs: 2_000 }, 1_000).message, /already confirmed/);
  assert.match(quoteRefusal({ used: false, expiresAtMs: 999 }, 1_000).message, /expired/);
});

test('model carry-forward: own model first, else the latest earlier round, else nothing', () => {
  const m = (raceId, round) => ({ raceId, round, season: '2026', source: 's', modelVersion: 'v', drivers: {}, positionsCount: 22 });
  const models = [m('r17', 17), m('r15', 15), m('r18', 18)];
  assert.equal(pickModel(models, 'r18', 18, true).carriedFrom, null);
  assert.deepEqual([pickModel(models, 'r19', 19, true).model.raceId, pickModel(models, 'r19', 19, true).carriedFrom], ['r18', 'r18']);
  assert.equal(pickModel(models, 'r16', 16, true).model.raceId, 'r15');
  assert.equal(pickModel(models, 'r19', 19, false), null);
  assert.equal(pickModel(models, 'r14', 14, true), null);
});

test('the Race O/U table parses into driver predictions and builds a model the game can price', () => {
  const md = ['# doc', '## Race O/U Table (Over/Under finishing position)',
    '| Rk | Driver | Pred | O/U Line | Under % | Under $ | Over % | Over $ | Upper | Lower |', '|---:|---|---:|---:|---:|---:|---:|---:|:---:|:---:|',
    ...['antonelli 2.58', 'verstappen 2.81', 'russell 3.67', 'leclerc 4.33', 'norris 5.1', 'piastri 5.9', 'hamilton 7.2', 'hadjar 8.1', 'sainz 9.4', 'albon 10.2', 'alonso 12.0', 'lawson 13.1'].map((s, i) => { const [d, p] = s.split(' '); return `| ${i + 1} | ${d} | ${p} | ${Math.round(+p)}.5 | — | — | — | **—** | P1 | P4 |`; }),
    '', '## Next section'].join('\n');
  const rows = parseRaceTable(md);
  assert.equal(rows.length, 12); assert.deepEqual(rows[0], { driverId: 'antonelli', predicted: 2.58 });
  const known = new Set(rows.map((r) => r.driverId).concat(['stroll']));
  const { model, unknown, missing } = buildModel(rows, { raceId: 'x', season: '2026', round: 19, source: 's', modelVersion: 'v' }, known);
  assert.deepEqual(unknown, []); assert.deepEqual(missing, ['stroll']);
  assert.ok(predictionProbability(model.drivers.antonelli.positions, 'WIN') > predictionProbability(model.drivers.lawson.positions, 'WIN'));
  assert.throws(() => parseRaceTable('# nothing here'), /not found/);
});

test('the callables are exported', () => {
  for (const f of ['moonshotQuote', 'moonshotConfirm', 'moonshotCancel', 'moonshotMenu', 'moonshotLeagueBoard']) assert.equal(typeof index[f], 'function', f);
});
