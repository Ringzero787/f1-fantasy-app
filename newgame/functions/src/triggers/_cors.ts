// Tiny CORS helper for our HTTPS onRequest endpoints. The admin page at
// humannpc.com calls these cross-origin; without these headers the browser
// blocks the POST with "Failed to fetch".
//
// Wide open for now (Allow-Origin: *) since each endpoint is independently
// gated by a shared secret in the query string. Tighten to a specific origin
// list when the seed-secret is rotated out.

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
