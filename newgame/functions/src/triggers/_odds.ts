// Shared book pricing — converts a FAIR probability into the OFFERED decimal
// odds with the bookmaker's hold (vig) baked in.
//
// THE VIG IS THE GAME'S PRIMARY CASH SINK. Fair odds (1/p, zero margin) make
// betting break-even in expectation, so the virtual economy only inflates. By
// pricing each side's probability up by BOOK_VIG before inverting, winners are
// paid at shorter-than-fair odds: on balanced action across with/against the
// house keeps ~BOOK_VIG/(1+BOOK_VIG) of total stake every weekend, and that
// cash is never created — it drains the player pool in proportion to betting
// volume so bankrolls don't run away.
//
// Used by both the live line generator (generateBenLinesLite) and the actuals
// backfill (backfillBenLines) so historical and future lines price identically.

// 5% overround → ~4.76% house margin (≈ the legacy 1.91/1.91 convention).
export const BOOK_VIG = 0.05;

// Fair probability of an outcome → offered decimal odds (gross payout = stake ×
// odds, stake included). The fair prob is multiplied by (1 + BOOK_VIG) to add
// the hold, then inverted. Clamped so extreme lines stay sane.
export function offeredOddsFromFairProb(fairProb: number): number {
  const priced = Math.min(0.99, Math.max(0.001, fairProb * (1 + BOOK_VIG)));
  return Math.round((1 / priced) * 100) / 100;
}
