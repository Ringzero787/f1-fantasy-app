/**
 * Standard base64 to base64url, as PKCE's S256 challenge requires: `+` and `/` are not URL-safe and
 * the `=` padding is not allowed (F-093).
 *
 * Its own file, with no imports, because the sign-in helpers next door pull in `expo-crypto` — and
 * a pure three-replacement function should be testable without a native module behind it.
 *
 * `expo-crypto` only emits standard base64, so this is the step between it and Google's token
 * endpoint, whose answer to a malformed challenge is a flat refusal to spend the authorization
 * code. That would break every Google sign-in on a Fire tablet at once, with nothing on screen to
 * say why.
 */
export const base64UrlFromBase64 = (b64: string): string =>
  b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
