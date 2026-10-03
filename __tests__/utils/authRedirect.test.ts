/**
 * Reading the redirect that ends a web sign-in (F-094).
 *
 * This is the point where an app decides a browser round trip belongs to it. It is written once and
 * used by all three providers, so a mistake here is a mistake three times.
 */
import { readAuthRedirect } from '../../src/utils/authRedirect';

const STATE = 'a'.repeat(64);
const TICKET = 'b'.repeat(64);

describe('readAuthRedirect', () => {
  it('returns the ticket from a redirect this app started', () => {
    expect(readAuthRedirect(`theundercut://auth/google?state=${STATE}&ticket=${TICKET}`, STATE)).toEqual({ ticket: TICKET });
  });

  it('refuses a redirect for a different sign-in', () => {
    // Someone else's flow, or a replay of an older one from this device.
    expect(() => readAuthRedirect(`theundercut://auth/google?state=${'c'.repeat(64)}&ticket=${TICKET}`, STATE))
      .toThrow('could not be verified');
    expect(() => readAuthRedirect(`theundercut://auth/google?ticket=${TICKET}`, STATE)).toThrow('could not be verified');
  });

  it('refuses a redirect with no usable ticket, rather than claiming without one', () => {
    // Without the ticket the claim cannot prove this app is where the redirect came back to, and
    // the server would reject it anyway — better to say so here than to make the round trip.
    expect(() => readAuthRedirect(`theundercut://auth/google?state=${STATE}`, STATE)).toThrow('could not be verified');
    expect(() => readAuthRedirect(`theundercut://auth/google?state=${STATE}&ticket=`, STATE)).toThrow('could not be verified');
    expect(() => readAuthRedirect(`theundercut://auth/google?state=${STATE}&ticket=nope`, STATE)).toThrow('could not be verified');
    expect(() => readAuthRedirect(`theundercut://auth/google?state=${STATE}&ticket=${'B'.repeat(64)}`, STATE)).toThrow('could not be verified');
  });

  it('tells a cancellation apart, because callers swallow that one', () => {
    expect(() => readAuthRedirect(`theundercut://auth/apple?state=${STATE}&error=cancelled`, STATE)).toThrow('Sign in cancelled');
    expect(() => readAuthRedirect(`theundercut://auth/apple?state=${STATE}&error=failed`, STATE)).toThrow('could not be completed');
  });

  it('checks the error before the state, so a cancel is never reported as tampering', () => {
    // The error branch carries the state back, but a person who backed out should not be told their
    // sign-in could not be verified.
    expect(() => readAuthRedirect(`theundercut://auth/apple?state=${'d'.repeat(64)}&error=cancelled`, STATE)).toThrow('Sign in cancelled');
  });

  it('does not throw on a missing or malformed url', () => {
    expect(() => readAuthRedirect(undefined, STATE)).toThrow('could not be verified');
    expect(() => readAuthRedirect('', STATE)).toThrow('could not be verified');
    expect(() => readAuthRedirect('not a url at all', STATE)).toThrow('could not be verified');
  });
});
