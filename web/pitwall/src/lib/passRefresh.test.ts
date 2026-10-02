import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * The portal reads the pass from the auth token's claims, the same value the Firestore rules read.
 * That is deliberate — the UI and the rules cannot disagree. What it does not protect against is
 * both being stale: a pass bought in the app is written server-side and stamped onto the claim by a
 * trigger, and the browser knows nothing about it. It keeps the ID token it already had.
 *
 * That is what happened on the first real purchase. The app showed the pass, the portal showed none
 * for up to an hour, and the rules refused the paid document for exactly as long. A static check,
 * because the bug was a boolean and rendering the whole app to catch one is not worth it.
 */
const app = fs.readFileSync(path.join(__dirname, '..', 'App.tsx'), 'utf8');

describe('picking up a pass bought elsewhere', () => {
  it('forces a token refresh on sign-in, not only when returning from checkout', () => {
    const effect = app.slice(app.indexOf('const paid = new URLSearchParams'), app.indexOf('}, [refreshPass]);'));
    expect(effect).toMatch(/refreshPass\(true\)/);
    // `refreshPass(paid)` was the bug: a purchase made anywhere but Stripe never set that flag.
    expect(effect).not.toMatch(/refreshPass\(paid\)/);
  });

  it('still clears the checkout marker out of the address bar', () => {
    expect(app).toMatch(/if \(paid\) window\.history\.replaceState/);
  });

  it('reads the pass from the claim rather than a document, so the rules cannot disagree', () => {
    expect(app).toMatch(/getIdTokenResult\(force\)/);
    expect(app).toMatch(/passFromClaims\(/);
  });
});
