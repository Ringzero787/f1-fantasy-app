/**
 * Verifying an App Store signed transaction (F-060).
 *
 * StoreKit 2 hands the app a JWS: a header naming the signing certificate chain, a payload with
 * the transaction, and a signature. The old `verifyReceipt` endpoint cannot check one, and Apple
 * has deprecated it, so the transaction is verified here instead.
 *
 * The check is the chain, not the payload. Anyone can write a payload; only Apple can produce one
 * signed by a certificate that chains to the Apple Root CA embedded below. So: every certificate
 * in the chain must be signed by the next one, the last must be exactly Apple's root, all must be
 * in date, and the leaf's key must sign the header and payload that were actually sent.
 *
 * Pure and dependency-free, so every rejection path is unit-tested without a network or a store.
 */
import { X509Certificate, verify as verifySignature } from 'crypto';

/**
 * Apple Root CA - G3, from https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
 * SHA-256: 63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79
 * Pinned on purpose: a chain that ends anywhere else is not from Apple, whatever it claims.
 */
export const APPLE_ROOT_CA_G3 = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`;

/** The fields of a signed transaction this code cares about. Apple sends many more. */
export interface AppleTransaction {
  bundleId?: string;
  productId?: string;
  transactionId?: string;
  originalTransactionId?: string;
  purchaseDate?: number;
  revocationDate?: number;
  revocationReason?: number;
  environment?: string;
  type?: string;
}

/**
 * Apple marks the certificates in this chain with its own extensions. Checking only that a chain
 * ends at Apple's root would accept any certificate Apple has ever signed, for anything; these say
 * "this is the App Store transaction signing chain" specifically.
 *
 * DER encodings of 1.2.840.113635.100.6.11.1 (App Store server signing, on the leaf) and
 * 1.2.840.113635.100.6.2.1 (Worldwide Developer Relations, on the intermediate).
 */
const OID_APP_STORE_SIGNING = Buffer.from('060a2a864886f76364060b01', 'hex');
const OID_WWDR = Buffer.from('060a2a864886f76364060201', 'hex');

/** Node exposes no extension reader, so the encoded OID is looked for in the certificate itself. */
const hasExtension = (cert: X509Certificate, oid: Buffer): boolean => cert.raw.includes(oid);

export type VerifyResult =
  | { valid: true; transaction: AppleTransaction }
  | { valid: false; error: string };

const b64url = (s: string): Buffer => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/**
 * Verify a JWS signed transaction and return its payload.
 *
 * `now` is injected so expiry is testable. `expectedBundleId` and `expectedProductId` are checked
 * here rather than by the caller: a valid signature on somebody else's transaction is still not a
 * purchase of this product in this app.
 */
export function verifyAppleTransaction(
  jws: string,
  opts: { expectedBundleId: string; expectedProductId: string; now?: Date; rootCa?: string }
): VerifyResult {
  const now = opts.now ?? new Date();
  const parts = typeof jws === 'string' ? jws.split('.') : [];
  if (parts.length !== 3) return { valid: false, error: 'not a JWS' };
  const [rawHeader, rawPayload, rawSignature] = parts;

  let header: { alg?: string; x5c?: unknown };
  try {
    header = JSON.parse(b64url(rawHeader).toString('utf8'));
  } catch {
    return { valid: false, error: 'unreadable header' };
  }
  // ES256 only. Anything else, including "none", is refused rather than interpreted.
  if (header.alg !== 'ES256') return { valid: false, error: `unexpected algorithm ${String(header.alg)}` };
  const x5c = header.x5c;
  if (!Array.isArray(x5c) || x5c.length < 2 || !x5c.every((c) => typeof c === 'string')) {
    return { valid: false, error: 'missing certificate chain' };
  }

  let chain: X509Certificate[];
  try {
    chain = (x5c as string[]).map((c) => new X509Certificate(Buffer.from(c, 'base64')));
  } catch {
    return { valid: false, error: 'unreadable certificate chain' };
  }

  // Every certificate must be in date at the time of checking.
  for (const cert of chain) {
    if (new Date(cert.validFrom) > now || new Date(cert.validTo) < now) {
      return { valid: false, error: 'certificate outside its validity period' };
    }
  }

  // Each certificate must be issued and signed by the next one up.
  for (let i = 0; i < chain.length - 1; i += 1) {
    const child = chain[i], parent = chain[i + 1];
    if (!child.checkIssued(parent) || !child.verify(parent.publicKey)) {
      return { valid: false, error: 'broken certificate chain' };
    }
  }

  // The chain has to end at Apple's root, compared by raw bytes rather than by name.
  const root = new X509Certificate(opts.rootCa ?? APPLE_ROOT_CA_G3);
  if (!chain[chain.length - 1].raw.equals(root.raw)) return { valid: false, error: 'chain does not end at the Apple root' };

  // And it has to be the App Store signing chain, not merely something Apple signed once.
  if (!hasExtension(chain[0], OID_APP_STORE_SIGNING)) return { valid: false, error: 'leaf is not an App Store signing certificate' };
  if (!chain.slice(1, -1).some((c) => hasExtension(c, OID_WWDR))) return { valid: false, error: 'chain has no Apple developer relations intermediate' };

  // Finally the signature over exactly what was sent.
  const signed = Buffer.from(`${rawHeader}.${rawPayload}`, 'utf8');
  const ok = verifySignature('sha256', signed, { key: chain[0].publicKey, dsaEncoding: 'ieee-p1363' }, b64url(rawSignature));
  if (!ok) return { valid: false, error: 'signature does not match' };

  let transaction: AppleTransaction;
  try {
    transaction = JSON.parse(b64url(rawPayload).toString('utf8'));
  } catch {
    return { valid: false, error: 'unreadable payload' };
  }

  if (transaction.bundleId !== opts.expectedBundleId) return { valid: false, error: `transaction is for ${String(transaction.bundleId)}` };
  if (transaction.productId !== opts.expectedProductId) return { valid: false, error: `transaction is for ${String(transaction.productId)}` };
  if (typeof transaction.revocationDate === 'number') return { valid: false, error: 'purchase was refunded or revoked' };

  return { valid: true, transaction };
}
