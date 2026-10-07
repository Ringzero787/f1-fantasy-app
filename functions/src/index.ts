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
export * from './purchases/validatePurchase';
export { applyLeagueExpansion } from './purchases/leagueExpansion';
export * from './notifications/triggers';
export * from './notifications/incompleteTeamAlerts';
export * from './avatars/generateAvatar';
export * from './users/deleteUserData';
export * from './notifications/sendBroadcast';
export * from './ingestion/checkResults';
export * from './ingestion/syncSchedule';
export * from './ingestion/scheduleMonitor';
export * from './cache/marketCache';
export * from './teams/teamOperations';
export { checkTeamNameAvailable, renameTeam } from './teams/teamName';
// Undercut Moonshot (F-106): quote, confirm and cancel a call
export { moonshotQuote, moonshotConfirm, moonshotCancel, moonshotMenu } from './moonshot/calls';
export { onRaceCancelled } from './moonshot/settlement';
export { onFantasyTeamDeleted } from './teams/teamSnapshotsCleanup';
// Undercut Pit Wall (F-075): deployed as the `pw` group, e.g. pw-createPortalHandoff
export * as pw from './pitwall';
export { onLeagueMemberWritten, onLeagueMemberCountChanged, reconcileAllLeagueMemberCounts } from './leagues/memberCount';
export * from './auth/signInWithAmazon';
export { appleAuthRedirect, claimAppleSignIn } from './auth/appleWebSignIn';
export { amazonAuthRedirect, claimAmazonSignIn } from './auth/amazonWebSignIn';
export { googleAuthRedirect, claimGoogleSignIn } from './auth/googleWebSignIn';
export { cleanupAuthHandoffs } from './auth/cleanup';
