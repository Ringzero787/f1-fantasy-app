// Tiny CORS helper for our HTTPS onRequest endpoints. The admin page at
// humannpc.com calls these cross-origin; without these headers the browser
// blocks the POST with "Failed to fetch".
//
// Wide open (Allow-Origin: *) is safe: each endpoint requires an admin
// Firebase ID token in the Authorization header (see _adminAuth.ts), and no
// cookies or ambient credentials are involved.

import * as express from 'express';

export function applyCors(req: express.Request, res: express.Response): boolean {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Max-Age', '3600');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return true; // caller should return early
  }
  return false;
}
