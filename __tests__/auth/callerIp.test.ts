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
  it('takes the left-most forwarded entry, which is the client the frontend saw', () => {
    expect(callerIp({ headers: { 'x-forwarded-for': '203.0.113.7, 130.211.0.1' }, ip: '169.254.1.1' })).toBe('203.0.113.7');
    expect(callerIp({ headers: { 'x-forwarded-for': ' 203.0.113.7 ' }, ip: '169.254.1.1' })).toBe('203.0.113.7');
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
    // A caller can prepend entries of their own, so this is spoofable — and still strictly better
    // than a key every caller in the world shares.
    expect(callerIp({ headers: { 'x-forwarded-for': 'made.up, 203.0.113.7' } })).toBe('made.up');
  });
});
