// Admin gate for the operator HTTPS endpoints (tlSeedRaces, tlBackfillBenLines,
// tlGenerateBenLinesLite). Callers send `Authorization: Bearer <Firebase ID
// token>`; the token must carry the `admin` custom claim (set with
// scripts/setAdminClaim.ts) — the same check tlSettleWeekend applies to its
// callable. Replaces the old shared query-string secret, which lived in source
// and shipped inside clients.

import * as admin from 'firebase-admin';
import * as express from 'express';

// Sends 401/403 and returns false unless the request carries an admin ID token.
export async function requireAdmin(req: express.Request, res: express.Response): Promise<boolean> {
  const match = /^Bearer (.+)$/.exec(req.get('Authorization') || '');
  if (!match) {
    res.status(401).send('Unauthorized');
    return false;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(match[1]);
    if (decoded.admin === true) return true;
    res.status(403).send('Admin only');
  } catch {
    res.status(401).send('Unauthorized');
  }
  return false;
}
