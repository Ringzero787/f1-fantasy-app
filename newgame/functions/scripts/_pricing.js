// Offered decimal odds for Ben's model lines, shared by the operator scripts
// (seedFromModelsDoc, setBestBets): the fair probability plus the model's 4.7%
// hold, inverted. Capped like the functions' triggers/_odds.ts — the priced
// probability stays within [0.001, 0.99] — so a near-certain outcome still pays
// 1.01 (a correct call always returns more than the stake) and a near-impossible
// one stays finite (1000) instead of dividing by zero.

const HOLD = 1.047;
const MIN_PRICED = 0.001;
const MAX_PRICED = 0.99;

const round2 = (x) => Math.round(x * 100) / 100;

function offered(p) {
  const priced = Math.min(MAX_PRICED, Math.max(MIN_PRICED, p * HOLD));
  return round2(1 / priced);
}

module.exports = { HOLD, offered, round2 };
