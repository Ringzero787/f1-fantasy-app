/**
 * Whose rate-limit bucket a sign-in request lands in (F-094).
 *
 * These functions run on Cloud Run behind a Hosting rewrite, where `req.ip` is a Google frontend
 * address — the same one for everybody. Keyed on that, "ten sign-ins a minute each" silently became
 * "ten a minute in total", shared across Apple, Amazon and Google, and eleven requests from anywhere
 * would have locked the world out of signing in.
 */
import { callerIp } from '../../functions/src/auth/callerIp';

describe('callerIp', () => {
  it('takes the entry before the last, which is the one our frontend wrote', () => {
    expect(callerIp({ headers: { 'x-forwarded-for': '203.0.113.7, 130.211.0.1' }, ip: '169.254.1.1' })).toBe('203.0.113.7');
  });

  it('is not the left-most entry — that is the half the caller writes', () => {
    // These are the cases that tell the two rules apart. With only two hops they agree, so a test
    // that used nothing longer would pass just as happily if this regressed to `[0]` — which is how
    // the first version of this went out.
    expect(callerIp({ headers: { 'x-forwarded-for': 'attacker-wrote-this, 203.0.113.7, 130.211.0.1' } })).toBe('203.0.113.7');
    expect(callerIp({ headers: { 'x-forwarded-for': 'a, b, c, 203.0.113.7, 130.211.0.1' } })).toBe('203.0.113.7');
    // Rotating the part they control no longer buys a new bucket.
    const bucket = (prefix: string) => callerIp({ headers: { 'x-forwarded-for': `${prefix}, 203.0.113.7, 130.211.0.1` } });
    expect(new Set([bucket('one'), bucket('two'), bucket('three')]).size).toBe(1);
  });

  it('uses the only entry when there is no chain', () => {
    expect(callerIp({ headers: { 'x-forwarded-for': ' 203.0.113.7 ' }, ip: '169.254.1.1' })).toBe('203.0.113.7');
  });

  it('ignores empty hops rather than letting them shift the position', () => {
    // `a,,203.0.113.7, 130.211.0.1` must not resolve to the empty string.
    expect(callerIp({ headers: { 'x-forwarded-for': 'a,,203.0.113.7, 130.211.0.1' } })).toBe('203.0.113.7');
    expect(callerIp({ headers: { 'x-forwarded-for': ',,' }, ip: 'fallback' })).toBe('fallback');
  });

  it('falls back to the socket peer when nothing forwarded it', () => {
    expect(callerIp({ headers: {}, ip: '198.51.100.9' })).toBe('198.51.100.9');
    expect(callerIp({ ip: '198.51.100.9' })).toBe('198.51.100.9');
  });

  it('survives whatever shape the header arrives in', () => {
    expect(callerIp({ headers: { 'x-forwarded-for': ['203.0.113.7', 'x'] }, ip: 'fallback' })).toBe('203.0.113.7');
    expect(callerIp({ headers: { 'x-forwarded-for': '' }, ip: 'fallback' })).toBe('fallback');
    expect(callerIp({ headers: { 'x-forwarded-for': '   ' }, ip: 'fallback' })).toBe('fallback');
    expect(callerIp({ headers: { 'x-forwarded-for': 42 as unknown as string }, ip: 'fallback' })).toBe('fallback');
    expect(callerIp(undefined)).toBeUndefined();
  });

  it('caps the value, because the header is written by the caller', () => {
    // It is hashed into a document id downstream; a caller should not get to choose how long it is.
    expect(callerIp({ headers: { 'x-forwarded-for': 'z'.repeat(500) } })).toHaveLength(64);
  });

  it('is a rate-limit key and not an identity', () => {
    // With one trusted hop appending, the entry before the last is ours. Assume two and a caller
    // could still land their own text here — which is why a global ceiling sits beside this one
    // rather than this being the only brake (see GLOBAL_FILE_LIMIT).
    expect(callerIp({ headers: { 'x-forwarded-for': 'made.up, 203.0.113.7' } })).toBe('made.up');
  });
});
