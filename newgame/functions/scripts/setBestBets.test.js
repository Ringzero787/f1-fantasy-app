// node --test newgame/functions/scripts/ — call parsing and model-line rebuild, no Firestore.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parsePicks, rangeFor, modelLine } = require('./setBestBets');

test('parsePicks splits id:call pairs', () => {
  assert.deepEqual(parsePicks('hamilton:P2-P5, sainz:O14.5,aston_martin:U 17.5'), [
    { id: 'hamilton', call: 'P2-P5' }, { id: 'sainz', call: 'O14.5' }, { id: 'aston_martin', call: 'U17.5' },
  ]);
  assert.throws(() => parsePicks('hamilton'), /<entityId>:<call>/);
});

test('driver calls', () => {
  assert.deepEqual(rangeFor('P2-P5', false), { lo: 2, hi: 5, benCall: null });
  assert.deepEqual(rangeFor('O4.5', false), { lo: 5, hi: 22, benCall: 'O 4.5' });
  assert.deepEqual(rangeFor('U5.5', false), { lo: 1, hi: 5, benCall: 'U 5.5' });
});

test('constructor calls are per-car averages stored as the SUM of both cars', () => {
  assert.deepEqual(rangeFor('P2-P5', true), { lo: 4, hi: 10, benCall: null });
  assert.deepEqual(rangeFor('O12.5', true), { lo: 26, hi: 44, benCall: 'O 12.5' });
  assert.deepEqual(rangeFor('U17.5', true), { lo: 3, hi: 34, benCall: 'U 17.5' });
});

test('malformed calls are rejected', () => {
  assert.throws(() => rangeFor('P5-P2', false), /inverted/);
  assert.throws(() => rangeFor('O4', false), /use P<lo>-P<hi>/);
  assert.throws(() => rangeFor('X4.5', false), /use P<lo>-P<hi>/);
});

test('modelLine rebuilds the MODELS band and prices from stored fields', () => {
  assert.deepEqual(modelLine({ entityId: 'leclerc', entityKind: 'driver', ouLine: 4.5, withProbability: 0.67, againstProbability: 0.33 }),
    { predictedLo: 3, predictedHi: 6, line: 5, withOdds: 1.43, againstOdds: 2.89 });
  assert.deepEqual(modelLine({ entityId: 'mercedes', entityKind: 'constructor', ouLine: 7, withProbability: 0.72, againstProbability: 0.28 }),
    { predictedLo: 4, predictedHi: 10, line: 7, withOdds: 1.33, againstOdds: 3.41 });
  assert.throws(() => modelLine({ entityId: 'x', entityKind: 'driver', withProbability: 0.5 }), /no ouLine/);
});
