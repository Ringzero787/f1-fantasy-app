import * as admin from 'firebase-admin';

// Initialize Admin SDK once for the codebase.
admin.initializeApp();

export { tlOnRaceCompleted } from './triggers/onRaceCompleted';
export { tlSettleWeekend } from './triggers/settleWeekend';
export { tlSeedRaces } from './triggers/seedRaces';
export { tlBackfillBenLines } from './triggers/backfillBenLines';
export { tlGenerateBenLinesLite } from './triggers/generateBenLinesLite';
export { tlValidatePurchase } from './purchases/validatePurchase';
export {
  tlAppleSubscriptionWebhook,
  tlGoogleSubscriptionWebhook,
} from './purchases/webhooks';
