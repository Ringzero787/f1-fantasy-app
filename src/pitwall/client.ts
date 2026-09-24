/**
 * The two Pit Wall reads the app makes (F-077). Everything that touches Firebase lives here, so
 * the rules in `pass.ts` and the shape handling in `projections.ts` stay testable on their own.
 *
 * Both fail closed and quietly. Without a pass the Firestore rules refuse the page document, which
 * is the expected case for most users, not an error to report.
 */
import { db, firebaseAuth, functions, httpsCallable } from '../config/firebase';
import { handoffUrl, PORTAL_URL } from './openPortal';
import { NO_PASS, passFromClaims, type PassState } from './pass';
import { toProjectionSet, type ProjectionSet } from './projections';

/**
 * The pass on the signed-in user's token. `force` refreshes it, which is what picks up a purchase
 * made on the web moments ago; without it a cached token can be up to an hour stale.
 */
export async function loadPass(force = false): Promise<PassState> {
  const user = firebaseAuth.currentUser;
  if (!user) return NO_PASS;
  try {
    const token = await user.getIdTokenResult(force);
    return passFromClaims(token.claims as Record<string, unknown>, Date.now());
  } catch {
    return NO_PASS;
  }
}

/**
 * The newest published page, or null when there is none or the rules refuse it. Ordered by `asOf`
 * because document ids sort as text ("2026_9" after "2026_17") and a season rolls over.
 */
export async function loadProjections(): Promise<ProjectionSet | null> {
  try {
    const { collection, query, orderBy, limit, getDocs } = await import('firebase/firestore');
    const snap = await getDocs(query(collection(db, 'pw_pages'), orderBy('asOf', 'desc'), limit(1)));
    const first = snap.docs[0];
    return first ? toProjectionSet(first.data() as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * A single-use sign-in link for this device's account, or the plain portal address when the
 * handoff is unavailable (offline, rate limited, an older deployment). The portal's own sign-in
 * still works, so a failure here is an inconvenience rather than a dead end.
 */
export async function portalUrl(src = 'profile', base = PORTAL_URL): Promise<string> {
  try {
    const create = httpsCallable<{ src: string }, { code?: string }>(functions, 'pw-createPortalHandoff');
    const res = await create({ src });
    const code = res.data?.code;
    return typeof code === 'string' && code.length > 0 ? handoffUrl(code, src, base) : base;
  } catch {
    return base;
  }
}
