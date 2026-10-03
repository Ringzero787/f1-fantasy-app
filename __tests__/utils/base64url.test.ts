/**
 * base64url for PKCE (F-093).
 *
 * `expo-crypto` only emits standard base64, and Google's token endpoint answers a malformed
 * `code_challenge` by refusing to spend the authorization code — which would break every Google
 * sign-in on a Fire tablet at once, with nothing in the app to say why. It is three replacements
 * and it is worth pinning.
 */
import { base64UrlFromBase64 } from '../../src/utils/base64url';

describe('base64UrlFromBase64', () => {
  it('swaps the two characters that are not URL-safe', () => {
    expect(base64UrlFromBase64('ab+cd/ef')).toBe('ab-cd_ef');
    expect(base64UrlFromBase64('+/+/')).toBe('-_-_');   // in place, not grouped
  });

  it('strips the padding, which base64url does not allow', () => {
    expect(base64UrlFromBase64('abcd==')).toBe('abcd');
    expect(base64UrlFromBase64('abcde=')).toBe('abcde');
    // Only trailing padding: an `=` is not legal mid-string, and stripping one there would corrupt
    // a value rather than fix it.
    expect(base64UrlFromBase64('ab=cd')).toBe('ab=cd');
  });

  it('leaves an already-safe string alone', () => {
    expect(base64UrlFromBase64('AZaz09-_')).toBe('AZaz09-_');
    expect(base64UrlFromBase64('')).toBe('');
  });

  it('handles a real SHA-256 digest, which is where the padding comes from', () => {
    // 32 bytes of base64 is 44 characters with one '=' of padding — the shape every PKCE
    // challenge has, so the padding branch is on the hot path and not an edge case.
    const digest = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw/48=';
    expect(base64UrlFromBase64(digest)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw_48');
    expect(base64UrlFromBase64(digest)).not.toMatch(/[+/=]/);
  });
});
