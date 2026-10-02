/**
 * The Apple web sign-in handoff rules (F-091).
 *
 * Both ends of this flow are unauthenticated: Apple's POST on one side and a device mid-sign-in on
 * the other. The `state` becomes a Firestore document id and the deep link is built by hand, so
 * these are the checks that keep a hostile POST from choosing either.
 */
import { isSha256Hex, looksLikeJwt, appleDisplayName, appleDeepLink } from '../../functions/src/auth/handoffGuards';

describe('isSha256Hex', () => {
  const good = 'a'.repeat(64);
  it('accepts exactly 64 lowercase hex characters', () => {
    expect(isSha256Hex(good)).toBe(true);
    expect(isSha256Hex('0123456789abcdef'.repeat(4))).toBe(true);
  });
  it('rejects anything that could steer a document path or a redirect', () => {
    expect(isSha256Hex('A'.repeat(64))).toBe(false);           // uppercase is not what we emit
    expect(isSha256Hex('a'.repeat(63))).toBe(false);
    expect(isSha256Hex('a'.repeat(65))).toBe(false);
    expect(isSha256Hex('../' + 'a'.repeat(61))).toBe(false);   // path traversal
    expect(isSha256Hex(good + '/x')).toBe(false);
    expect(isSha256Hex(good + '&error=')).toBe(false);         // redirect injection
    expect(isSha256Hex('')).toBe(false);
    expect(isSha256Hex(null)).toBe(false);
    expect(isSha256Hex(undefined)).toBe(false);
    expect(isSha256Hex(123)).toBe(false);
    expect(isSha256Hex({ toString: () => good })).toBe(false);
  });
});

describe('looksLikeJwt', () => {
  it('accepts a three-part base64url token', () => {
    expect(looksLikeJwt('eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln-_bmF0dXJl')).toBe(true);
  });
  it('rejects the wrong shape, an empty value and anything oversized', () => {
    expect(looksLikeJwt('')).toBe(false);
    expect(looksLikeJwt('one.two')).toBe(false);
    expect(looksLikeJwt('one.two.three.four')).toBe(false);
    expect(looksLikeJwt('has spaces.in.it')).toBe(false);
    expect(looksLikeJwt('a.b.c\n')).toBe(false);
    expect(looksLikeJwt(`${'a'.repeat(8192)}.b.c`)).toBe(false);
    expect(looksLikeJwt(null)).toBe(false);
  });
  it('does not pretend to verify the token', () => {
    // The signature, audience and nonce are Firebase Auth's to check when the app presents this as
    // an apple.com credential. This is a shape test and the comment above it says so.
    expect(looksLikeJwt('aaa.bbb.ccc')).toBe(true);
  });
});

describe('appleDisplayName', () => {
  it('reads the name Apple sends on first consent', () => {
    expect(appleDisplayName('{"name":{"firstName":"Ada","lastName":"Lovelace"}}')).toBe('Ada Lovelace');
    expect(appleDisplayName('{"name":{"firstName":"Ada"}}')).toBe('Ada');
    expect(appleDisplayName('{"name":{"lastName":"Lovelace"}}')).toBe('Lovelace');
  });
  it('gives up quietly rather than failing the sign-in', () => {
    expect(appleDisplayName('not json')).toBeNull();
    expect(appleDisplayName('{}')).toBeNull();
    expect(appleDisplayName('{"name":{}}')).toBeNull();
    expect(appleDisplayName('{"name":{"firstName":"   "}}')).toBeNull();
    expect(appleDisplayName('{"name":{"firstName":42}}')).toBeNull();
    expect(appleDisplayName('null')).toBeNull();
    expect(appleDisplayName(undefined)).toBeNull();
    expect(appleDisplayName({ name: { firstName: 'Ada' } })).toBeNull();  // Apple sends a string
    expect(appleDisplayName(`{"name":{"firstName":"${'x'.repeat(4000)}"}}`)).toBeNull();
  });
  it('caps a long name instead of storing it whole', () => {
    expect(appleDisplayName(`{"name":{"firstName":"${'x'.repeat(300)}"}}`)).toHaveLength(120);
  });
});

describe('appleDeepLink', () => {
  const state = 'b'.repeat(64);
  it('carries the state and never the token', () => {
    expect(appleDeepLink(state)).toBe(`theundercut://auth/apple?state=${state}`);
    expect(appleDeepLink(state)).not.toContain('id_token');
  });
  it('tells a cancellation apart from a failure', () => {
    expect(appleDeepLink(state, 'user_cancelled_authorize')).toBe(`theundercut://auth/apple?state=${state}&error=cancelled`);
    expect(appleDeepLink(state, 'invalid_client')).toBe(`theundercut://auth/apple?state=${state}&error=failed`);
  });
  it('never lets Apple choose what goes in the link', () => {
    // The error comes from an unauthenticated POST, so it is collapsed to one of two words rather
    // than echoed — otherwise `&error=x&id_token=…` would be Apple's (or anyone's) to write.
    expect(appleDeepLink(state, '&foo=bar')).toBe(`theundercut://auth/apple?state=${state}&error=failed`);
    expect(appleDeepLink(state, 123)).toBe(`theundercut://auth/apple?state=${state}`);
    expect(appleDeepLink(state, '')).toBe(`theundercut://auth/apple?state=${state}`);
  });
});
