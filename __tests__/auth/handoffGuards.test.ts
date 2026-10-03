/**
 * The Apple web sign-in handoff rules (F-091).
 *
 * Both ends of this flow are unauthenticated: Apple's POST on one side and a device mid-sign-in on
 * the other. The `state` becomes a Firestore document id and the deep link is built by hand, so
 * these are the checks that keep a hostile POST from choosing either.
 */
import { isSha256Hex, looksLikeJwt, appleDisplayName, appleDeepLink, handoffDeepLink, looksLikeAuthCode, looksLikeGoogleAuthCode, hashTicket, ticketMatches } from '../../functions/src/auth/handoffGuards';

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
    // Assembled rather than written out: a literal header.payload.signature string here is a
    // real JWT as far as a secret scanner is concerned, and G05 fails the build on one.
    const token = ['hdr-AbC_123', 'payload-DeF_456', 'sig-GhI_789'].join('.');
    expect(looksLikeJwt(token)).toBe(true);
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
  const ticket = 'c'.repeat(64);
  it('carries the state and the ticket, and never the token', () => {
    expect(appleDeepLink(state, undefined, ticket)).toBe(`theundercut://auth/apple?state=${state}&ticket=${ticket}`);
    expect(appleDeepLink(state, undefined, ticket)).not.toContain('id_token');
  });
  it('omits the ticket when there is none, rather than sending an empty one', () => {
    expect(appleDeepLink(state)).toBe(`theundercut://auth/apple?state=${state}`);
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

describe('looksLikeAuthCode', () => {
  it('accepts an Amazon authorization code', () => {
    expect(looksLikeAuthCode('ANgMjpLnmNQIHRGEzjkG')).toBe(true);
    expect(looksLikeAuthCode('a-b_c.d~e')).toBe(true);
  });
  it('rejects anything that could steer a redirect or a path', () => {
    expect(looksLikeAuthCode('')).toBe(false);
    expect(looksLikeAuthCode('code&state=x')).toBe(false);
    expect(looksLikeAuthCode('../../etc/passwd')).toBe(false);
    expect(looksLikeAuthCode('has space')).toBe(false);
    expect(looksLikeAuthCode('a'.repeat(513))).toBe(false);
    expect(looksLikeAuthCode(null)).toBe(false);
    expect(looksLikeAuthCode(42)).toBe(false);
  });
});

describe('looksLikeGoogleAuthCode', () => {
  it('accepts a Google authorization code, which contains slashes', () => {
    // The Amazon shape rejects these, which is why Google has its own: 4/0Ab... is the usual form.
    expect(looksLikeGoogleAuthCode('4/0AbCD-efGH_ijKL.mnOP~qrST')).toBe(true);
    expect(looksLikeAuthCode('4/0AbCD-efGH')).toBe(false);
  });
  it('still rejects anything that could steer a redirect or a request', () => {
    expect(looksLikeGoogleAuthCode('')).toBe(false);
    expect(looksLikeGoogleAuthCode('code&client_secret=x')).toBe(false);
    expect(looksLikeGoogleAuthCode('has space')).toBe(false);
    expect(looksLikeGoogleAuthCode('a'.repeat(513))).toBe(false);
    expect(looksLikeGoogleAuthCode(null)).toBe(false);
    expect(looksLikeGoogleAuthCode(42)).toBe(false);
  });
  it('is never used as a document id, which is why a slash is allowed at all', () => {
    // The state is the document id and stays strict hex; the code is only ever a field and a POST
    // body parameter. A slash in a Firestore id would split the path.
    expect(isSha256Hex('4/0AbCD')).toBe(false);
  });
});

describe('handoffDeepLink', () => {
  const state = 'e'.repeat(64);
  const ticket = 'f'.repeat(64);

  it('builds the same link for every provider, differing only in the path', () => {
    for (const p of ['apple', 'amazon', 'google'] as const) {
      expect(handoffDeepLink(p, state, { ticket })).toBe(`theundercut://auth/${p}?state=${state}&ticket=${ticket}`);
    }
  });

  it('never carries a ticket alongside an error', () => {
    // There is nothing to claim when the flow failed, and a ticket on a failure would be a value
    // handed out for no reason.
    const link = handoffDeepLink('google', state, { ticket, error: 'boom' });
    expect(link).not.toContain('ticket');
    expect(link).toBe(`theundercut://auth/google?state=${state}&error=failed`);
  });

  it('reports a cancellation only for that provider\u2019s own word for it', () => {
    expect(handoffDeepLink('apple', state, { error: 'user_cancelled_authorize', cancelCode: 'user_cancelled_authorize' }))
      .toBe(`theundercut://auth/apple?state=${state}&error=cancelled`);
    expect(handoffDeepLink('google', state, { error: 'access_denied', cancelCode: 'access_denied' }))
      .toBe(`theundercut://auth/google?state=${state}&error=cancelled`);
    // Apple's word on Google's flow is not a cancellation, and vice versa.
    expect(handoffDeepLink('google', state, { error: 'user_cancelled_authorize', cancelCode: 'access_denied' }))
      .toBe(`theundercut://auth/google?state=${state}&error=failed`);
  });

  it('never lets a provider choose what goes in the link', () => {
    // The error arrives on an unauthenticated request, so it is collapsed to one of two words
    // rather than echoed — otherwise `&ticket=…` would be theirs to write.
    expect(handoffDeepLink('amazon', state, { error: '&ticket=stolen' }))
      .toBe(`theundercut://auth/amazon?state=${state}&error=failed`);
    expect(handoffDeepLink('amazon', state, { error: 42 })).toBe(`theundercut://auth/amazon?state=${state}`);
  });
});

describe('ticketMatches', () => {
  const ticket = 'a1b2c3d4'.repeat(8);                       // 64 hex
  const record = { ticketHash: hashTicket(ticket) };

  it('accepts the ticket the record was filed with', () => {
    expect(ticketMatches(record, ticket)).toBe(true);
  });

  it('refuses any other ticket — this is the whole binding', () => {
    // The attack this exists for: someone who chose the verifier, and so knows the state, still
    // cannot produce the ticket, because it only ever went out on the redirect to the other device.
    expect(ticketMatches(record, 'b'.repeat(64))).toBe(false);
    expect(ticketMatches(record, ticket.slice(0, 63) + '0')).toBe(false);
  });

  it('refuses a ticket of the wrong shape rather than comparing it', () => {
    expect(ticketMatches(record, '')).toBe(false);
    expect(ticketMatches(record, ticket.toUpperCase())).toBe(false);
    expect(ticketMatches(record, null)).toBe(false);
    expect(ticketMatches(record, undefined)).toBe(false);
    expect(ticketMatches(record, 42)).toBe(false);
    expect(ticketMatches(record, { toString: () => ticket })).toBe(false);
  });

  it('refuses a record with no ticket at all, which is the upgrade case', () => {
    // Anything filed by the previous version is unclaimable rather than claimable-without-a-ticket.
    // Those records are ten minutes from expiry; the alternative is a window where the binding does
    // not apply, which is the wrong way round.
    expect(ticketMatches({}, ticket)).toBe(false);
    expect(ticketMatches({ ticketHash: undefined }, ticket)).toBe(false);
    expect(ticketMatches({ ticketHash: 123 as unknown as string }, ticket)).toBe(false);
    expect(ticketMatches(undefined, ticket)).toBe(false);
    expect(ticketMatches(null, ticket)).toBe(false);
  });

  it('never stores what it compares', () => {
    // The hash is what lands in Firestore; the ticket itself exists only in one redirect.
    expect(record.ticketHash).not.toBe(ticket);
    expect(record.ticketHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
