import { PRICING_CONFIG } from '../config/pricing.config';

// V6: Calculate early termination fee for breaking a driver contract early
// Fee is based on current market price so it scales with the driver's actual value
export function calculateEarlyTerminationFee(
  currentPrice: number,
  contractLength: number,
  racesHeld: number
): number {
  const racesRemaining = Math.max(0, contractLength - racesHeld);
  return Math.floor(currentPrice * PRICING_CONFIG.EARLY_TERMINATION_RATE * racesRemaining);
}

/**
 * Client-side estimate of sale proceeds — MUST mirror quoteSale() in
 * functions/src/teams/teamOperations.ts exactly (3%/race remaining, floor,
 * waived during the grace period and for reserve picks). Used for confirm
 * dialogs and affordability checks so the number shown matches the number the
 * server charges. The server remains authoritative at execution time.
 */
export function estimateSaleQuote(
  entity: {
    currentPrice: number;
    contractLength?: number;
    racesHeld?: number;
    isReservePick?: boolean;
  },
  marketPrice?: number,
): { marketPrice: number; earlyTermFee: number; saleReturn: number; feeWaived: boolean } {
  const price = marketPrice ?? entity.currentPrice;
  const racesHeld = entity.racesHeld || 0;
  const contractLength = entity.contractLength || PRICING_CONFIG.CONTRACT_LENGTH;
  const racesLeft = contractLength - racesHeld;
  const feeWaived = racesHeld === 0 || entity.isReservePick === true || racesLeft <= 0;
  const earlyTermFee = feeWaived ? 0 : calculateEarlyTerminationFee(price, contractLength, racesHeld);
  return { marketPrice: price, earlyTermFee, saleReturn: price - earlyTermFee, feeWaived };
}
