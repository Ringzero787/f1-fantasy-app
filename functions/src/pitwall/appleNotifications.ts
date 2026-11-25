/**
 * App Store Server Notifications v2 (F-175 slice 5): the StoreKit 2 refund signal.
 *
 * The daily refund sweep can re-check Play, Amazon and legacy Apple receipts, but not a StoreKit 2
 * signed transaction (refundCheck.checkable): Apple's only re-check for those is the App Store
 * Server API, which needs an In-App Purchase key this project does not hold. So a refunded App Store
 * pass or charter stayed live until the season ended. Apple pushes a REFUND (or a Family Sharing
 * REVOKE) notification instead, as a JWS signed by the same App Store chain as a transaction, so it
 * needs no secret: the chain check in appleTransaction.ts is the authentication.
 *
 * The sweep's warning still holds (refundSweep.ts header): a push endpoint can be misconfigured
 * silently. The console step and a sandbox refund that proves it are in docs/store/charter-setup.md.
 *
 * Pure: `appleNotificationAction` decides; the handler in index.ts acts through refundApply.ts.
 */
import { verifyAppleJws } from '../purchases/appleTransaction';

/** Types that mean "the money went back": take back what the purchase paid for. */
const REFUND_TYPES = new Set(['REFUND', 'REVOKE']);

export type AppleNotificationAction =
  | { kind: 'refund'; transactionId: string; productId: string; environment: string; type: string; uuid: string }
  /** Signed by Apple but nothing to do. `loud` asks for an error-level log (a person must act). */
  | { kind: 'ignore'; why: string; loud?: boolean }
  /** Not a genuine notification for this app. */
  | { kind: 'reject'; why: string };

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export function appleNotificationAction(
  signedPayload: unknown,
  opts: { bundleId: string; now?: Date; rootCa?: string },
): AppleNotificationAction {
  if (typeof signedPayload !== 'string' || !signedPayload) return { kind: 'reject', why: 'no signedPayload' };
  const outer = verifyAppleJws(signedPayload, opts);
  if (!outer.valid) return { kind: 'reject', why: `notification: ${outer.error}` };
  const n = outer.payload;
  const data = (n.data && typeof n.data === 'object' ? n.data : {}) as Record<string, unknown>;
  const type = str(n.notificationType);
  const uuid = str(n.notificationUUID);
  // A summary notification (mass refunds) has no `data`; the bundle check covers it.
  if (str(data.bundleId) !== opts.bundleId) return { kind: 'reject', why: `notification is for ${str(data.bundleId) || '(no bundle)'}` };

  if (type === 'REFUND_REVERSED') {
    // Apple took a refund back. Nothing re-grants automatically, and the support op will not re-apply a
    // refunded purchase (by design: a replay must never undo a refund). A person decides: a pass by
    // pitwallPass.js grant; a charter by a fresh support grant (charter-setup.md, REFUND_REVERSED).
    return { kind: 'ignore', why: `REFUND_REVERSED ${uuid}: the buyer paid again; needs a manual re-grant (charter-setup.md)`, loud: true };
  }
  if (!REFUND_TYPES.has(type)) return { kind: 'ignore', why: `${type || '(no type)'}${n.subtype ? `/${str(n.subtype)}` : ''}` };

  const inner = verifyAppleJws(str(data.signedTransactionInfo), opts);
  if (!inner.valid) return { kind: 'reject', why: `transaction: ${inner.error}` };
  const t = inner.payload;
  if (str(t.bundleId) !== opts.bundleId) return { kind: 'reject', why: `transaction is for ${str(t.bundleId) || '(no bundle)'}` };
  const transactionId = str(t.transactionId);
  if (!transactionId) return { kind: 'ignore', why: `${type} without a transaction id`, loud: true };
  return { kind: 'refund', transactionId, productId: str(t.productId), environment: str(t.environment) || str(data.environment), type, uuid };
}
