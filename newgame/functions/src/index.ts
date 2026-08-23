import * as admin from 'firebase-admin';

// Initialize Admin SDK once for the codebase.
admin.initializeApp();

export { tlOnRaceCompleted } from './triggers/onRaceCompleted';
export { tlSettleWeekend } from './triggers/settleWeekend';
export { tlSeedRaces } from './triggers/seedRaces';
export { tlBackfillBenLines } from './triggers/backfillBenLines';
export { tlGenerateBenLinesLite } from './triggers/generateBenLinesLite';
export { tlValidatePurchase } from './purchases/validatePurchase';
export { tlMockPurchase, tlSelectCosmetic } from './purchases/mockPurchase';
export { tlBuyCosmeticPack } from './purchases/buyCosmeticPack';
export {
  tlAppleSubscriptionWebhook,
  tlGoogleSubscriptionWebhook,
} from './purchases/webhooks';
export { tlRequestAccountDeletion } from './users/requestAccountDeletion';

// Server-authoritative economy callables. All cash-moving operations live here
// so the client can never write tl_garages.cash directly (see firestore.rules).
export {
  tlInitialRoll,
  tlCommitRoll,
  tlBuyDriver,
  tlBuyConstructor,
  tlReleaseDriver,
  tlReleaseConstructor,
  tlChargeReroll,
} from './economy/garageCallables';
export { tlPlacePoleBet, tlPlaceLeagueBet, tlCancelBet } from './economy/betCallables';
export { tlActivateInsurance, tlDropInsurance } from './economy/insuranceCallables';
export { tlSetPick } from './economy/pickCallables';

// Scheduled reminders — nudge players who haven't picked before a race locks.
export { tlNotifyMissingPicks } from './notifications/notifyMissingPicks';
