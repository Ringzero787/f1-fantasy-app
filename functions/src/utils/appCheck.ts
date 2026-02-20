import * as functions from 'firebase-functions';

/**
 * Log a warning if the caller did not include a valid App Check token.
 * Phase 1: warn only — does NOT reject the request.
 * Phase 2: uncomment the throw to enforce.
 */
export function warnIfNoAppCheck(
  context: functions.https.CallableContext,
  fnName: string
): void {
  if (!context.app) {
    console.warn(
      `[AppCheck] ${fnName} called without App Check token. ` +
      `uid=${context.auth?.uid ?? 'anonymous'}`
    );
    // Phase 2: Uncomment to enforce
    // throw new functions.https.HttpsError(
    //   'failed-precondition',
    //   'App Check token required'
    // );
  }
}
