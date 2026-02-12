import * as admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp();

// Export all functions
export * from './scoring/calculatePoints';
export * from './pricing/updatePrices';
export * from './locks/teamLocks';
export * from './admin/setAdminClaim';
export * from './news/fetchNews';
export * from './invites/sendInviteEmail';
