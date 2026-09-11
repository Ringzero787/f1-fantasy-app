// Admin gate for the operator HTTPS endpoints (tlSeedRaces, tlBackfillBenLines,
// tlGenerateBenLinesLite). Callers send `Authorization: Bearer <Firebase ID
// token>`; the token must carry the `admin` custom claim (set with
// scripts/setAdminClaim.ts) — the same check tlSettleWeekend applies to its
// callable. Replaces the old shared query-string secret, which lived in source
// and shipped inside clients.

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import * as express from 'express';

// Sends 401/403 and returns false unless the request carries an admin ID token.
// Revocation is checked too: a pulled admin or revoked session is refused
// immediately, not when its token expires up to an hour later.
export async function requireAdmin(req: express.Request, res: express.Response): Promise<boolean> {
  const match = /^Bearer\s+(\S+)$/i.exec(req.get('Authorization') || '');
  if (!match) {
    functions.logger.warn('operator endpoint: no bearer token', { path: req.path });
    res.status(401).send('Unauthorized');
    return false;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(match[1], true);
    if (decoded.admin === true) {
      functions.logger.info('operator endpoint: admin call', { path: req.path, uid: decoded.uid, query: req.query });
      return true;
    }
    functions.logger.warn('operator endpoint: non-admin token', { path: req.path, uid: decoded.uid });
    res.status(403).send('Admin only');
  } catch {
    functions.logger.warn('operator endpoint: invalid or revoked token', { path: req.path });
    res.status(401).send('Unauthorized');
  }
  return false;
}
