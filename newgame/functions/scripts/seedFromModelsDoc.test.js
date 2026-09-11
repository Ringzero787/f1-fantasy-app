// node --test newgame/functions/scripts/*.test.js — MODELS doc parsing and capped pricing.
// The fixture is synthetic (same table shapes as Ben's MODELS docs, which stay off this public repo).
// Its rows reuse values from the live Madrid R16 lines so the expected odds match what is stored.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseModels, driverEntity, zoneSigma } = require('./seedFromModelsDoc');
const { offered, HOLD } = require('./_pricing');

const MODELS = `# Synthetic MODELS doc (test fixture)

## Race O/U Table (Over/Under finishing position)

### Method
Closest half-integer line; normal CDF around the prediction.

### Full output (Test GP)

| Rk | Driver | Pred | O/U Line | Under % | Under $ | Over % | Over $ | Upper | Lower |
|---:|---|---:|---:|---:|---:|---:|---:|:---:|:---:|
| 1 | antonelli | 2.38 | O/U 2.5 | 52% | -110 | 48% | +110 | P1 | P4 |
| 2 | **russell** | 4.81 | O/U 4.5 | 44% | +128 | 56% | **-128** | P3 | P6 |
| 3 | gasly | 9.44 | O/U 9.5 | 50% | -102 | 50% | +102 | P8 | P11 |

## Constructor O/U (Average team finish)

### Full output (Test GP)

| Rk | Team | Drivers | Avg | Line | Under % | Under $ | Over % | Over $ | Upper | Lower |
|---:|---|---|---:|---:|---:|---:|---:|---:|:---:|:---:|
| 1 | mercedes | antonelli + russell | 3.60 | O/U 3.5 | 48% | +110 | 52% | -110 | P2 | P5 |

## Quali O/U Table (Over/Under qualifying position)

### Full output (Test GP, n=8 window)

| Rk | Driver | Pred | O/U Line | Under % | Under $ | Over % | Over $ | Upper | Lower |
|---:|---|---:|---:|---:|---:|---:|---:|:---:|:---:|
| 1 | antonelli | 2.38 | O/U 2.5 | 51% | -105 | 49% | +105 | P1 | P4 |
`;

test('parses race drivers, constructors (doubled into SUM space) and qualifying', () => {
  const { race, qualifying } = parseModels(MODELS);
  assert.deepEqual(Object.keys(race), ['antonelli', 'russell', 'gasly', 'mercedes']);
  assert.deepEqual(Object.keys(qualifying), ['antonelli']);
  const a = race.antonelli;
  assert.deepEqual(
    [a.predicted, a.predictedLo, a.predictedHi, a.line, a.ouLine, a.sigma, a.underProbability, a.withProbability, a.withOdds, a.againstOdds],
    [2.38, 1, 4, 3, 2.5, 2, 0.52, 0.68, 1.4, 3],
  );
  assert.equal(race.russell.entityId, 'russell', 'bold markers are stripped');
  assert.deepEqual([race.gasly.sigma, race.gasly.withOdds], [5, 3.07], 'midfield zone σ = 5');
  const m = race.mercedes;
  assert.deepEqual([m.entityKind, m.predicted, m.predictedLo, m.predictedHi, m.ouLine, m.sigma, m.withOdds], ['constructor', 7.2, 4, 10, 7, 3.22, 1.32]);
});

test('a missing section is an error, not an empty doc', () => {
  assert.throws(() => parseModels('# nothing here'), /section not found/);
});

test('zone σ: tight at the front and back, wide in the midfield', () => {
  assert.deepEqual([zoneSigma(3), zoneSigma(7.49), zoneSigma(7.5), zoneSigma(14.49), zoneSigma(14.5), zoneSigma(20)], [2, 2, 5, 5, 2, 2]);
});

test('offered odds stay above 1.00 and finite at any probability', () => {
  assert.equal(offered(0.5), 1.91);
  assert.equal(offered(0.99), 1.01);
  assert.equal(offered(1), 1.01);
  assert.equal(offered(0), 1000);
  for (let p = 0; p <= 1.0001; p += 0.01) {
    const o = offered(p);
    assert.ok(o > 1 && Number.isFinite(o), `p=${p.toFixed(2)} → ${o}`);
  }
});

test('a near-certain band no longer prices below 1.00', () => {
  // Band P1–P12 around a predicted 4.0 (σ 2): in-band probability ≈ 0.96.
  const [, e] = driverEntity(['1', 'x', '4.00', 'O/U 4.5', '95%', '', '5%', '', 'P1', 'P12']);
  assert.ok(e.withProbability > 0.955);
  assert.ok(1 / (e.withProbability * HOLD) < 1, 'the old formula would have offered less than the stake back');
  assert.equal(e.withOdds, 1.01);
  assert.ok(e.againstOdds > 1 && Number.isFinite(e.againstOdds));
});
